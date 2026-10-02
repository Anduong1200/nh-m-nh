import { AccountOfflineStore,clearAccountOfflineData,type JsonValue } from "../../src/lib/offline/store";
import { GameSyncSession,type GameProposal,type GameTransport } from "../../src/modules/games/sync";
import { gameActors,gameHouse } from "../../src/modules/games/test-fixtures";
import { gameLocalId } from "../../src/modules/games/model";
const params = new URLSearchParams(location.search);
const actor = gameActors[Number(params.get("actor") ?? 0)]!;
const context = {accountId:actor,houseId:gameHouse};
const scope = params.get("session") ?? "default";
const store = new AccountOfflineStore(actor);
const url = (path: string) => `/api/games/${path}?actor=${params.get("actor") ?? 0}&session=${encodeURIComponent(scope)}`;
const transport: GameTransport = {
  read:async id => (await fetch(url("read")+"&id="+encodeURIComponent(id))).json(),
  apply:async command => (await fetch(url("apply"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)})).json(),
};
const sync = new GameSyncSession(context,store,transport,() => navigator.onLine);
let detach = () => {};
const harness = {
  queue:(proposal: GameProposal) => sync.queue(proposal),
  drain:() => sync.drain(),read:(id: string) => sync.read(id),cached:(id: string) => sync.cached(id),
  draft:(id: string,payload: JsonValue,version: number | null) => sync.saveDraft(id,payload,version),
  getDraft:(id: string) => store.getDraft(gameLocalId(id)),operations:() => store.listOperations(),
  keepRemote:(id: string) => sync.keepRemote(id),
  watch:(id: string) => {detach();detach = sync.watchReconnect(id,() => {});},
  logout:async () => {detach();sync.stop();await clearAccountOfflineData(actor);},
};
Object.assign(window,{gameHarness:harness});
document.body.textContent = "Games domain browser harness ready";
