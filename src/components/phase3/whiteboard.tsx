"use client";
import dynamic from "next/dynamic";
export type WhiteboardProps = { accountId: string; houseId: string; onClose: () => void };
declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string } }
const Editor = dynamic(async () => {
  window.EXCALIDRAW_ASSET_PATH = "/vendor/excalidraw-0.18.1/";
  return import("./whiteboard-editor");
}, { ssr: false, loading: () => <p role="status">Đang mở bảng vẽ…</p> });
/** Thin integration surface for Home/UI; the SDK loads only when this panel mounts. */
export function Whiteboard(props: WhiteboardProps) { return <Editor {...props} />; }
