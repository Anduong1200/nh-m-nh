"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CaptureUpdateAction, Excalidraw, MainMenu, WelcomeScreen, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "./whiteboard.css";
import { AccountOfflineStore } from "@/lib/offline/store";
import { sameBoardJson } from "@/modules/board/model";
import { normalizeWhiteboardDocument, whiteboardSnapshot } from "@/modules/whiteboard/model";
import { captureWhiteboardElements, restoreWhiteboardElements } from "@/modules/whiteboard/excalidraw-codec";
import { WhiteboardWorkspace } from "@/modules/whiteboard/workspace";
import { whiteboardActionTransport } from "@/modules/whiteboard/transport";
import type { WhiteboardProps } from "./whiteboard";
export default function WhiteboardEditor({ accountId, houseId, onClose, syncEnabled = true }: WhiteboardProps) {
  const [workspace,setWorkspace] = useState<WhiteboardWorkspace | null>(null);
  const syncAllowed = useRef(syncEnabled);
  useEffect(() => { syncAllowed.current = syncEnabled; }, [syncEnabled]);
  useEffect(() => {
    const w = new WhiteboardWorkspace({ accountId,houseId },new AccountOfflineStore(accountId),whiteboardActionTransport,()=>navigator.onLine && syncAllowed.current);
    let active=true;
    void w.open().then(() => { if (active) setWorkspace(w); });
    const reconnect=()=> { void w.refresh(); };
    addEventListener("online",reconnect);
    return () => { active=false; removeEventListener("online",reconnect); void w.close(); };
  }, [accountId,houseId]);
  useEffect(() => { if (syncEnabled && workspace) void workspace.refresh(); }, [syncEnabled, workspace]);
  return workspace ? <WorkspaceEditor workspace={workspace} onClose={onClose} /> : <p role="status">Đang mở bản nháp…</p>;
}
function WorkspaceEditor({ workspace,onClose }: { workspace: WhiteboardWorkspace; onClose: () => void }) {
  const state=useSyncExternalStore(workspace.subscribe,workspace.getState,workspace.getState);
  const [api,setApi]=useState<ExcalidrawImperativeAPI | null>(null);
  const [preview,setPreview]=useState(false);
  const [invalid,setInvalid]=useState(false);
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState("");
  const previewRef=useRef(false);
  const conflict=state.operations.find(o=>o.state==="conflict"&&!o.resolutionOperationId);
  const remote=conflict?.conflict ? whiteboardSnapshot(conflict.conflict.remote) : null;
  const scene=preview && remote ? remote.scene : state.scene;
  useEffect(() => {
    previewRef.current=preview;
    if (!api) return;
    const current=captureWhiteboardElements(api.getSceneElementsIncludingDeleted());
    if (!current || !sameBoardJson(current,normalizeWhiteboardDocument(scene))) {
      api.history.clear();
      api.updateScene({ elements:restoreWhiteboardElements(scene),captureUpdate:CaptureUpdateAction.NEVER });
    }
  },[api,scene,preview]);
  async function run(task:()=>Promise<unknown>) {
    setBusy(true);setFailure("");
    try { await task(); } catch { setFailure("Thao tác chưa được xác nhận. Cả bản nháp và hàng đợi vẫn được giữ."); }
    finally { setBusy(false); }
  }
  function tool(type:"freedraw"|"eraser"|"text"|"selection"|"rectangle"|"hand",highlighter=false) {
    if (!api) return;
    api.updateScene({appState:{currentItemOpacity:highlighter ? 35 : 100,currentItemStrokeWidth:highlighter ? 12 : 2,currentItemStrokeColor:highlighter ? "#d9b65f" : "#243e30",currentItemFontFamily:2},captureUpdate:CaptureUpdateAction.NEVER});
    api.setActiveTool({type});
  }
  function sticky() {
    if (!api) return;
    const a=api.getAppState();
    const elements=convertToExcalidrawElements([{type:"rectangle",x:-a.scrollX+60/a.zoom.value,y:-a.scrollY+100/a.zoom.value,width:180,height:120,backgroundColor:"#fef3c7",fillStyle:"solid",strokeColor:"#8c7755",label:{text:"Giấy nhớ",fontFamily:2,fontSize:20}}]);
    api.updateScene({elements:[...api.getSceneElementsIncludingDeleted(),...elements],captureUpdate:CaptureUpdateAction.IMMEDIATELY});
    api.setActiveTool({type:"selection"});
  }
  return <section className="whiteboard-panel" aria-label="Bảng vẽ chung">
    <div className="whiteboard-toolbar" role="toolbar" aria-label="Dụng cụ vẽ">
      <button onClick={()=>void run(async()=>{await workspace.flush();onClose();})}>Trở về phòng</button>
      {!preview && <>
        <button onClick={()=>tool("freedraw")} disabled={!state.ready}>Bút</button>
        <button onClick={()=>tool("freedraw",true)} disabled={!state.ready}>Tô sáng</button>
        <button onClick={()=>tool("eraser")} disabled={!state.ready}>Tẩy</button>
        <button onClick={()=>tool("text")} disabled={!state.ready}>Chữ</button>
        <button onClick={sticky} disabled={!state.ready}>Giấy nhớ</button>
        <button onClick={()=>tool("rectangle")} disabled={!state.ready}>Hình</button>
        <button onClick={()=>tool("selection")} disabled={!state.ready}>Di chuyển / xoay</button>
        <button onClick={()=>tool("hand")} disabled={!state.ready}>Kéo trang</button>
      </>}
      <button disabled={!state.ready} onClick={()=>api?.scrollToContent(api.getSceneElements(),{fitToContent:true,maxZoom:1,animate:false})}>Vừa khung</button>
      <button disabled={!state.ready||busy||invalid||preview||state.operations.length>0} onClick={()=>void run(()=>workspace.save())}>Lưu vào Nhà</button>
      <button disabled={busy} onClick={()=>void run(()=>workspace.refresh())}>Thử đồng bộ</button>
      <button onClick={()=>void run(async()=>{
        const data=await workspace.exportLocal();
        const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
        const a=document.createElement("a");a.href=url;a.download="nha-minh-whiteboard-drafts.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      })}>Xuất bản nháp</button>
    </div>
    <p role="status" className="whiteboard-status">{state.localSaved ? "Bản nháp đã giữ trên máy." : "Đang giữ bản nháp…"} {state.operations.length ? "Có lần lưu chờ xác nhận." : state.dirty ? "Chọn Lưu vào Nhà để chia sẻ." : "Đã tải bản của Nhà."}</p>
    {(state.error||failure) && <p role="alert" className="whiteboard-status">{failure||state.error}</p>}
    {conflict && remote && <div className="whiteboard-conflict">
      <p>Có hai bản vẽ. Bản của Nhà ở version {remote.version}; bản đang vẽ của bạn được giữ riêng.</p>
      <button onClick={()=>setPreview(!preview)}>{preview ? "Xem bản đang vẽ" : "Xem bản của Nhà"}</button>
      <button disabled={busy} onClick={()=>void run(async()=>{await workspace.keepRemote(conflict.operationId);setPreview(false);})}>Giữ bản của Nhà</button>
      <button disabled={busy||invalid} onClick={()=>void run(async()=>{await workspace.replaceConflict(conflict.operationId);setPreview(false);})}>Dùng bản đang vẽ</button>
    </div>}
    {state.ready && <div className="whiteboard-canvas" onContextMenuCapture={e=>{e.preventDefault();e.stopPropagation();}} onDragOverCapture={e=>{e.preventDefault();e.stopPropagation();}} onDropCapture={e=>{e.preventDefault();e.stopPropagation();}}>
      <Excalidraw excalidrawAPI={setApi} initialData={{elements:restoreWhiteboardElements(state.scene),appState:{zenModeEnabled:true,currentItemFontFamily:2,viewBackgroundColor:"#f4f1e8",currentItemStrokeColor:"#243e30"},scrollToContent:true}}
        zenModeEnabled viewModeEnabled={preview} handleKeyboardGlobally aiEnabled={false} validateEmbeddable={false}
        UIOptions={{tools:{image:false},canvasActions:{loadScene:false,export:false,saveAsImage:false,saveToActiveFile:false,clearCanvas:false,toggleTheme:false}}}
        onPaste={()=>false} onLinkOpen={(_,event)=>event.preventDefault()}
        onChange={(elements)=>{
          if (previewRef.current) return;
          const next=captureWhiteboardElements(elements);
          if (!next) { setInvalid(true); workspace.edit({}); return; }
          const current=workspace.getState().scene;
          setInvalid(false);workspace.edit(sameBoardJson(next,normalizeWhiteboardDocument(current)) ? current : next);
        }}>
        <MainMenu />
        <WelcomeScreen><WelcomeScreen.Center><WelcomeScreen.Center.Heading>Để lại một nét cho người ấy.</WelcomeScreen.Center.Heading></WelcomeScreen.Center></WelcomeScreen>
      </Excalidraw>
    </div>}
  </section>;
}
