import React from "react";

export function MascotOwl({ className = "" }: { className?: string }) {
  return (
    <svg data-mascot="owl" aria-hidden="true" viewBox="0 0 64 60" className={`w-12 h-12 inline-block ${className}`}>
      <style>{`
        @keyframes owl-blink {
          0%, 96%, 100% { transform: scaleY(1); }
          98% { transform: scaleY(0.1); }
        }
        @keyframes owl-breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.05); }
        }
        .owl-eye { animation: owl-blink 4s infinite ease-in-out; transform-box: fill-box; transform-origin: center; }
        .owl-body { animation: owl-breathe 3s infinite ease-in-out; transform-box: fill-box; transform-origin: bottom; }
      `}</style>
      <g data-mascot-artwork transform="translate(-523 -162)"><g className="owl-body scene-owl">
        <path d="M533 174l10 8q12-7 24 0l10-8-3 28q-2 12-19 12t-19-12Z" fill="var(--scene-wood)" />
        <circle cx="546" cy="189" r="9" fill="var(--scene-cream)" />
        <circle cx="565" cy="189" r="9" fill="var(--scene-cream)" />
        <g transform="translate(547 189)">
          <circle className="owl-eye" cx="0" cy="0" r="3" fill="var(--scene-outline)" />
        </g>
        <g transform="translate(564 189)">
          <circle className="owl-eye" cx="0" cy="0" r="3" fill="var(--scene-outline)" />
        </g>
        <path d="m551 197 5 5 4-5Z" fill="#d8aa79" />
        <path d="m539 199 5 7m25-7-5 7m-18 8v2m17-2v2" stroke="var(--scene-outline)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g></g>
    </svg>
  );
}

export function MascotRabbit({ className = "" }: { className?: string }) {
  return (
    <svg data-mascot="rabbit" aria-hidden="true" viewBox="0 0 72 115" className={`w-12 h-20 inline-block ${className}`}>
      <style>{`
        @keyframes rabbit-blink {
          0%, 96%, 100% { transform: scaleY(1); }
          98% { transform: scaleY(0.1); }
        }
        @keyframes rabbit-breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.03); }
        }
        @keyframes rabbit-ear-twitch {
          0%, 90%, 100% { transform: rotate(0deg); }
          95% { transform: rotate(5deg); }
        }
        .rabbit-eye { animation: rabbit-blink 3s infinite ease-in-out; transform-box: fill-box; transform-origin: center; }
        .rabbit-body { animation: rabbit-breathe 2.5s infinite ease-in-out; transform-box: fill-box; transform-origin: bottom; }
        .rabbit-ear-right { animation: rabbit-ear-twitch 5s infinite ease-in-out; transform-box: fill-box; transform-origin: bottom; }
      `}</style>
      <g data-mascot-artwork transform="translate(-515 -308)"><g className="rabbit-body scene-rabbit">
        <circle cx="570" cy="395" r="9" fill="var(--scene-cream)" />
        <ellipse cx="550" cy="391" rx="24" ry="25" fill="var(--scene-cream)" />
        <ellipse cx="544" cy="346" rx="7" ry="25" transform="rotate(-15 544 346)" fill="var(--scene-cream)" />
        <g transform="translate(562 344)">
          <ellipse className="rabbit-ear-right" cx="0" cy="0" rx="7" ry="26" fill="var(--scene-cream)" />
        </g>
        <ellipse cx="553" cy="374" rx="22" ry="20" fill="var(--scene-cream)" />
        
        <g transform="translate(545 372)">
          <circle className="rabbit-eye" cx="0" cy="0" r="2.5" fill="var(--scene-outline)" />
        </g>
        <g transform="translate(561 372)">
          <circle className="rabbit-eye" cx="0" cy="0" r="2.5" fill="var(--scene-outline)" />
        </g>
        <path d="m550 379 3 3 3-3Z" fill="#d8aa79" />
        <path d="M553 382v3m-5 0q5 4 10 0M547 396v9m14-9v9" stroke="var(--scene-outline)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <ellipse cx="543" cy="413" rx="10" ry="4" fill="var(--scene-cream)" />
        <ellipse cx="567" cy="413" rx="10" ry="4" fill="var(--scene-cream)" />
      </g></g>
    </svg>
  );
}
