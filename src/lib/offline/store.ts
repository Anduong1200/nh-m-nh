import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from "idb";

export type OfflineContentKind = "note" | "doodle";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface OfflineDraft {
  accountId: string;
  houseId: string;
  schemaVersion: number;
  id: string;
  kind: OfflineContentKind;
  payload: JsonValue;
  version: number;
  updatedAt: string;
}

export interface DraftInput {
  houseId: string;
  schemaVersion: number;
  id: string;
  kind: OfflineContentKind;
  payload: JsonValue;
  /** null creates a draft; existing drafts require the version the editor loaded. */
  expectedVersion: number | null;
}

export interface QueuedOperation {
  accountId: string;
  houseId: string;
  schemaVersion: number;
  operationId: string;
  entityId: string;
  entity: OfflineContentKind;
  mutation: "append" | "update";
  /** Updates must carry the last authoritative server version. */
  baseVersion: number | null;
  payload: JsonValue;
  createdAt: string;
  state: "pending" | "conflict";
  conflict?: {
    local: JsonValue;
    remote: JsonValue;
    remoteVersion: number;
    detectedAt: string;
  };
}

export type OperationInput =
  | { houseId: string; schemaVersion: number; entityId: string; entity: OfflineContentKind; mutation: "append"; payload: JsonValue }
  | { houseId: string; schemaVersion: number; entityId: string; entity: OfflineContentKind; mutation: "update"; baseVersion: number; payload: JsonValue };

export interface RecentContent {
  accountId: string;
  houseId: string;
  schemaVersion: number;
  id: string;
  kind: OfflineContentKind;
  payload: JsonValue;
  serverVersion: number;
  cachedAt: string;
}

interface OfflineSchema extends DBSchema {
  drafts: { key: [string, string]; value: OfflineDraft; indexes: { "by-account": string } };
  operations: { key: [string, string]; value: QueuedOperation; indexes: { "by-account": string } };
  recent: { key: [string, string]; value: RecentContent; indexes: { "by-account": string } };
}

export const RECENT_CONTENT_MAX_ITEMS = 50;
export const RECENT_CONTENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DB_NAME = "nha-minh-offline-v1";
const handles = new Map<string, Set<AccountOfflineStore>>();
const cleanupInProgress = new Set<string>();
let connection: Promise<IDBPDatabase<OfflineSchema>> | undefined;

function database() {
  connection ??= openDB<OfflineSchema>(DB_NAME, 2, {
    async upgrade(db, oldVersion, newVersion, tx) {
      if (oldVersion < 1) {
        for (const name of ["drafts", "operations", "recent"] as const) {
          const store = db.createObjectStore(name, {
            keyPath: ["accountId", name === "operations" ? "operationId" : "id"],
          });
          store.createIndex("by-account", "accountId");
        }
      }
      if (oldVersion === 1) {
        // Upgrade existing records to include houseId and schemaVersion
        for (const name of ["drafts", "operations", "recent"] as const) {
          const store = tx.objectStore(name);
          let cursor = await store.openCursor();
          while (cursor) {
            const record = { ...cursor.value };
            // Check if missing to be safe
            if (!("houseId" in record)) {
              (record as any).houseId = "legacy";
              (record as any).schemaVersion = 0;
              await cursor.update(record);
            }
            cursor = await cursor.continue();
          }
        }
      }
    },
    blocking() {
      // Let a later schema version upgrade safely; no content is deleted here.
      void connection?.then((db) => db.close());
      connection = undefined;
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

function validateId(value: string, label: string) {
  if (!value || value.trim() !== value || value.length > 200) {
    throw new Error(`${label} must be a nonempty, bounded identifier.`);
  }
}

function validateVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("A version must be a nonnegative safe integer.");
  }
}

export type DraftSaveResult =
  | { status: "saved"; draft: OfflineDraft }
  | { status: "conflict"; current: OfflineDraft | undefined; proposed: DraftInput };

/** Local persistence only: account scoping does not replace authentication or RLS. */
export class AccountOfflineStore {
  private cleared = false;

  constructor(private readonly accountId: string) {
    validateId(accountId, "Account ID");
    if (cleanupInProgress.has(accountId)) throw new Error("Account cleanup is in progress.");
    const accountHandles = handles.get(accountId) ?? new Set<AccountOfflineStore>();
    accountHandles.add(this);
    handles.set(accountId, accountHandles);
  }

  private async db() {
    this.assertActive();
    const db = await database();
    this.assertActive();
    return db;
  }

  private assertActive() {
    if (this.cleared || cleanupInProgress.has(this.accountId)) {
      throw new Error("This account store was cleared. Sign in again before opening a new store.");
    }
  }

  /** Release an unused handle without discarding its account's persisted work. */
  close() {
    this.cleared = true;
    const accountHandles = handles.get(this.accountId);
    accountHandles?.delete(this);
    if (accountHandles?.size === 0) handles.delete(this.accountId);
  }

  async getDraft(id: string) {
    validateId(id, "Draft ID");
    return (await this.db()).get("drafts", [this.accountId, id]);
  }

  async listDrafts() {
    return (await this.db()).getAllFromIndex("drafts", "by-account", this.accountId);
  }

  async saveDraft(input: DraftInput): Promise<DraftSaveResult> {
    validateId(input.id, "Draft ID");
    validateId(input.houseId, "House ID");
    if (input.expectedVersion !== null) validateVersion(input.expectedVersion);
    const db = await this.db();
    const tx = db.transaction("drafts", "readwrite");
    const current = await tx.store.get([this.accountId, input.id]);
    if ((current?.version ?? null) !== input.expectedVersion) {
      await tx.done;
      return { status: "conflict", current, proposed: structuredClone(input) };
    }
    const draft: OfflineDraft = {
      accountId: this.accountId,
      houseId: input.houseId,
      schemaVersion: input.schemaVersion,
      id: input.id,
      kind: input.kind,
      payload: input.payload,
      version: (current?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await tx.store.put(draft);
    await tx.done;
    return { status: "saved", draft };
  }

  async enqueue(input: OperationInput): Promise<QueuedOperation> {
    validateId(input.entityId, "Entity ID");
    validateId(input.houseId, "House ID");
    if (input.mutation === "update") validateVersion(input.baseVersion);
    const operation: QueuedOperation = {
      accountId: this.accountId,
      houseId: input.houseId,
      schemaVersion: input.schemaVersion,
      operationId: crypto.randomUUID(),
      entityId: input.entityId,
      entity: input.entity,
      mutation: input.mutation,
      baseVersion: input.mutation === "update" ? input.baseVersion : null,
      payload: input.payload,
      state: "pending",
      createdAt: new Date().toISOString(),
    };
    // add (never put) prevents accidental replacement of queued work.
    await (await this.db()).add("operations", operation);
    return operation;
  }

  async listOperations() {
    return (await this.db()).getAllFromIndex("operations", "by-account", this.accountId);
  }

  async preserveConflict(operationId: string, remote: JsonValue, remoteVersion: number) {
    validateId(operationId, "Operation ID");
    validateVersion(remoteVersion);
    const db = await this.db();
    const tx = db.transaction("operations", "readwrite");
    const operation = await tx.store.get([this.accountId, operationId]);
    if (!operation) {
      await tx.done;
      throw new Error("The queued operation does not exist for this account.");
    }
    // Preserve the first conflicting snapshot until an explicit resolution exists.
    if (!operation.conflict) {
      operation.state = "conflict";
      operation.conflict = {
        local: operation.payload,
        remote,
        remoteVersion,
        detectedAt: new Date().toISOString(),
      };
      await tx.store.put(operation);
    }
    await tx.done;
    return operation;
  }

  /** Call only after a future server sync validates and acknowledges this exact ID. */
  async acknowledgeOperation(operationId: string) {
    validateId(operationId, "Operation ID");
    const db = await this.db();
    const tx = db.transaction("operations", "readwrite");
    const operation = await tx.store.get([this.accountId, operationId]);
    if (operation?.state === "conflict") {
      await tx.done;
      throw new Error("Resolve the preserved conflict before acknowledging this operation.");
    }
    await tx.store.delete([this.accountId, operationId]);
    await tx.done;
  }

  async cacheRecent(input: Omit<RecentContent, "accountId" | "cachedAt">) {
    validateId(input.id, "Content ID");
    validateId(input.houseId, "House ID");
    validateVersion(input.serverVersion);
    const db = await this.db();
    const tx = db.transaction("recent", "readwrite");
    await tx.store.put({ ...input, accountId: this.accountId, cachedAt: new Date().toISOString() });
    await this.pruneRecent(tx.store);
    await tx.done;
  }

  async listRecent() {
    const db = await this.db();
    const tx = db.transaction("recent", "readwrite");
    const recent = await this.pruneRecent(tx.store);
    await tx.done;
    return recent;
  }

  private async pruneRecent(recentStore: IDBPObjectStore<OfflineSchema, ["recent"], "recent", "readwrite">) {
    const cutoff = Date.now() - RECENT_CONTENT_MAX_AGE_MS;
    const records = (await recentStore.index("by-account").getAll(this.accountId))
      .sort((a, b) => b.cachedAt.localeCompare(a.cachedAt) || a.id.localeCompare(b.id));
    const keep = records.filter((item) => Date.parse(item.cachedAt) > cutoff).slice(0, RECENT_CONTENT_MAX_ITEMS);
    const keepIds = new Set(keep.map((item) => item.id));
    for (const record of records) {
      if (!keepIds.has(record.id)) await recentStore.delete([this.accountId, record.id]);
    }
    return keep;
  }
}

/**
 * Intentional logout cleanup. Future UI must disclose unsynced work and allow
 * export/cancel before calling this; drafts and queued work never expire silently.
 */
export async function clearAccountOfflineData(accountId: string) {
  validateId(accountId, "Account ID");
  if (cleanupInProgress.has(accountId)) throw new Error("Account cleanup is already in progress.");
  cleanupInProgress.add(accountId);
  for (const handle of handles.get(accountId) ?? []) handle.close();
  handles.delete(accountId);
  try {
    const db = await database();
    const tx = db.transaction(["drafts", "operations", "recent"], "readwrite");
    for (const name of ["drafts", "operations", "recent"] as const) {
      const store = tx.objectStore(name);
      const keys = await store.index("by-account").getAllKeys(accountId);
      for (const key of keys) await store.delete(key);
    }
    await tx.done;
  } finally {
    cleanupInProgress.delete(accountId);
  }
}
