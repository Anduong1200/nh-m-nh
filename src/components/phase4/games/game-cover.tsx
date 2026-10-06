import type { GameType } from "@/modules/games/model";
/** Decorative box covers, never presented as a saved partner artifact. */
export function GameCover({ type }: { type: GameType }) {
  return <svg className="game-cover" viewBox="0 0 320 150" aria-hidden="true">
    <rect x="2" y="2" width="316" height="146" rx="12" fill="#f4edda"/>
    <path d="M18 125Q155 139 302 125" fill="none" stroke="#cfb991" strokeDasharray="4 6"/>
    <g fill="none" stroke="#3b5142" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {type==="doodle-relay"&&<><path d="m42 104 33-64 15 7-32 65Z" fill="#c19a60"/><path d="m42 104-3 16 19-8"/><path d="M106 87q14-59 40-12t37-5q20-25 27 17t47 0" stroke="#b05d55" strokeWidth="4"/><path d="m244 29-19 53 13 5 22-51Z" fill="#87a190"/><path d="m225 82-1 17 14-12"/><path d="M126 39h19m-10-9v18" stroke="#bd914d"/></>}
      {type==="draw-guess"&&<><rect x="43" y="24" width="137" height="91" rx="3" fill="#fffaf0" transform="rotate(-4 100 65)"/><path d="m71 88 23-42 7 30 26-35 12 51q-34 20-68-4Z" fill="#9ab09b"/><path d="M207 37h66q14 0 14 14v42q0 13-14 13h-26l-19 14 3-14h-24q-14 0-14-13V51q0-14 14-14Z" fill="#e5c6a7"/><path d="M228 58q3-13 18-11t10 19q-13 5-13 14m0 13h.1" strokeWidth="4"/></>}
      {type==="one-line-story"&&<><path d="M53 27q51-13 105 3v93q-53-15-105-1Zm105 3q54-16 108-3v95q-54-14-108 1Z" fill="#fffaf0"/><path d="M73 50h62M73 65h49M73 80h60M180 50h64M180 65h48M180 80h59" stroke="#a49e83"/><path d="m180 109 46-63 11 8-46 64-13 4Z" fill="#c99872"/></>}
      {type==="photo-mission"&&<><rect x="57" y="28" width="87" height="99" rx="3" fill="#fffaf0" transform="rotate(-8 100 75)"/><path d="M66 88V41h68v47Z" fill="#a5b7a4"/><path d="m66 83 21-28 18 22 13-17 16 23"/><rect x="170" y="25" width="93" height="103" rx="3" fill="#fffaf0" transform="rotate(9 218 75)"/><circle cx="216" cy="67" r="22" fill="#d6b479"/><path d="M185 107h59M93 105h23"/><path d="m278 36 5 9 10 2-7 7 1 11-9-5-10 5 2-11-7-7 11-2Z" fill="#bb9060"/></>}
    </g>
  </svg>;
}
