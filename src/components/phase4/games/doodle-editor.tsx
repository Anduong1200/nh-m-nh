"use client";
import { useState } from "react";
import { CaptureUpdateAction, Excalidraw, MainMenu, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { captureGameDoodle, type GameDoodle } from "./doodle-codec";
function native(doodle: GameDoodle,prefix: string,locked: boolean) {
  return restoreElements(doodle.strokes.map((s,i)=>{
    const box=s.points.reduce((b,p)=>({left:Math.min(b.left,p[0]!),right:Math.max(b.right,p[0]!),top:Math.min(b.top,p[1]!),bottom:Math.max(b.bottom,p[1]!)}),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
    const points=s.points.map(p=>[p[0]!-box.left,p[1]!-box.top]);
    return {id:`${prefix}-${i}`,type:"freedraw",x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top,strokeColor:s.color,strokeWidth:s.width,points,locked,angle:0,simulatePressure:true,pressures:[],isDeleted:false};
  }) as unknown as ExcalidrawElement[],null,{repairBindings:false,refreshDimensions:false});
}
export default function DoodleEditor({initial,previous,onChange,disabled}: {initial: GameDoodle;previous: GameDoodle;onChange: (doodle: GameDoodle | null)=>void;disabled: boolean}) {
  const [api,setApi]=useState<ExcalidrawImperativeAPI|null>(null);
  const [background]=useState(()=>native(previous,"shared",true));
  const [backgroundIds]=useState(()=>new Set(background.map(e=>e.id)));
  const [initialElements]=useState(()=>[...background,...native(initial,"draft",false)]);
  function tool(type:"freedraw"|"eraser"|"hand",color="#243e30") {
    api?.updateScene({appState:{currentItemStrokeColor:color,currentItemStrokeWidth:3},captureUpdate:CaptureUpdateAction.NEVER});api?.setActiveTool({type});
  }
  return <div className="games-drawing">
    <p>Các nét đã gửi được giữ nguyên. Bạn vẽ thêm trong cùng khung; tẩy chỉ áp dụng bản nháp của bạn.</p>
    <div role="toolbar" aria-label="Dụng cụ vẽ trò chơi">
      <button type="button" disabled={disabled} onClick={()=>tool("freedraw")}>Bút xanh</button>
      <button type="button" disabled={disabled} onClick={()=>tool("freedraw","#bd604e")}>Bút đỏ</button>
      <button type="button" disabled={disabled} onClick={()=>tool("eraser")}>Tẩy bản nháp</button>
      <button type="button" onClick={()=>tool("hand")}>Kéo khung</button>
      <button type="button" onClick={()=>api?.scrollToContent(api.getSceneElements(),{fitToContent:true,maxZoom:1,animate:false})}>Vừa khung</button>
    </div>
    <div className="games-canvas" onContextMenuCapture={e=>{e.preventDefault();e.stopPropagation();}} onDragOverCapture={e=>{e.preventDefault();e.stopPropagation();}} onDropCapture={e=>{e.preventDefault();e.stopPropagation();}}>
      <Excalidraw excalidrawAPI={setApi} initialData={{elements:initialElements,appState:{zenModeEnabled:true,currentItemStrokeColor:"#243e30",currentItemStrokeWidth:3,currentItemFontFamily:2,viewBackgroundColor:"#fffdf5"},scrollToContent:true}}
        zenModeEnabled viewModeEnabled={disabled} aiEnabled={false} validateEmbeddable={false} onPaste={()=>false} onLinkOpen={(_,e)=>e.preventDefault()}
        UIOptions={{tools:{image:false},canvasActions:{loadScene:false,export:false,saveAsImage:false,saveToActiveFile:false,clearCanvas:false,toggleTheme:false}}}
        onChange={elements=>{
          const changed=background.some(original=>{
            const current=elements.find(e=>e.id===original.id);
            return !current||current.isDeleted||!current.locked||JSON.stringify([current.x,current.y,current.width,current.height,current.angle,current.strokeColor,current.strokeWidth,(current as unknown as {points:unknown}).points])!==JSON.stringify([original.x,original.y,original.width,original.height,original.angle,original.strokeColor,original.strokeWidth,(original as unknown as {points:unknown}).points]);
          });
          if(changed&&api)api.updateScene({elements:[...background,...elements.filter(e=>!backgroundIds.has(e.id))],captureUpdate:CaptureUpdateAction.NEVER});
          onChange(captureGameDoodle(elements,backgroundIds));
        }}>
        <MainMenu />
      </Excalidraw>
    </div>
  </div>;
}
