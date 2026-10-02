import type { WhiteboardContext, WhiteboardOperation } from "@/modules/whiteboard/model";
const suffix=()=>{const p=new URLSearchParams(location.search);return "?session="+encodeURIComponent(p.get("session")??"manual-whiteboard")+"&actor="+(p.get("actor")??"0");};
export async function getWhiteboardSnapshotAction() { return (await fetch("/api/whiteboard/snapshot"+suffix(),{cache:"no-store"})).json(); }
export async function saveWhiteboardSnapshotAction(operation:WhiteboardOperation,context:WhiteboardContext) {
 return (await fetch("/api/whiteboard/save"+suffix(),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation,context})})).json();
}
