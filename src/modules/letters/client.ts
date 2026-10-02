import { AccountOfflineStore, type JsonValue } from "@/lib/offline/store";
import type { LetterReadResult, LetterRevealResult, LetterWriteResult } from "./actions";
import { LETTER_SCHEMA_VERSION, REVEAL_HEARTBEAT_MS, parseLetter, parseLetterCommand, parseLetterContext, parseLetterReceipt, parseRevealCommand, parseRevealSession, type Letter, type LetterCommand, type LetterContext, type RevealCommand, type RevealSession } from "./model";
export type LetterTransport = {
  read(id: string, context: LetterContext): Promise<LetterReadResult>;
  apply(command: LetterCommand, context: LetterContext): Promise<LetterWriteResult>;
  reveal(command: RevealCommand, context: LetterContext): Promise<LetterRevealResult>;
};
const localId = (id: string) => `letter:${id}`;
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
/** Local drafts and authorized recent reads only. Sending/opening requires online confirmation. */
export class LetterClient {
  private active = true;
  private readonly context: LetterContext;
  constructor(context: LetterContext, private readonly store: AccountOfflineStore, private readonly transport: LetterTransport, private readonly online: () => boolean = () => true) {
    const parsed = parseLetterContext(context);
    if (!parsed || parsed.accountId !== store.accountScope) throw new Error("Matching verified account and House required");
    this.context = Object.freeze(parsed);
  }
  stop() { this.active = false; }
  private async check() { if (!this.active) throw new Error("Letters stopped"); await this.store.assertCurrent(); if (!this.active) throw new Error("Letters stopped"); }
  async cached(id: string): Promise<Letter | null> {
    await this.check();
    const row = (await this.store.listRecent()).find(r => r.id === localId(id) && r.kind === "letter" && r.houseId === this.context.houseId && r.schemaVersion === LETTER_SCHEMA_VERSION);
    const letter = parseLetter(row?.payload, this.context);
    return letter?.id === id ? letter : null;
  }
  private async cache(letter: Letter) {
    await this.check();
    const current = await this.cached(letter.id);
    if (current && current.version === letter.version && current.state !== "scheduled" && letter.state === "scheduled") return;
    // Time eligibility is never inferred locally. Store only a validated server DTO.
    await this.store.cacheRecent({ id: localId(letter.id), houseId: this.context.houseId, kind: "letter", schemaVersion: LETTER_SCHEMA_VERSION, serverVersion: letter.version, payload: json(letter) });
  }
  async read(id: string): Promise<Letter | null> {
    await this.check();
    if (!this.online()) return this.cached(id);
    const result = await this.transport.read(id, this.context); await this.check();
    if (result.blocked) { this.stop(); return null; }
    if (result.context?.accountId !== this.context.accountId || result.context.houseId !== this.context.houseId) return null;
    const letter = parseLetter(result.letter, this.context);
    if (!letter || letter.id !== id) return null;
    await this.cache(letter); return this.cached(id);
  }
  async apply(input: LetterCommand): Promise<LetterReceiptResult> {
    await this.check(); if (!this.online()) throw new Error("Connect before sending or opening; draft is kept");
    const command = parseLetterCommand(input); if (!command) throw new Error("Invalid letter command");
    const result = await this.transport.apply(command, this.context); await this.check();
    if (result.blocked) this.stop();
    const receipt = result.blocked ? null : parseLetterReceipt(result.receipt, this.context, command);
    if (!receipt) throw new Error("No confirmed receipt; retry the same operation, keep draft");
    await this.cache(receipt.snapshot); return receipt;
  }
  async reveal(command: RevealCommand): Promise<RevealSession> {
    await this.check(); if (!this.online()) throw new Error("Both partners must be online in the reveal session");
    const parsed = parseRevealCommand(command); if (!parsed) throw new Error("Invalid reveal command");
    command = parsed;
    const result = await this.transport.reveal(command, this.context); await this.check();
    if (result.blocked) this.stop();
    const session = result.blocked || result.context?.accountId !== this.context.accountId || result.context.houseId !== this.context.houseId ? null : parseRevealSession(result.session, this.context, command);
    if (!session) throw new Error("Reveal session not confirmed");
    await this.cache(session.snapshot); return session;
  }
  async saveDraft(id: string, payload: JsonValue, expectedVersion: number | null) {
    await this.check();
    return this.store.saveDraft({ id: localId(id), houseId: this.context.houseId, schemaVersion: LETTER_SCHEMA_VERSION, kind: "letter", payload, expectedVersion });
  }
  /** Call only after an explicit join. Hidden/offline tabs stop refreshing presence. */
  watchReveal(letterId: string, sessionId: string, listener: (session: RevealSession | null) => void) {
    let closed = false; let busy = false;
    const refresh = async () => {
      if (closed || busy || !this.active || !this.online() || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const session = await this.reveal({ kind: "heartbeat", letterId, sessionId });
        if (!closed && this.active) listener(session);
        if (session.status !== "active") close();
      } catch { if (!closed && this.active) listener(null); }
      finally { busy = false; }
    };
    const timer = window.setInterval(() => void refresh(), REVEAL_HEARTBEAT_MS);
    const disconnected = () => { if (!closed && this.active) listener(null); };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); else disconnected(); };
    const close = () => { closed = true; window.clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("offline", disconnected); document.removeEventListener("visibilitychange", visibility); };
    window.addEventListener("online", refresh); window.addEventListener("offline", disconnected); document.addEventListener("visibilitychange", visibility); void refresh();
    return close;
  }
}
type LetterReceiptResult = NonNullable<LetterWriteResult["receipt"]>;
