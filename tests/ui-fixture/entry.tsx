import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HomeRoom } from "@/components/phase2/home-room";
import type { HomeState } from "@/modules/houses/state";
import type { PresenceActionResult } from "@/modules/presence/actions";
import { presenceExpiresAt } from "@/modules/presence/model";
import type { Knock, KnockInput } from "@/modules/knocks/model";
import type { NotificationPreferences } from "@/modules/notifications/model";
import { BoardDomainFixture, createBoardDomainHarness } from "./board-domain";
import { Board } from "@/components/phase3/board";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] as const;
const params = new URLSearchParams(location.search);
const actor = params.get("actor") === "1" ? 1 : 0;
const suffix = `?session=${encodeURIComponent(params.get("session") ?? "default")}&actor=${actor}`;
const identityReady = params.get("identity") !== "unavailable";
const house = { id: "33333333-3333-4333-8333-333333333333", name: "Nhà của Lan và Minh", state: "active", created_at: "2026-10-01T00:00:00Z", identityReady, members: ids.map((id, i) => ({ user_id: id, role: i === 0 ? "owner" : "partner", status: "active", joined_at: "2026-10-01T00:00:00Z", mascot: (identityReady ? i === 0 ? "rabbit" : "owl" : null) as "rabbit" | "owl" | null, profile: { display_name: i === 0 ? "Lan" : "Minh", avatar_url: null } })) };

function Fixture() {
  const [state, setState] = useState<HomeState | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/state${suffix}`, { cache: "no-store" });
    if (response.ok) setState(await response.json() as HomeState);
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => { void refresh().catch(() => {}); }, 0);
    const timer = setInterval(() => { if (navigator.onLine) void refresh().catch(() => {}); }, 350);
    const connection = () => setOnline(navigator.onLine);
    addEventListener("online", connection); addEventListener("offline", connection);
    return () => { clearTimeout(initial); clearInterval(timer); removeEventListener("online", connection); removeEventListener("offline", connection); };
  }, [refresh]);
  async function mutate<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/${path}${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as T;
    await refresh();
    return result;
  }
  return <><p style={{ textAlign: "center", fontSize: 11 }}>Kiểm thử giao diện · dữ liệu mô phỏng, tách khỏi ứng dụng</p><HomeRoom house={house} currentUserId={ids[actor]} state={state} refresh={refresh} online={online}
    savePresence={(input) => mutate<PresenceActionResult>("presence", { ...input, expiresAt: presenceExpiresAt(input, new Date()) })}
    clearPresence={(expectedVersion) => mutate<PresenceActionResult>("presence", { expectedVersion, cleared: true })}
    sendKnock={(input: KnockInput) => mutate<{ knock?: Knock; error?: string }>("knock", input)}
    savePreferences={(input: NotificationPreferences) => mutate<{ preferences?: NotificationPreferences; error?: string }>("preferences", input)}
    dismissKnock={(knockId) => mutate<{ success?: boolean; error?: string }>("dismiss", { knockId })}
    updateDisplayName={async (name) => { const m = house.members[actor]; if (m?.profile) m.profile.display_name = name; return {}; }}
  /></>;
}
if (params.get("board-domain") === "1") window.boardDomainTest = createBoardDomainHarness();
function BoardFixture() {
  const [verified,setVerified]=useState(params.get("sync-paused") !== "1");
  return <>{!verified && <button style={{position:"fixed",right:20,top:90,zIndex:1000005}} onClick={()=>setVerified(true)}>Xác nhận phiên kiểm thử</button>}<Board houseId={house.id} accountId={ids[actor]} initialItems={[]} syncEnabled={verified} onClose={() => history.back()} /></>;
}
createRoot(document.getElementById("root")!).render(params.get("board-ui") === "1" ? <BoardFixture /> : params.get("board-domain") === "1" ? <BoardDomainFixture /> : <Fixture />);
