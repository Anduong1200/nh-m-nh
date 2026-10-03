"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { BackgroundNotificationConfiguration } from "@/modules/notifications/push-model";
import type { HouseWithMembers } from "@/modules/houses/server";
import { createPairingInviteAction } from "@/modules/houses/actions";
import type { HomeState } from "@/modules/houses/state";
import { clearPresenceAction, setPresenceAction } from "@/modules/presence/actions";
import type { PresenceInput } from "@/modules/presence/model";
import { dismissKnockAction, sendKnockAction } from "@/modules/knocks/actions";
import type { KnockInput } from "@/modules/knocks/model";
import { saveNotificationPreferencesAction } from "@/modules/notifications/actions";
import type { NotificationPreferences } from "@/modules/notifications/model";
import { updateDisplayNameAction } from "@/modules/houses/actions";
import { HomeRoom } from "@/components/phase2/home-room";
import { IdentitySetup } from "@/components/phase3/identity-setup";
import { SyncCoordinator } from "@/components/phase3/sync-coordinator";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeControl } from "@/components/theme-control";
import { RememberOfflineContext } from "@/components/remember-offline-context";
import "./home.css";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
function readOnline() { return navigator.onLine; }
function serverOnline() { return true; }

export function HouseDashboard({
  house,
  currentUserId,
  initialState,
  initialError = null,
  verifiedAt,
  backgroundNotifications,
}: {
  house: HouseWithMembers;
  currentUserId: string;
  initialState: HomeState | null;
  initialError?: string | null;
  verifiedAt?: string;
  backgroundNotifications?: BackgroundNotificationConfiguration;
}) {
  const router = useRouter();
  const [state, setState] = useState<HomeState | null>(initialState);
  const [currentHouse, setCurrentHouse] = useState(house);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [refreshing, setRefreshing] = useState(false);
  const [actorBlocked, setActorBlocked] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const blocked = useRef(false);
  const mutationInFlight = useRef(false);
  const online = useSyncExternalStore(subscribeOnline, readOnline, serverOnline);
  const isPaired = currentHouse.members.length === 2;
  const recoveryHome = useMemo(() => state ? { house: currentHouse, state } : undefined, [currentHouse, state]);


  const invalidateRefresh = useCallback(() => {
    requestVersion.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const performRefresh = useCallback(async (showLoading = false, duringMutation = false): Promise<boolean> => {
    if (blocked.current || !navigator.onLine || (mutationInFlight.current && !duringMutation)) return false;
    invalidateRefresh();
    const version = requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    if (showLoading) setRefreshing(true);
    try {
      const response = await fetch("/house/state", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (controller.signal.aborted || version !== requestVersion.current) return false;
      if (response.status === 401 || response.status === 403) {
        blocked.current = true;
        setActorBlocked(true);
        setState(null);
        return false;
      }
      if (!response.ok) throw new Error("State unavailable");
      const payload = await response.json() as { currentUserId?: string; house?: HouseWithMembers; state?: HomeState };
      if (controller.signal.aborted || version !== requestVersion.current) return false;
      if (
        payload.currentUserId !== currentUserId || payload.house?.id !== house.id ||
        !payload.house.members.some((member) => member.user_id === currentUserId)
      ) {
        blocked.current = true;
        setActorBlocked(true);
        setState(null);
        return false;
      }
      if (!payload.state || !Array.isArray(payload.state.statuses) || !Array.isArray(payload.state.knocks) || !payload.state.preferences) {
        throw new Error("Invalid state response");
      }
      setCurrentHouse(payload.house);
      setState(payload.state);
      setLoadError(null);
      return true;
    } catch {
      if (!controller.signal.aborted && version === requestVersion.current) {
        setLoadError("Chưa làm mới được Nhà. Bạn có thể thử lại.");
      }
      return false;
    } finally {
      if (version === requestVersion.current) {
        activeRequest.current = null;
        setRefreshing(false);
      }
    }
  }, [currentUserId, house.id, invalidateRefresh]);

  useEffect(() => {
    const refreshWhenAvailable = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !blocked.current) void performRefresh();
    };
    const timer = window.setInterval(refreshWhenAvailable, 20_000);
    window.addEventListener("online", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
      invalidateRefresh();
    };
  }, [performRefresh, invalidateRefresh]);

  async function refresh() { await performRefresh(true); }

  async function runMutation<T>(action: () => Promise<T>, applyResult?: (result: T) => void): Promise<T | { error: string }> {
    if (mutationInFlight.current || blocked.current) return { error: "Một thao tác đang được lưu. Đợi một chút rồi thử lại nhé." };
    mutationInFlight.current = true;
    try {
      if (!await performRefresh(false, true)) return { error: "Chưa xác nhận được kết nối và phiên đăng nhập. Nội dung đang viết vẫn được giữ." };
      invalidateRefresh();
      const result = await action();
      // A response that began before the write must never replace the committed result.
      invalidateRefresh();
      if (!blocked.current) applyResult?.(result);
      return result;
    } finally {
      invalidateRefresh();
      mutationInFlight.current = false;
    }
  }

  async function savePresence(input: PresenceInput) {
    return runMutation(() => setPresenceAction(input, currentUserId), (result) => {
      if (result.status) {
        const status = result.status;
        setState((previous) => previous ? { ...previous, statuses: [...previous.statuses.filter((item) => item.userId !== currentUserId), status] } : previous);
      }
    });
  }
  async function clearPresence(expectedVersion: number) {
    return runMutation(() => clearPresenceAction(expectedVersion, currentUserId), (result) => {
      if (result.status) {
        const status = result.status;
        setState((previous) => previous ? { ...previous, statuses: [...previous.statuses.filter((item) => item.userId !== currentUserId), status] } : previous);
      }
    });
  }
  async function sendKnock(input: KnockInput) {
    return runMutation(() => sendKnockAction(input, currentUserId));
  }
  async function savePreferences(input: NotificationPreferences) {
    return runMutation(() => saveNotificationPreferencesAction(input, currentUserId), (result) => {
      if (result.preferences) {
        const preferences = result.preferences;
        setState((previous) => previous ? { ...previous, preferences } : previous);
      }
    });
  }
  async function dismissKnock(knockId: string) {
    return runMutation(() => dismissKnockAction(knockId, currentUserId), (result) => {
      if (result.success) setState((previous) => previous ? { ...previous, knocks: previous.knocks.filter((knock) => knock.id !== knockId) } : previous);
    });
  }
  async function updateDisplayName(name: string) {
    return runMutation(() => updateDisplayNameAction(name), (result) => {
      if (!result.error) {
        setCurrentHouse((h) => ({
          ...h,
          members: h.members.map(m => m.user_id === currentUserId ? { ...m, profile: { display_name: name, avatar_url: m.profile?.avatar_url ?? null } } : m)
        }));
      }
    });
  }

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setInviteError(null);
    setCopied(false);
    try {
      const result = await createPairingInviteAction();
      if (result.error) setInviteError(result.error);
      else if (result.inviteToken) setInviteToken(result.inviteToken);
    } catch { setInviteError("Chưa tạo được lời mời. Thử lại khi có mạng nhé."); }
    finally { setCreatingInvite(false); }
  }
  async function handleCopyInvite() {
    if (!inviteToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/house/join?token=${inviteToken}`);
      setCopied(true);
    } catch { setInviteError("Trình duyệt chưa sao chép được. Bạn có thể chọn và sao chép đường dẫn bên trên."); }
  }

  if (actorBlocked) {
    return <main id="main-content" className="state-page"><div className="state-paper"><h1>Vào lại Nhà nhé.</h1><p>Phiên đăng nhập hoặc Nhà trên thiết bị đã đổi. Nội dung riêng tư của lần mở trước đã được đóng.</p><Link href="/auth/sign-in" className="primary-button">Đăng nhập lại</Link></div></main>;
  }

  const currentUser = currentHouse.members.find(m => m.user_id === currentUserId);
  if (currentHouse.identityReady && currentUser && !currentUser.mascot) {
    return <IdentitySetup defaultName={currentUser.profile?.display_name ?? ""} onSubmit={() => window.location.reload()} />;
  }

  if (isPaired) {
    return (
      <>
        {verifiedAt && recoveryHome && <RememberOfflineContext accountId={currentUserId} houseId={house.id} verifiedAt={verifiedAt}
          houseName={currentHouse.name} displayName={currentHouse.members.find(member => member.user_id === currentUserId)?.profile?.display_name ?? "Bạn"}
          homeData={recoveryHome} />}
        <HomeRoom key={`${house.id}:${currentUserId}`} house={currentHouse} currentUserId={currentUserId} state={state} refresh={refresh} savePresence={savePresence} clearPresence={clearPresence} sendKnock={sendKnock} savePreferences={savePreferences} dismissKnock={dismissKnock} updateDisplayName={updateDisplayName} refreshing={refreshing} loadError={loadError} online={online} signOutControl={<SignOutButton userId={currentUserId} />} onOpenBoard={() => router.push("/board")} backgroundNotifications={backgroundNotifications} />
        {state?.boardItems && !state.boardError && <SyncCoordinator accountId={currentUserId} houseId={currentHouse.id} />}
      </>
    );
  }

  return (
    <div className="house-shell private-home">
      <header className="house-header">
        <div className="brand"><svg viewBox="0 0 44 44" aria-hidden="true" className="house-mark"><path d="M7 20 22 8l15 12v17H7Z" /><path d="M3 22 22 6l19 16M18 37V25h8v12" /></svg><div><span className="brand-name">{house.name}</span><span className="brand-caption">Một nơi dành cho hai đứa</span></div></div>
        <div className="house-header-actions"><ThemeControl /><SignOutButton userId={currentUserId} /></div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="house-waiting" aria-labelledby="waiting-title">
          <div className="waiting-welcome"><span className="waiting-icon" aria-hidden="true">🔑</span><h1 id="waiting-title">Mời người thương về Nhà</h1><p className="waiting-subtitle">Gửi lời mời để người ấy ghép đôi cùng bạn. Lời mời có hiệu lực trong 24 giờ và chỉ dùng được một lần.</p></div>
          {inviteToken ? <div className="invite-created"><p className="invite-label">Đường dẫn mời:</p><code className="invite-url">{`${typeof window !== "undefined" ? window.location.origin : ""}/house/join?token=${inviteToken}`}</code><button type="button" className="primary-button" onClick={() => void handleCopyInvite()}>{copied ? "Đã sao chép ✓" : "Sao chép đường dẫn"}</button><p className="invite-warning">Chỉ chia sẻ đường dẫn này cho người bạn muốn mời. Nó sẽ hết hạn sau 24 giờ.</p></div> : <button type="button" className="primary-button create-invite-button" onClick={() => void handleCreateInvite()} disabled={creatingInvite || !online}>{creatingInvite ? "Đang tạo…" : "Tạo lời mời"}</button>}
          {!online && <p className="home-notice" role="status">Cần có mạng để tạo lời mời.</p>}
          <p><button type="button" className="home-subtle-button" disabled={refreshing || !online} onClick={() => void refresh()}>{refreshing ? "Đang làm mới…" : "Làm mới Nhà"}</button></p>
          {loadError && <p className="home-notice" role="status">{loadError}</p>}
          {inviteError && <p className="auth-error" role="alert">{inviteError}</p>}
        </section>
      </main>
      <footer className="site-footer"><span>Nhà Mình <span aria-hidden="true">·</span> V1</span><span>Để những điều nhỏ có một nơi ở lại.</span></footer>
    </div>
  );
}
