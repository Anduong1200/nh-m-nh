"use client";
import type { MouseEventHandler, ReactNode } from "react";
import { HomeScene } from "@/components/home-scene";

export function HomeInteractiveRoom({ statusesNode, knocksNode, navigationNode, openBoard, openPresence, openSettings, openKnock }: {
  statusesNode?: ReactNode; knocksNode?: ReactNode; navigationNode?: ReactNode;
  openBoard: () => void; openPresence: MouseEventHandler<HTMLButtonElement>;
  openSettings: MouseEventHandler<HTMLButtonElement>; openKnock: MouseEventHandler<HTMLButtonElement>;
}) {
  return <div className="home-interactive-room lived-room">
    <div className="lived-room-space">
      <figure className="lived-room-stage">
        <HomeScene interactive />
        <button type="button" data-room-control className="room-object room-board" aria-label="Mở Bảng Chung" onClick={openBoard}><span aria-hidden="true">⌑</span> Bảng Chung</button>
        <button type="button" data-room-control className="room-object room-presence" aria-label="Trạng thái của mình" onClick={openPresence}><span aria-hidden="true">☀</span> Trạng thái của mình</button>
        <button type="button" data-room-control className="room-object room-knock" aria-label="Gõ cửa một chút" onClick={openKnock}><span aria-hidden="true">✦</span> Gõ cửa một chút</button>
        <button type="button" data-room-control className="room-object room-settings" aria-label="Nhịp thông báo" onClick={openSettings}><span aria-hidden="true">⚙</span> Nhịp thông báo</button>
        <figcaption>Hai chiếc cốc. Một chiếc bàn. Chỗ của hai đứa.</figcaption>
      </figure>
      <div className="home-room-navigation">{navigationNode}</div>
    </div>
    <aside className="lived-room-notebook" aria-label="Những điều người ấy để lại">
      <div className="room-notebook-heading"><span aria-hidden="true">✦</span><h2>Nhịp của hai đứa</h2><p>Mỗi người một nhịp, cùng một Nhà.</p></div>
      <div data-room-presence className="room-people">{statusesNode}</div>
      <section className="room-knock-shelf"><h3>Góc gõ cửa</h3><div id="knock-container">{knocksNode}</div></section>
    </aside>
  </div>;
}
