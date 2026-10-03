import { parseGameMove, type GameMove } from "@/modules/games/model";
export type GameDoodle = Extract<GameMove,{kind:"doodle"}>["payload"];
export const emptyGameDoodle = (): GameDoodle => ({schemaVersion:1,strokes:[]});
type NativeStroke = {type: string; isDeleted?: boolean; id: string; x: number; y: number; width: number; height: number; angle: number; strokeColor: string; strokeWidth: number; points?: readonly (readonly number[])[]};
/** Only bounded stroke data leaves the canvas library; no SVG, links or files. */
export function captureGameDoodle(elements: readonly NativeStroke[], backgroundIds = new Set<string>()): GameDoodle | null {
  try {
    const strokes: GameDoodle["strokes"]=[];
    for (const element of elements) {
      if (element.isDeleted||backgroundIds.has(element.id)) continue;
      if (element.type!=="freedraw"||!element.points) return null;
      const cx=element.width/2,cy=element.height/2,cos=Math.cos(element.angle),sin=Math.sin(element.angle);
      const points=element.points.map(([x,y])=>[Math.round((element.x+cx+(x!-cx)*cos-(y!-cy)*sin)*100)/100,Math.round((element.y+cy+(x!-cx)*sin+(y!-cy)*cos)*100)/100]);
      strokes.push({color:element.strokeColor,width:element.strokeWidth,points});
    }
    const payload={schemaVersion:1 as const,strokes};
    return strokes.length===0 ? payload : parseGameMove({kind:"doodle",payload})?.kind==="doodle" ? payload : null;
  } catch {return null;}
}
export function doodleBounds(doodle: GameDoodle) {
  const points=doodle.strokes.flatMap(s=>s.points);
  if (!points.length) return "0 0 640 360";
  const box=points.reduce((b,p)=>({left:Math.min(b.left,p[0]!),right:Math.max(b.right,p[0]!),top:Math.min(b.top,p[1]!),bottom:Math.max(b.bottom,p[1]!)}),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
  const left=box.left-20,top=box.top-20;
  return `${left} ${top} ${Math.max(100,box.right-left+20)} ${Math.max(100,box.bottom-top+20)}`;
}
