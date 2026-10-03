import { describe,expect,it } from "vitest";
import { boardJson,localBoardItem } from "./board-local";
const actor=crypto.randomUUID(),houseId=crypto.randomUUID(),mediaId=crypto.randomUUID();
function item(type: string,payload: unknown,extra: Record<string,unknown>={}) { return {id:crypto.randomUUID(),houseId,createdBy:actor,type,payload,x:0,y:0,rotation:0,zIndex:0,version:0,...extra}; }
describe("Board local recovery",()=>{
  it.each([
    ["note",{text:"Chưa gửi"},{}],
    ["link",{url:"https://example.com",title:"Một nơi nhỏ"},{}],
    ["doodle",{schemaVersion:1,strokes:[{color:"#243e30",width:3,points:[[1,2],[3,4]]}]},{}],
    ["photo",{caption:"Ảnh riêng"},{mediaId}],
    ["voice",{caption:"Lời nhỏ"},{mediaId}],
  ])("recovers %s drafts with the original media reference and House",(type,payload,extra)=>{
    const value=item(String(type),payload,extra as Record<string,unknown>);expect(localBoardItem(boardJson({item:value}),actor,houseId)).toMatchObject(value);
  });
  it("does not revive archived drafts or rebind another House/creator",()=>{
    const value=item("note",{text:"Riêng"});
    expect(localBoardItem(boardJson({archived:true,item:value}),actor,houseId)).toBeNull();
    expect(localBoardItem(boardJson({item:value}),actor,crypto.randomUUID())).toBeNull();
    expect(localBoardItem(boardJson({item:value}),crypto.randomUUID(),houseId)).toBeNull();
  });
  it("permits local edits of an existing partner object and rejects unsafe media/URLs",()=>{
    expect(localBoardItem(boardJson({item:item("note",{text:"Cả hai được sửa"},{version:3,createdBy:crypto.randomUUID()})}),actor,houseId)).toBeTruthy();
    expect(localBoardItem(boardJson({item:item("photo",{caption:""})}),actor,houseId)).toBeNull();
    expect(localBoardItem(boardJson({item:item("link",{url:"javascript:alert(1)"})}),actor,houseId)).toBeNull();
  });
});
