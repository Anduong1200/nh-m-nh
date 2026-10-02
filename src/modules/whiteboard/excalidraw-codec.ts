import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { restoreElements } from "@excalidraw/excalidraw";
import { emptyWhiteboardScene, parseWhiteboardScene, type WhiteboardScene } from "./model";
/** Only an already-validated scene crosses the library boundary. Tombstones stay intact. */
export function restoreWhiteboardElements(scene: WhiteboardScene) {
  const valid = parseWhiteboardScene(scene);
  if (!valid) throw new Error("Unsupported Whiteboard scene");
  return restoreElements(valid.elements as unknown as ExcalidrawElement[],null,{repairBindings:true,refreshDimensions:false});
}
export function captureWhiteboardElements(elements: readonly ExcalidrawElement[]): WhiteboardScene | null {
  try {
    const native = JSON.parse(JSON.stringify(elements)) as Record<string, unknown>[];
    for (const element of native) {
      // Transient undefined values have no serialized meaning; native restore uses null.
      for (const key of ["index","link","frameId","boundElements","roundness"]) if (!Object.hasOwn(element,key)) element[key] = null;
      if (["freedraw","line","arrow"].includes(String(element.type)) && !Object.hasOwn(element,"lastCommittedPoint")) element.lastCommittedPoint = null;
    }
    return parseWhiteboardScene({ ...emptyWhiteboardScene(), elements: native });
  } catch { return null; }
}
