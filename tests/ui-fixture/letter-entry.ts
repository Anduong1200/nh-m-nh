import { AccountOfflineStore, clearAccountOfflineData, type JsonValue } from "../../src/lib/offline/store";
import { LetterClient, type LetterTransport } from "../../src/modules/letters/client";
import type { LetterCommand, LetterContext, RevealCommand, RevealSession } from "../../src/modules/letters/model";
const params = new URLSearchParams(location.search);
const actor = params.get("actor") ?? "0";
const url = (name: string) => `/api/letters/${name}?actor=${actor}`;
const context: LetterContext = await (await fetch(url("context"))).json();
const store = new AccountOfflineStore(context.accountId);
const transport: LetterTransport = {
  read: async id => (await fetch(url("read") + "&id=" + encodeURIComponent(id))).json(),
  apply: async command => (await fetch(url("apply"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) })).json(),
  reveal: async command => (await fetch(url("reveal"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) })).json(),
};
const client = new LetterClient(context, store, transport, () => navigator.onLine);
let detach = () => {};
let lastSession: RevealSession | null = null;
Object.assign(window, { letterHarness: {
  apply: (command: LetterCommand) => client.apply(command), read: (id: string) => client.read(id), cached: (id: string) => client.cached(id),
  reveal: (command: RevealCommand) => client.reveal(command),
  watch: (id: string, sessionId: string) => { detach(); detach = client.watchReveal(id, sessionId, session => { lastSession = session; }); },
  status: async () => lastSession,
  draft: (id: string, payload: JsonValue, version: number | null) => client.saveDraft(id, payload, version),
  getDraft: (id: string) => store.getDraft(`letter:${id}`),
  logout: async () => { detach(); client.stop(); await clearAccountOfflineData(context.accountId); },
} });
document.body.textContent = "Letters core browser harness ready";
