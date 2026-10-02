import { parseBoardContext, sameBoardJson, type BoardContext } from "@/modules/board/model";
import { isUuid } from "@/modules/knocks/model";
import type { JsonValue } from "@/lib/offline/store";
export const WHITEBOARD_SCHEMA_VERSION = 1;
export const WHITEBOARD_LIBRARY_VERSION = "0.18.1";
export const WHITEBOARD_MAX_BYTES = 1048576;
export type WhiteboardContext = BoardContext;
export type WhiteboardScene = { schemaVersion: 1; library: "excalidraw"; libraryVersion: "0.18.1"; elements: Record<string, JsonValue>[] };
export type WhiteboardSnapshot = { houseId: string; version: number; scene: WhiteboardScene; updatedBy: string | null; updatedAt: string | null };
export type WhiteboardOperation = { operationId: string; expectedVersion: number; scene: WhiteboardScene };
export type WhiteboardReceipt = { operationId: string; actorId: string; houseId: string; outcome: "applied" | "conflict"; snapshot: WhiteboardSnapshot };
export const emptyWhiteboardScene = (): WhiteboardScene => ({ schemaVersion: 1, library: "excalidraw", libraryVersion: WHITEBOARD_LIBRARY_VERSION, elements: [] });
export const whiteboardLocalId = (houseId: string) => "whiteboard:" + houseId;
/** Native restore resets gesture bookkeeping; empty/null bindings mean the same document. */
export function normalizeWhiteboardDocument(scene: WhiteboardScene): WhiteboardScene {
  return { ...scene, elements: scene.elements.map(e=>({ ...e,
    ...(Array.isArray(e.boundElements) && e.boundElements.length===0 ? {boundElements:null} : {}),
    ...(["freedraw","line","arrow"].includes(String(e.type)) ? {lastCommittedPoint:null} : {})
  })) };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => Object.keys(v).every(k => allowed.includes(k));
const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) => Number.isInteger(v) && num(v,min,max);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(v);
const point = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => num(n,-100000,100000));
const nullable = (v: unknown, check: (value: unknown) => boolean) => v === null || check(v);
const safeText = (v: unknown) => typeof v === "string" && [...v].length <= 10000 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(v);
const color = (v: unknown) => typeof v === "string" && (v === "transparent" || /^#[0-9a-f]{3,8}$/iu.test(v));
const base = ["id","type","x","y","width","height","angle","strokeColor","backgroundColor","fillStyle","strokeWidth","strokeStyle","roughness","opacity","seed","version","versionNonce","isDeleted","groupIds","frameId","boundElements","updated","link","locked","roundness","index"];
const textFields = ["fontSize","fontFamily","text","originalText","textAlign","verticalAlign","containerId","autoResize","lineHeight"];
const lineFields = ["points","lastCommittedPoint","startBinding","endBinding","startArrowhead","endArrowhead","elbowed"];
const drawFields = ["points","pressures","simulatePressure","lastCommittedPoint"];
const types = ["rectangle","ellipse","diamond","text","freedraw","line","arrow"];
function binding(v: unknown) { return object(v) && keys(v,["elementId","focus","gap"]) && id(v.elementId) && num(v.focus,-1,1) && num(v.gap,0,100000); }
const heads = ["arrow","bar","dot","circle","circle_outline","triangle","triangle_outline","diamond","diamond_outline","crowfoot_one","crowfoot_many","crowfoot_one_or_many"];
/** Validate native JSON, never appState, files, URLs, embeds or arbitrary customData. */
export function parseWhiteboardScene(input: unknown): WhiteboardScene | null {
  try {
    if (!object(input) || !keys(input,["schemaVersion","library","libraryVersion","elements"]) || input.schemaVersion !== 1 || input.library !== "excalidraw" || input.libraryVersion !== WHITEBOARD_LIBRARY_VERSION || !Array.isArray(input.elements) || input.elements.length > 1000 || new TextEncoder().encode(JSON.stringify(input)).length > WHITEBOARD_MAX_BYTES) return null;
    const ids = new Set<string>(); let points = 0;
    for (const e of input.elements) {
      if (!object(e) || !types.includes(String(e.type)) || !id(e.id) || ids.has(e.id)) return null;
      ids.add(e.id);
      const allowed = [...base, ...(e.type === "text" ? textFields : e.type === "freedraw" ? drawFields : e.type === "line" || e.type === "arrow" ? lineFields : [])];
      if (!keys(e,allowed) || !["x","y","width","height","angle","strokeColor","backgroundColor","fillStyle","strokeWidth","strokeStyle","roughness","opacity","seed","version","versionNonce","isDeleted","groupIds","frameId","boundElements","updated","link","locked","roundness","index"].every(k => Object.hasOwn(e,k))) return null;
      if (!num(e.x,-100000,100000) || !num(e.y,-100000,100000) || !num(e.width,0,100000) || !num(e.height,0,100000) || !num(e.angle,-100,100) ||
        !color(e.strokeColor) || !color(e.backgroundColor) || !["hachure","cross-hatch","solid","zigzag"].includes(String(e.fillStyle)) || !["solid","dashed","dotted"].includes(String(e.strokeStyle)) ||
        !num(e.strokeWidth,0,32) || !num(e.roughness,0,5) || !num(e.opacity,0,100) || !integer(e.seed,0,2147483647) || !integer(e.version,1,2147483647) || !integer(e.versionNonce,0,2147483647) ||
        typeof e.isDeleted !== "boolean" || typeof e.locked !== "boolean" || !integer(e.updated,0,Number.MAX_SAFE_INTEGER) || e.link !== null || e.frameId !== null ||
        !nullable(e.index,v => typeof v === "string" && /^[A-Za-z0-9]{1,128}$/u.test(v)) || !Array.isArray(e.groupIds) || e.groupIds.length > 32 || !e.groupIds.every(id) ||
        !nullable(e.roundness,v => object(v) && keys(v,["type","value"]) && integer(v.type,1,3) && (!Object.hasOwn(v,"value") || num(v.value,0,100000))) ||
        !nullable(e.boundElements,v => Array.isArray(v) && v.length <= 1000 && v.every(b => object(b) && keys(b,["id","type"]) && id(b.id) && ["text","arrow"].includes(String(b.type))))) return null;
      if (e.type === "text" && (!textFields.every(k => Object.hasOwn(e,k)) || !num(e.fontSize,4,512) || ![2,5].includes(Number(e.fontFamily)) || !integer(e.fontFamily,1,10) ||
        !safeText(e.text) || !safeText(e.originalText) || !["left","center","right"].includes(String(e.textAlign)) || !["top","middle","bottom"].includes(String(e.verticalAlign)) ||
        !nullable(e.containerId,id) || typeof e.autoResize !== "boolean" || !num(e.lineHeight,.5,5))) return null;
      if (["freedraw","line","arrow"].includes(String(e.type))) {
        if (!Array.isArray(e.points) || !e.points.every(point) || !nullable(e.lastCommittedPoint,point)) return null;
        points += e.points.length; if (points > 20000) return null;
        if (e.type === "freedraw" && (!Array.isArray(e.pressures) || e.pressures.length > e.points.length || !e.pressures.every(p => num(p,0,1)) || typeof e.simulatePressure !== "boolean")) return null;
        if (e.type !== "freedraw" && (!nullable(e.startBinding,binding) || !nullable(e.endBinding,binding) || !nullable(e.startArrowhead,v => heads.includes(String(v))) || !nullable(e.endArrowhead,v => heads.includes(String(v))) || (Object.hasOwn(e,"elbowed") && e.elbowed !== false) || (e.type === "arrow" && e.elbowed !== false))) return null;
      }
    }
    for (const e of input.elements as Record<string,unknown>[]) {
      if (Array.isArray(e.boundElements) && e.boundElements.some(b => !ids.has(b.id))) return null;
      if (e.type === "text" && e.containerId !== null && !ids.has(String(e.containerId))) return null;
      for (const k of ["startBinding","endBinding"]) if (object(e[k]) && !ids.has(String(e[k].elementId))) return null;
    }
    return structuredClone(input) as WhiteboardScene;
  } catch { return null; }
}
export const parseWhiteboardContext = parseBoardContext;
export function parseWhiteboardOperation(input: unknown): WhiteboardOperation | null {
  if (!object(input) || !keys(input,["operationId","expectedVersion","scene"]) || !isUuid(input.operationId) || !integer(input.expectedVersion,0,2147483646)) return null;
  const scene = parseWhiteboardScene(input.scene);
  return scene ? { operationId: input.operationId, expectedVersion: input.expectedVersion as number, scene } : null;
}
export function whiteboardSnapshot(input: unknown): WhiteboardSnapshot | null {
  if (!object(input) || !keys(input,["houseId","version","scene","updatedBy","updatedAt"]) || !isUuid(input.houseId) || !integer(input.version,0,2147483647)) return null;
  const scene = parseWhiteboardScene(input.scene);
  if (!scene || (input.version === 0 ? input.updatedBy !== null || input.updatedAt !== null || scene.elements.length !== 0 : !isUuid(input.updatedBy) || typeof input.updatedAt !== "string" || !Number.isFinite(Date.parse(input.updatedAt)))) return null;
  return { houseId: input.houseId, version: input.version as number, scene, updatedBy: input.updatedBy as string | null, updatedAt: input.updatedAt as string | null };
}
export function whiteboardReceipt(input: unknown, context: WhiteboardContext, operation: WhiteboardOperation): WhiteboardReceipt | null {
  if (!object(input) || !keys(input,["operationId","actorId","houseId","outcome","snapshot"]) || input.operationId !== operation.operationId || input.actorId !== context.accountId || input.houseId !== context.houseId || !["applied","conflict"].includes(String(input.outcome))) return null;
  const snapshot = whiteboardSnapshot(input.snapshot);
  if (!snapshot || snapshot.houseId !== context.houseId || (input.outcome === "applied" ? snapshot.version !== operation.expectedVersion + 1 || snapshot.updatedBy !== context.accountId || !sameBoardJson(snapshot.scene,operation.scene) : snapshot.version <= operation.expectedVersion)) return null;
  return { operationId: operation.operationId, actorId: context.accountId, houseId: context.houseId, outcome: input.outcome as "applied" | "conflict", snapshot };
}
