import { describe, expect, it } from "vitest";
import { parseBoardItemInput, parseBoardItemUpdate, validBoardPayload, sameBoardJson } from "./model";
const id="11111111-1111-4111-8111-111111111111", operationId="22222222-2222-4222-8222-222222222222";
describe("Board content contract",()=> {
  it("preserves Vietnamese multiline notes and counts Unicode code points",()=> {
    expect(validBoardPayload("note",{text:"Một ngôi Nhà\nHai đứa mình"})).toBe(true);
    expect(validBoardPayload("note",{text:"🐰".repeat(10000)})).toBe(true);
    expect(validBoardPayload("note",{text:"🐰".repeat(10001)})).toBe(false);
  });
  it.each([
    ["note",{text:"bad\u0001"}], ["note",{text:"ok",extra:"unsafe"}],
    ["link",{url:"javascript:alert(1)"}], ["link",{url:"data:text/html,x"}], ["link",{url:"https://name:password@example.com"}],
    ["link",{url:"https://"}], ["link",{url:"https://example.com\n"}],
    ["doodle",{schemaVersion:2,strokes:[]}], ["doodle",{schemaVersion:1,strokes:[{width:2,color:"url(evil)",points:[]}]}],
    ["doodle",{schemaVersion:1,strokes:[{width:2,color:"#ffffff",points:[[NaN,2]]}]}],
    ["doodle",{schemaVersion:1,strokes:[{width:2,color:"#ffffff",points:[[0,0,0]]}]}],
    ["photo",{url:"https://public.invalid"}], ["voice",{}],
  ])("rejects unsafe or malformed %s payload",(type,payload)=> {expect(validBoardPayload(type,payload)).toBe(false);});
  it("supports bounded doodles and validated media IDs without URLs",()=> {
    expect(validBoardPayload("doodle",{schemaVersion:1,strokes:[{color:"#abcdef",width:2,points:[[0,1],[10,20]]}]})).toBe(true);
    expect(validBoardPayload("photo",{caption:"Đi cùng nhau"},id)).toBe(true);
    expect(validBoardPayload("voice",{},id)).toBe(true);
  });
  it.each([NaN,Infinity,-10001,10001,null,"12"])("rejects invalid coordinates without silently coercing: %j",(x)=> {
    expect(parseBoardItemInput({id,operationId,type:"note",payload:{text:"ok"},x}).value).toBeUndefined();
  });
  it("requires a stable operation ID and rejects unrelated auth/House fields",()=> {
    expect(parseBoardItemInput({id,type:"note",payload:{text:"ok"}}).value).toBeUndefined();
    expect(parseBoardItemInput({id,operationId,type:"note",payload:{text:"ok"},houseId:id}).value).toBeUndefined();
    expect(parseBoardItemUpdate({id,operationId,expectedVersion:0,x:1}).value).toBeUndefined();
    expect(parseBoardItemUpdate({id,operationId,expectedVersion:1}).value).toBeUndefined();
  });
  it("does not combine trash/restore with an edit and compares canonical JSON key order",()=> {
    expect(parseBoardItemUpdate({id,operationId,expectedVersion:1,deleted:true,x:1}).value).toBeUndefined();
    expect(parseBoardItemUpdate({id,operationId,expectedVersion:1,deleted:false}).value).toBeTruthy();
    expect(sameBoardJson({a:1,b:{c:2,d:3}},{b:{d:3,c:2},a:1})).toBe(true);
  });
});
