import {describe,expect,it} from "vitest";
import {captureGameDoodle,doodleBounds} from "./doodle-codec";
const stroke={type:"freedraw",id:"draft",x:10,y:20,width:20,height:10,angle:0,strokeColor:"#243e30",strokeWidth:3,points:[[0,0],[20,10]]};
describe("Game canvas boundary",()=>{
  it("captures only own live strokes and preserves moved/rotated coordinates",()=>{
    expect(captureGameDoodle([{...stroke,id:"shared",x:999},stroke,{...stroke,id:"deleted",isDeleted:true}],new Set(["shared"]))).toEqual({schemaVersion:1,strokes:[{color:"#243e30",width:3,points:[[10,20],[30,30]]}]});
    expect(captureGameDoodle([{...stroke,angle:Math.PI}])?.strokes[0]?.points).toEqual([[30,30],[10,20]]);
  });
  it("rejects unsupported shapes, malformed colors, oversized or nonfinite points",()=>{
    expect(captureGameDoodle([{...stroke,type:"image"}])).toBeNull();
    expect(captureGameDoodle([{...stroke,strokeColor:"url(javascript:bad)"}])).toBeNull();
    expect(captureGameDoodle([{...stroke,points:[[Infinity,1]]}])).toBeNull();
    expect(captureGameDoodle([{...stroke,points:Array.from({length:10001},()=>[1,2])}])).toBeNull();
  });
  it("computes safe bounds for the maximum multi-turn artifact without spreading arrays",()=>{
    const points=Array.from({length:120000},(_,i)=>[i%1000,i%200]);
    expect(doodleBounds({schemaVersion:1,strokes:[{color:"#243e30",width:3,points}]})).toBe("-20 -20 1039 239");
  });
});
