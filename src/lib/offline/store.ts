import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OfflineContentKind = "note" | "doodle" | "whiteboard";
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
  sequence?: number;
  resolutionOf?: string;
  resolutionOperationId?: string;
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
  epochs: { key: string; value: { accountId: string; epoch: number } };
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
  connection ??= openDB<OfflineSchema>(DB_NAME, 3, {
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
            if (!Object.hasOwn(record, "houseId")) {
              await cursor.update({ ...record, houseId: "legacy", schemaVersion: 0 });
            }
            cursor = await cursor.continue();
          }
        }
      }
      if (oldVersion < 3) db.createObjectStore("epochs", { keyPath: "accountId" });
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
  /** Namespace binding only; the server/RLS still verifies authentication. */
  get accountScope() { return this.accountId; }
  private cleared = false;
  private readonly epoch: Promise<number>;

  constructor(private readonly accountId: string) {
    validateId(accountId, "Account ID");
    if (cleanupInProgress.has(accountId)) throw new Error("Account cleanup is in progress.");
    const accountHandles = handles.get(accountId) ?? new Set<AccountOfflineStore>();
    accountHandles.add(this);
    handles.set(accountId, accountHandles);
    this.epoch = database().then((db) => db.get("epochs", accountId)).then((record) => record?.epoch ?? 0);
    void this.epoch.catch(() => {}); // Public operations report IDB failures to the caller.
  }

  private async db() {
    this.assertActive();
    const db = await database();
    this.assertActive();
    await this.assertEpoch({ get: (key) => db.get("epochs", key) });
    return db;
  }

  private async assertEpoch(store: { get(key: string): Promise<{ epoch: number } | undefined> }) {
    const initial = await this.epoch;
    const current = await store.get(this.accountId);
    this.assertActive();
    if ((current?.epoch ?? 0) !== initial) throw new Error("This account store was cleared in another tab.");
  }

  private async writeStore<T extends "drafts" | "operations" | "recent">(name: T) {
    const db = await this.db();
    const tx = db.transaction([name, "epochs"], "readwrite");
    void tx.done.catch(() => {});
    await this.assertEpoch(tx.objectStore("epochs"));
    return { tx, store: tx.objectStore(name) };
  }

  /** Persistent generation barrier; it is not an authentication grant. */
  async assertCurrent() { await this.db(); }

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
    const { tx, store } = await this.writeStore("drafts");
    const current = await store.get([this.accountId, input.id]);
    if (current && current.houseId !== input.houseId) {
      await tx.done;
      throw new Error("Draft House cannot be changed.");
    }
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
    await store.put(draft);
    await tx.done;
    return { status: "saved", draft };
  }

  async enqueue(input: OperationInput): Promise<QueuedOperation> {
    validateId(input.entityId, "Entity ID");
    validateId(input.houseId, "House ID");
    if (input.mutation === "update") validateVersion(input.baseVersion);
    const { tx, store } = await this.writeStore("operations");
    const previous = await store.index("by-account").getAll(this.accountId);
    const sequence = previous.reduce((max, row) => Math.max(max, row.sequence ?? 0), 0) + 1;
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
      sequence,
    };
    // add (never put) prevents accidental replacement of queued work.
    await store.add(operation);
    await tx.done;
    return operation;
  }

  async listOperations() {
    return (await this.db()).getAllFromIndex("operations", "by-account", this.accountId);
  }

  async preserveConflict(operationId: string, remote: JsonValue, remoteVersion: number) {
    validateId(operationId, "Operation ID");
    validateVersion(remoteVersion);
    const { tx, store } = await this.writeStore("operations");
    const operation = await store.get([this.accountId, operationId]);
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
      await store.put(operation);
    }
    await tx.done;
    return operation;
  }

  /** Call only after a future server sync validates and acknowledges this exact ID. */
  async acknowledgeOperation(operationId: string) {
    validateId(operationId, "Operation ID");
    const { tx, store } = await this.writeStore("operations");
    const operation = await store.get([this.accountId, operationId]);
    if (operation?.state === "conflict") {
      await tx.done;
      throw new Error("Resolve the preserved conflict before acknowledging this operation.");
    }
    const ancestors = operation ? await this.resolutionAncestors(operation, store) : [];
    for (const parent of ancestors) await store.delete([this.accountId, parent.operationId]);
    await store.delete([this.accountId, operationId]);
    await tx.done;
  }

  async cacheRecent(input: Omit<RecentContent, "accountId" | "cachedAt">) {
    validateId(input.id, "Content ID");
    validateId(input.houseId, "House ID");
    validateVersion(input.serverVersion);
    const { tx, store } = await this.writeStore("recent");
    const previous = await store.get([this.accountId, input.id]);
    if (previous && previous.houseId !== input.houseId) { await tx.done; throw new Error("Cached content House cannot be changed."); }
    if (!previous || previous.serverVersion <= input.serverVersion) await store.put({ ...input, accountId: this.accountId, cachedAt: new Date().toISOString() });
    await this.pruneRecent(store);
    await tx.done;
  }

  async listRecent() {
    const { tx, store } = await this.writeStore("recent");
    const recent = await this.pruneRecent(store);
    await tx.done;
    return recent;
  }

  private async resolutionAncestors(operation: QueuedOperation, store: { get(key: [string, string]): Promise<QueuedOperation | undefined> }) {
    const parents: QueuedOperation[] = [], seen = new Set([operation.operationId]);
    let child = operation;
    while (child.resolutionOf) {
      const parent = await store.get([this.accountId, child.resolutionOf]);
      if (!parent || seen.has(parent.operationId) || parent.state !== "conflict" || parent.houseId !== operation.houseId || parent.entityId !== operation.entityId || parent.resolutionOperationId !== child.operationId) throw new Error("Resolution chain does not match.");
      seen.add(parent.operationId); parents.push(parent); child = parent;
    }
    return parents;
  }

  private async pruneRecent(recentStore: { index(name: "by-account"): { getAll(key: string): Promise<RecentContent[]> }; delete(key: [string, string]): Promise<unknown> }) {
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

  /** Explicit replacement; original conflict stays durable until this operation is acknowledged. */
  async queueConflictReplacement(operationId: string, payload: JsonValue, baseVersion: number) {
    validateVersion(baseVersion);
    if (baseVersion < 1) throw new Error("A replacement requires an authoritative version.");
    const { tx, store } = await this.writeStore("operations");
    const original = await store.get([this.accountId, operationId]);
    if (!original || original.state !== "conflict") { await tx.done; throw new Error("Preserved conflict required."); }
    if (original.resolutionOperationId) {
      const existing = await store.get([this.accountId, original.resolutionOperationId]);
      await tx.done;
      if (!existing || JSON.stringify(existing.payload) !== JSON.stringify(payload) || existing.baseVersion !== baseVersion) throw new Error("A resolution is already pending.");
      return existing;
    }
    const records = await store.index("by-account").getAll(this.accountId);
    const replacement: QueuedOperation = { ...original, operationId: crypto.randomUUID(), mutation: "update", payload: structuredClone(payload), baseVersion,
      state: "pending", resolutionOf: original.operationId,
      sequence: records.reduce((max, row) => Math.max(max, row.sequence ?? 0), 0) + 1, createdAt: new Date().toISOString() };
    delete replacement.conflict;
    delete replacement.resolutionOperationId;
    await store.add(replacement);
    await store.put({ ...original, resolutionOperationId: replacement.operationId });
    await tx.done;
    return replacement;
  }

  /** Explicit keep-remote choice archives the local proposal as a separate draft. */
  async keepRemoteConflict(operationId: string): Promise<OfflineDraft> {
    const db = await this.db();
    const tx = db.transaction(["drafts", "operations", "epochs"], "readwrite");
    void tx.done.catch(() => {});
    await this.assertEpoch(tx.objectStore("epochs"));
    const operation = await tx.objectStore("operations").get([this.accountId, operationId]);
    if (!operation || operation.state !== "conflict" || operation.resolutionOperationId) { await tx.done; throw new Error("Unresolved conflict required."); }
    const chain = [operation, ...await this.resolutionAncestors(operation, tx.objectStore("operations"))];
    const drafts: OfflineDraft[] = chain.map((proposal) => ({ accountId: this.accountId, houseId: proposal.houseId, schemaVersion: proposal.schemaVersion,
      id: crypto.randomUUID(), kind: proposal.entity, payload: structuredClone(proposal.payload), version: 1, updatedAt: new Date().toISOString() }));
    try {
      for (const draft of drafts) await tx.objectStore("drafts").add(draft);
      for (const proposal of chain) await tx.objectStore("operations").delete([this.accountId, proposal.operationId]);
    } catch (error) { tx.abort(); throw error; }
    await tx.done;
    return drafts[0]!;
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
    const tx = db.transaction(["drafts", "operations", "recent", "epochs"], "readwrite");
    const generation = await tx.objectStore("epochs").get(accountId);
    await tx.objectStore("epochs").put({ accountId, epoch: (generation?.epoch ?? 0) + 1 });
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
