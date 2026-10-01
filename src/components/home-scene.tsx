export function HomeScene() {
  return (
    <svg
      viewBox="0 0 700 500"
      role="img"
      aria-labelledby="home-scene-title home-scene-description"
      className="home-scene"
    >
      <title id="home-scene-title">Minh họa căn phòng Nhà Mình</title>
      <desc id="home-scene-description">
        Căn phòng ấm áp với hai chiếc cốc trên bàn, khung cửa sổ, bảng trống,
        hộp trò chơi đóng, lá thư minh họa, cây xanh, thỏ và cú.
        Các đồ vật chỉ là trang trí trong bản khởi tạo.
      </desc>
      <defs>
        <pattern id="wall-paper" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1" className="scene-wall-dot" />
        </pattern>
        <pattern id="floor-grain" width="100" height="28" patternUnits="userSpaceOnUse">
          <path d="M0 27h100M60 0v27M9 7h20m42 14h17" className="scene-floor-grain" />
        </pattern>
        <linearGradient id="window-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="sky-start" />
          <stop offset="1" className="sky-end" />
        </linearGradient>
      </defs>

      <path d="M67 46Q348 15 630 46l14 295H51Z" className="scene-wall" />
      <path d="M67 46Q348 15 630 46l14 295H51Z" fill="url(#wall-paper)" />
      <path d="m51 341 593 0 36 113Q350 506 17 454Z" className="scene-floor" />
      <path d="m51 341 593 0 36 113Q350 506 17 454Z" fill="url(#floor-grain)" />
      <path d="M54 340h589" className="scene-outline" />

      {/* Window: the view changes with the same local theme as the room. */}
      <path d="M281 69q88-14 169 0v178H281Z" className="scene-window-frame" />
      <path d="M294 79q76-11 143 0v152H294Z" fill="url(#window-sky)" />
      <circle cx="405" cy="107" r="17" className="scene-sun" />
      <path d="M412 92a18 18 0 1 0 10 32 19 19 0 0 1-10-32" className="scene-moon" />
      <g className="scene-stars">
        <path d="m314 104 0 8m-4-4h8m55 22v6m-3-3h6m44 19v6m-3-3h6" />
      </g>
      <path d="m294 207 35-35 36 25 30-43 42 48v30H294Z" className="scene-hills-back" />
      <path d="m294 226 37-30 43 27 27-22 36 26v5H294Z" className="scene-hills-front" />
      <path d="M367 70v168M287 152h157" className="scene-window-divider" />
      <path d="M271 237h187v15H271Z" className="scene-wood" />
      <path d="M284 65c-9 38-13 113-9 166m171-166c12 43 13 119 8 166" className="scene-curtain" />

      {/* A blank board is intentional: this is a public shell, never partner data. */}
      <g transform="rotate(-3 167 170)">
        <rect x="86" y="113" width="155" height="113" rx="5" className="scene-wood" />
        <rect x="94" y="121" width="139" height="97" rx="2" className="scene-board" />
        <path d="M137 207h60" className="scene-board-line" />
        <path d="m140 170 19-20 22 23 16-14" className="scene-board-doodle" />
        <circle cx="199" cy="141" r="5" className="scene-board-doodle" />
      </g>

      {/* Shelf, field map and owl. */}
      <path d="M500 216h110v12H500Z" className="scene-wood" />
      <path d="M505 224v15m94-15v15" className="scene-outline" />
      <g className="scene-map-card" transform="translate(0 -20) rotate(5 544 151)">
        <rect x="500" y="109" width="86" height="77" rx="3" className="scene-paper" />
        <path d="m511 129 20-9 16 15 28-13v49l-26 9-18-14-20 9Z" className="scene-map" />
        <path d="m531 120 0 46m16-31 2 45" className="scene-map-fold" />
        <path d="m514 152 9-8 17 12 12-9 17-5" className="scene-map-path" />
      </g>
      <g className="scene-owl" data-mascot="owl">
        <path d="M533 174l10 8q12-7 24 0l10-8-3 28q-2 12-19 12t-19-12Z" className="scene-owl-body" />
        <circle cx="546" cy="189" r="9" className="scene-cream" />
        <circle cx="565" cy="189" r="9" className="scene-cream" />
        <circle cx="547" cy="189" r="2" className="scene-eye" />
        <circle cx="564" cy="189" r="2" className="scene-eye" />
        <path d="m551 197 5 5 4-5Z" className="scene-beak" />
        <path d="m539 199 5 7m25-7-5 7m-18 8v2m17-2v2" className="scene-mascot-detail" />
      </g>

      {/* Plant and lamp. */}
      <path d="M87 319q20-44 27-64m-14 49q-20-30-33-32m37 20q17-34 37-39" className="scene-plant-stem" />
      <path d="M114 267q-6-29 11-36 11 18-11 36M91 290q-28-2-27-23 25 0 27 23m23-11q6-29 28-27-1 25-28 27" className="scene-leaf" />
      <path d="m78 315 37 0-5 39H84Z" className="scene-pot" />
      <path d="M592 294v65m-21 0h42" className="scene-outline" />
      <path d="m569 259 43 0 11 37h-65Z" className="scene-lampshade" />
      <ellipse cx="590" cy="307" rx="40" ry="8" className="scene-lamp-glow" />

      {/* Rug and a low shared table with two distinct mugs. */}
      <ellipse cx="358" cy="405" rx="183" ry="48" className="scene-rug" />
      <ellipse cx="358" cy="405" rx="167" ry="37" className="scene-rug-line" />
      <path d="m223 357 6 62m265-63-6 62M287 356l-2 57m143-59 4 59" className="scene-table-leg" />
      <path d="M210 310q143-26 296 0l9 52q-151 26-315 0Z" className="scene-table" />
      <path d="M201 349q157 22 313 0" className="scene-table-edge" />
      <g transform="rotate(-8 315 321)">
        <path d="M286 308h40v24q-19 11-40 0Z" className="scene-mug-green" />
        <path d="M326 312q17-2 15 9t-15 5" className="scene-mug-handle" />
        <ellipse cx="306" cy="308" rx="20" ry="5" className="scene-mug-top" />
      </g>
      <g transform="rotate(7 391 325)">
        <path d="M373 311h35v23q-17 8-35 0Z" className="scene-mug-clay" />
        <path d="M409 315q15-2 14 8t-15 3" className="scene-mug-handle" />
        <ellipse cx="391" cy="311" rx="17" ry="4" className="scene-mug-top" />
      </g>
      <g className="scene-steam">
        <path d="M306 294q-7-7 0-13m86 15q8-7 0-13" />
      </g>
      <g transform="rotate(-9 454 334)">
        <rect x="430" y="320" width="53" height="33" rx="2" className="scene-paper" />
        <path d="m431 321 26 18 25-18" className="scene-envelope" />
      </g>

      {/* Closed game box and rabbit are decorative, without activity claims. */}
      <g transform="rotate(-5 139 381)">
        <path d="M92 359h94v52H92Z" className="scene-game-box" />
        <path d="M88 354h102v15H88Z" className="scene-game-lid" />
        <path d="m127 387 8-10 7 10 12-2-5 11-21 1Z" className="scene-game-symbol" />
      </g>
      <g className="scene-rabbit" data-mascot="rabbit">
        <circle cx="580" cy="395" r="9" className="scene-cream" />
        <ellipse cx="556" cy="391" rx="24" ry="25" className="scene-cream" />
        <ellipse cx="544" cy="346" rx="7" ry="25" transform="rotate(-15 544 346)" className="scene-cream" />
        <ellipse cx="562" cy="344" rx="7" ry="26" transform="rotate(12 562 344)" className="scene-cream" />
        <path d="m539 334 8 27m19-29-6 29" className="scene-rabbit-ear" />
        <ellipse cx="553" cy="374" rx="22" ry="20" className="scene-cream" />
        <circle cx="545" cy="372" r="2" className="scene-eye" />
        <circle cx="561" cy="372" r="2" className="scene-eye" />
        <path d="m550 379 3 3 3-3Z" className="scene-rabbit-nose" />
        <path d="M553 382v3m-5 0q5 4 10 0M547 396v9m14-9v9" className="scene-mascot-detail" />
        <ellipse cx="543" cy="413" rx="10" ry="4" className="scene-cream" />
        <ellipse cx="567" cy="413" rx="10" ry="4" className="scene-cream" />
      </g>

      <path d="m55 83-12 4m2-25 7 8m596 9 12 4m-4-20-7 8" className="scene-spark" />
    </svg>
  );
}
