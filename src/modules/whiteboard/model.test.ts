import { describe, expect, it } from "vitest";
import { emptyWhiteboardScene, normalizeWhiteboardDocument, parseWhiteboardScene, parseWhiteboardOperation, whiteboardReceipt, whiteboardSnapshot } from "./model";
import { textScene } from "./test-fixtures";
const context = { accountId: "11111111-1111-4111-8111-111111111111", houseId: "33333333-3333-4333-8333-333333333333" };
describe("Whiteboard bounded native snapshots", () => {
  it("normalizes restore-only metadata while retaining geometry, bindings, native versions and tombstones",()=>{
    const scene=textScene(),restored=structuredClone(scene);
    restored.elements[0]!.boundElements=[];
    expect(normalizeWhiteboardDocument(restored)).toEqual(scene);
    restored.elements[0]!.x=17;restored.elements[0]!.version=3;restored.elements[0]!.isDeleted=true;
    const normalized=normalizeWhiteboardDocument(restored);
    expect(normalized.elements[0]).toMatchObject({x:17,version:3,isDeleted:true});
    const draw={...scene.elements[0]!,type:"freedraw",boundElements:[{id:"bound",type:"text"}],lastCommittedPoint:[5,9]};
    const clean=normalizeWhiteboardDocument({...scene,elements:[draw]}).elements[0]!;
    expect(clean.lastCommittedPoint).toBeNull();expect(clean.boundElements).toEqual(draw.boundElements);
    expect(draw.lastCommittedPoint).toEqual([5,9]);
  });
  it("retains Vietnamese text and deleted element tombstones without appState", () => {
    const scene = textScene("Thỏ và Cú");
    scene.elements[0]!.isDeleted = true;
    expect(parseWhiteboardScene(scene)).toEqual(scene);
  });
  it.each(["image","iframe","embeddable","magicframe"])("rejects %s and all media/remote embeds", type => {
    const scene = textScene(); scene.elements[0]!.type = type;
    expect(parseWhiteboardScene(scene)).toBeNull();
  });
  it.each([{ link: "https://example.com" }, { customData: { token: "private" } }, { fontFamily: "5" }, { x: Infinity }, { text: "a".repeat(10001) }, { index: "bad!" }, { containerId: "missing" }])("rejects unsafe native fields %s", patch => {
    const scene = textScene(); Object.assign(scene.elements[0]!,patch);
    expect(parseWhiteboardScene(scene)).toBeNull();
  });
  it("rejects duplicate IDs, wrong schemas, excess elements, dangling bindings and invalid pressures", () => {
    const scene = textScene();
    expect(parseWhiteboardScene({ ...scene, elements: [scene.elements[0],scene.elements[0]] })).toBeNull();
    expect(parseWhiteboardScene({ ...scene, schemaVersion: 2 })).toBeNull();
    expect(parseWhiteboardScene({ ...scene, files: {} })).toBeNull();
    expect(parseWhiteboardScene({ ...scene, elements: Array.from({length:1001},(_,i)=>({...scene.elements[0],id:String(i)})) })).toBeNull();
    scene.elements[0]!.boundElements = [{ id: "missing", type: "text" }];
    expect(parseWhiteboardScene(scene)).toBeNull();
  });
  it("accepts version-zero virtual empty state only; no coerced versions", () => {
    expect(whiteboardSnapshot({ houseId: context.houseId, version: 0, scene: emptyWhiteboardScene(), updatedBy: null, updatedAt: null })).not.toBeNull();
    expect(whiteboardSnapshot({ houseId: context.houseId, version: 0, scene: textScene(), updatedBy: null, updatedAt: null })).toBeNull();
    expect(parseWhiteboardOperation({ operationId: crypto.randomUUID(), expectedVersion: "0", scene: textScene() })).toBeNull();
  });
  it("requires exact actor, House, version and scene before acknowledging a receipt", () => {
    const operation = { operationId: crypto.randomUUID(), expectedVersion: 0, scene: textScene() };
    const receipt = { operationId: operation.operationId, actorId: context.accountId, houseId: context.houseId, outcome: "applied", snapshot: { houseId: context.houseId, version: 1, scene: operation.scene, updatedBy: context.accountId, updatedAt: new Date().toISOString() } };
    expect(whiteboardReceipt(receipt,context,operation)).not.toBeNull();
    for (const patch of [{actorId:crypto.randomUUID()},{houseId:crypto.randomUUID()},{snapshot:{...receipt.snapshot,version:2}},{snapshot:{...receipt.snapshot,scene:textScene("Khác")}}]) expect(whiteboardReceipt({...receipt,...patch},context,operation)).toBeNull();
    expect(whiteboardReceipt({...receipt,outcome:"conflict"},context,operation)).not.toBeNull();
    expect(whiteboardReceipt({...receipt,outcome:"conflict",snapshot:{...receipt.snapshot,version:0}},context,operation)).toBeNull();
  });
});
