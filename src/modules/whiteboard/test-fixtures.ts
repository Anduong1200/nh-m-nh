// Test data only; production rendering uses the library's restore/convert APIs.
import { emptyWhiteboardScene, type WhiteboardScene } from "./model";
export function textScene(text = "Một nét cho cậu"): WhiteboardScene {
  return { ...emptyWhiteboardScene(), elements: [{ id: "text-one", type: "text", x: 120, y: 140, width: 200, height: 25, angle: 0,
    strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 1,
    opacity: 100, seed: 42, version: 1, versionNonce: 12, isDeleted: false, groupIds: [], frameId: null, boundElements: null,
    updated: 1790899200000, link: null, locked: false, roundness: null, index: "a0", fontSize: 20, fontFamily: 5,
    text, originalText: text, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25 }] };
}
