import { AccountOfflineStore, type JsonValue, type OfflineDraft, type QueuedOperation } from "@/lib/offline/store";
import { GAME_SCHEMA_VERSION, gameLocalId, parseGameContext, parseGameSession, type GameContext, type GameSession } from "@/modules/games/model";
import { GameSyncSession, type GameProposal, type GameTransport } from "@/modules/games/sync";
import { sameBoardJson } from "@/modules/board/model";

export type GameList = (context: GameContext) => Promise<{context?: GameContext; sessions?: GameSession[]; error?: string; blocked?: boolean}>;
export type GamesState = { ready: boolean; busy: boolean; online: boolean; blocked: boolean; sessions: GameSession[]; drafts: OfflineDraft[]; operations: QueuedOperation[]; error: string; notice: string };
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const record = (value: unknown): value is Record<string,unknown> => !!value&&typeof value==="object"&&!Array.isArray(value);
const draftServerVersion = (payload: unknown): number|null => record(payload)&&typeof payload.serverVersion==="number"&&Number.isSafeInteger(payload.serverVersion)&&payload.serverVersion>=1&&payload.serverVersion<=13 ? payload.serverVersion : null;
/** Refuse a lossy JSON copy of corrupted/legacy IDB data; the original remains untouched. */
function losslessJson(value: unknown): value is JsonValue {
  const pending=[value],seen=new WeakSet<object>();
  while(pending.length){
    const current=pending.pop();
    if(current===null||typeof current==="string"||typeof current==="boolean")continue;
    if(typeof current==="number"){if(!Number.isFinite(current))return false;continue;}
    if(typeof current!=="object"||seen.has(current))return false;
    seen.add(current);
    if(Array.isArray(current)){
      const keys=Object.keys(current);
      if(keys.length!==current.length||keys.some((key,index)=>key!==String(index)))return false;
    }else if(Object.getPrototypeOf(current)!==Object.prototype&&Object.getPrototypeOf(current)!==null)return false;
    for(const child of Object.values(current))pending.push(child);
  }
  return true;
}
function committedGameDraft(payload: unknown,session: GameSession,actorId: string): boolean {
  if(!record(payload)||!losslessJson(payload))return false;
  if(payload.mode==="create")return session.createdBy===actorId&&payload.gameType===session.gameType&&payload.turnLimit===session.turnLimit&&payload.prompt===(session.gameType==="draw-guess"?session.answer:session.prompt);
  if(payload.mode!=="move")return false;
  const version=draftServerVersion(payload);
  if(version===null)return false;
  const event=session.events.find(e=>e.sequence===version&&e.actorId===actorId);
  if(!event)return false;
  return event.kind==="doodle" ? sameBoardJson(event.payload,payload.doodle) : event.kind==="photo" ? event.payload.mediaId===payload.mediaId&&event.payload.caption===payload.caption : event.payload.text===payload.text;
}
export function isStaleGameDraft(payload: unknown,session: GameSession,actorId: string): boolean {
  return record(payload)&&payload.mode==="move"&&!committedGameDraft(payload,session,actorId)&&(draftServerVersion(payload)!==session.version||session.status!=="active"||session.turn?.userId!==actorId);
}

/** The UI never advances a turn until the existing command ledger confirms it. */
export class GamesWorkspace {
  private active = true;
  private listeners = new Set<() => void>();
  private refreshTask: Promise<void> | null = null;
  private draftWrites = new Map<string,Promise<boolean>>();
  private draftVersions = new Map<string,number | null>();
  private draftBuffers = new Map<string,{revision:number;payload:JsonValue}>();
  private bufferWrites = new Map<string,Promise<void>>();
  private draftRevision = 0;
  // Announce a verified incoming version before awaiting IDB so late edits also get archived.
  private draftTargets = new Map<string,GameSession>();
  readonly sync: GameSyncSession;
  private state: GamesState;
  constructor(readonly context: GameContext, private readonly store: AccountOfflineStore, transport: GameTransport, private readonly list: GameList, initial: GameSession[] = [], private readonly online = () => true) {
    const valid = parseGameContext(context);
    if (!valid || valid.accountId !== store.accountScope) throw new Error("Verified game context required");
    this.sync = new GameSyncSession(valid,store,transport,online);
    this.state = {ready:false,busy:false,online:online(),blocked:false,sessions:initial.filter(s=>this.allowed(s)),drafts:[],operations:[],error:"",notice:""};
  }
  private allowed(value: unknown): value is GameSession {
    const s = parseGameSession(value);
    return !!s && s.houseId === this.context.houseId && s.players.some(p=>p.userId===this.context.accountId) && !(s.gameType === "draw-guess" && s.status === "active" && s.createdBy !== this.context.accountId && s.answer !== null);
  }
  getState = () => this.state;
  hasUnflushedDraft = () => this.draftBuffers.size>0;
  /** Start durable saving in the input event, without a cancellable debounce. */
  stageDraft(id:string,payload:JsonValue) {
    if(!this.active||this.state.blocked)return;
    const buffered={revision:++this.draftRevision,payload:structuredClone(payload)};
    this.draftBuffers.set(id,buffered);this.update({notice:"Đang giữ thay đổi mới nhất trên máy…"});
    if(!this.bufferWrites.has(id)){
      const writing=(async()=>{
        while(this.active&&this.draftBuffers.has(id)){
          const latest=this.draftBuffers.get(id)!;
          if(!await this.saveDraft(id,latest.payload))break;
          if(this.draftBuffers.get(id)?.revision===latest.revision)this.draftBuffers.delete(id);
        }
        if(!this.draftBuffers.size)this.update({notice:"Bản nháp đã giữ trên máy."});
      })().finally(()=>this.bufferWrites.delete(id));
      this.bufferWrites.set(id,writing);
    }
  }
  async flushDrafts():Promise<boolean> {
    await Promise.all([...this.bufferWrites.values()]);
    while(this.draftBuffers.size){
      for(const [id,buffered] of [...this.draftBuffers]){
        if(!await this.saveDraft(id,buffered.payload))return false;
        if(this.draftBuffers.get(id)?.revision===buffered.revision)this.draftBuffers.delete(id);
      }
    }
    this.update({notice:"Bản nháp đã giữ trên máy."});
    return true;
  }
  async assertCurrent() {if(!this.active||this.state.blocked)throw new Error("Workspace stopped");await this.store.assertCurrent();if(!this.active||this.state.blocked)throw new Error("Workspace stopped");}
  subscribe = (listener: () => void) => {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private update(change: Partial<GamesState>) {if (!this.active) return;this.state={...this.state,...change};for (const listener of this.listeners) listener();}
  private async local() {
    const [drafts,operations]=await Promise.all([this.store.listDrafts(),this.store.listOperations()]);
    const owned=drafts.filter(d=>d.kind==="game"&&d.houseId===this.context.houseId&&d.schemaVersion===GAME_SCHEMA_VERSION);
    for (const d of owned) if (!this.draftVersions.has(d.id)) this.draftVersions.set(d.id,d.version);
    this.update({drafts:owned,operations:operations.filter(o=>o.entity==="game"&&o.houseId===this.context.houseId&&o.schemaVersion===GAME_SCHEMA_VERSION)});
  }
  private draftTarget(id:string) {return this.draftTargets.get(id)??this.state.sessions.find(s=>s.id===id);}
  private async archiveDraft(sessionId:string,draft:OfflineDraft) {
    if(draft.accountId!==this.context.accountId||draft.houseId!==this.context.houseId||draft.kind!=="game"||draft.schemaVersion!==GAME_SCHEMA_VERSION||!losslessJson(draft.payload))throw new Error("Draft cannot be copied safely");
    const payload:JsonValue={mode:"recovery",sessionId,sourceVersion:draftServerVersion(draft.payload),localDraftVersion:draft.version,content:structuredClone(draft.payload)};
    const result=await this.store.saveDraft({id:`game-recovery:${sessionId}:${draft.version}`,houseId:this.context.houseId,kind:"game",schemaVersion:GAME_SCHEMA_VERSION,payload,expectedVersion:null});
    if(result.status==="conflict"&&(!result.current||result.current.accountId!==this.context.accountId||result.current.houseId!==this.context.houseId||result.current.kind!=="game"||result.current.schemaVersion!==GAME_SCHEMA_VERSION||!losslessJson(result.current.payload)||!sameBoardJson(result.current.payload,payload)))throw new Error("Recovery record changed");
  }
  private async adoptSessions(sessions:GameSession[]) {
    for(const session of sessions){const target=this.draftTargets.get(session.id);if(!target||target.version<=session.version)this.draftTargets.set(session.id,session);}
    if(!await this.flushDrafts())throw new Error("Unflushed draft");
    let recovered=false;
    for(const session of sessions){
      const draft=await this.store.getDraft(gameLocalId(session.id));
      if(draft&&isStaleGameDraft(draft.payload,session,this.context.accountId)){await this.archiveDraft(session.id,draft);recovered=true;}
    }
    // Publish only after durable recovery; an archive failure keeps the current editor open.
    this.update({sessions,...(recovered?{notice:"Bản nháp lượt cũ đã cất riêng trên máy. Bạn có thể xem và xuất lại."}:{})});
    await this.local();
  }
  async open() {
    try {
      const recent=await this.store.listRecent();
      const snapshots=new Map(this.state.sessions.map(s=>[s.id,s]));
      for (const row of recent) {
        if (row.kind!=="game"||row.houseId!==this.context.houseId||row.schemaVersion!==GAME_SCHEMA_VERSION||!this.allowed(row.payload)) continue;
        const s=row.payload;if (!snapshots.has(s.id)||snapshots.get(s.id)!.version<s.version) snapshots.set(s.id,s);
      }
      if(this.online())for(const s of this.state.sessions){
        const cached=recent.find(r=>r.id===gameLocalId(s.id)&&r.houseId===this.context.houseId&&r.kind==="game");
        if(!cached||cached.serverVersion<=s.version)await this.store.cacheRecent({id:gameLocalId(s.id),houseId:this.context.houseId,kind:"game",schemaVersion:GAME_SCHEMA_VERSION,payload:json(s),serverVersion:s.version});
      }
      await this.adoptSessions([...snapshots.values()]);
      await this.local();await this.refresh();
    } catch {this.update({error:"Chưa mở được bản nháp trên máy. Thử lại trước khi gửi lượt chơi."});}
    finally {this.update({ready:true});}
  }
  refresh() {
    this.refreshTask ??= this.doRefresh().finally(()=>{this.refreshTask=null;});
    return this.refreshTask;
  }
  private async doRefresh() {
    if (!this.active||this.state.blocked) return;
    if(!await this.flushDrafts())return;
    this.update({busy:true,online:this.online(),error:""});
    try {
      const report=await this.sync.drain();
      if (report.error) this.update({error:report.error});
      const cached=new Map(this.state.sessions.map(s=>[s.id,s]));
      for(const row of await this.store.listRecent()){
        if(row.kind!=="game"||row.houseId!==this.context.houseId||row.schemaVersion!==GAME_SCHEMA_VERSION||!this.allowed(row.payload))continue;
        const s=row.payload;if(!cached.has(s.id)||cached.get(s.id)!.version<s.version)cached.set(s.id,s);
      }
      await this.adoptSessions([...cached.values()]);
      if (this.online()) {
        const result=await this.list(this.context);
        if (!this.active) return;
        await this.store.assertCurrent();
        if (result.blocked) {this.sync.stop();this.update({blocked:true,sessions:[],error:result.error??"Cần xác nhận lại quyền vào Nhà. Bản nháp vẫn được giữ."});return;}
        if (!result.context||result.context.accountId!==this.context.accountId||result.context.houseId!==this.context.houseId||!result.sessions||!result.sessions.every(s=>this.allowed(s))) {
          this.update({error:result.error??"Chưa tải được hộp trò chơi. Bản nháp vẫn được giữ."});
        } else {
          const merged=new Map(this.state.sessions.map(s=>[s.id,s]));
          for (const s of result.sessions) {
            if (!merged.has(s.id)||merged.get(s.id)!.version<=s.version) {
              merged.set(s.id,s);
              await this.store.cacheRecent({id:gameLocalId(s.id),houseId:this.context.houseId,kind:"game",schemaVersion:GAME_SCHEMA_VERSION,payload:json(s),serverVersion:s.version});
            }
          }
          await this.adoptSessions([...merged.values()]);
        }
      } else this.update({notice:"Đang ngoại tuyến. Bản nháp và lượt chờ gửi được giữ trên máy."});
      await this.local();
    } catch {this.update({error:"Chưa xác nhận được kết nối. Bản nháp và hàng đợi vẫn được giữ."});}
    finally {this.update({busy:false});}
  }
  async saveDraft(id: string,payload: JsonValue): Promise<boolean> {
    if (!this.active||this.state.blocked) return false;
    const key=gameLocalId(id),previous=this.draftWrites.get(key);
    const task=(async()=>{
      if (previous) await previous;
      try {
        const existing=await this.store.getDraft(key);
        if (!this.draftVersions.has(key)) this.draftVersions.set(key,existing?.version??null);
        const target=this.draftTarget(id);
        if(existing&&existing.version===this.draftVersions.get(key)&&record(payload)&&payload.mode==="move"&&(!record(existing.payload)||existing.payload.mode!=="move"||draftServerVersion(existing.payload)===null||draftServerVersion(existing.payload)!==draftServerVersion(payload))&&(!target||!committedGameDraft(existing.payload,target,this.context.accountId)))await this.archiveDraft(id,existing);
        const result=await this.sync.saveDraft(id,payload,this.draftVersions.get(key)??null);
        if (result.status!=="saved") {this.update({error:"Bản nháp đã đổi ở tab khác. Nội dung đang nhập vẫn ở đây; xuất bản nháp trước khi tải lại."});return false;}
        this.draftVersions.set(key,result.draft.version);
        const latestTarget=this.draftTarget(id);
        if(latestTarget&&isStaleGameDraft(result.draft.payload,latestTarget,this.context.accountId))await this.archiveDraft(id,result.draft);
        await this.local();
        if(!this.draftBuffers.size)this.update({notice:"Bản nháp đã giữ trên máy."});return true;
      } catch {this.update({error:"Chưa lưu được bản nháp. Giữ màn này và thử lại trước khi gửi."});return false;}
    })();
    this.draftWrites.set(key,task);return task;
  }
  async submit(proposal: GameProposal) {
    await this.assertCurrent();
    this.update({error:""});
    await this.sync.queue(proposal);await this.local();
    this.update({notice:"Lượt chơi đã giữ trong hàng đợi. Chờ Nhà xác nhận."});
    await this.refresh();
  }
  async keepRemote(id: string) {await this.sync.keepRemote(id);await this.local();this.update({notice:"Đã giữ bản của Nhà. Đóng góp của bạn vẫn có trong bản nháp để xuất."});}
  async resolve(id: string,proposal: GameProposal) {await this.sync.resolveConflict(id,proposal);await this.local();await this.refresh();}
  async exportLocal() {return json({persisted:await this.sync.exportLocal(),unsaved:[...this.draftBuffers].map(([sessionId,draft])=>({sessionId,payload:draft.payload}))});}
  close() {this.active=false;this.sync.stop();this.store.close();this.listeners.clear();this.draftBuffers.clear();}
}
