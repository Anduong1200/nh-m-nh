"use client";

import { useEffect, useRef, useState } from "react";

export function AppRuntime() {
  const [offline, setOffline] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const acceptingUpdate = useRef(false);

  useEffect(() => {
    const reflectConnection = () => setOffline(!navigator.onLine);
    reflectConnection();
    window.addEventListener("online", reflectConnection);
    window.addEventListener("offline", reflectConnection);
    return () => {
      window.removeEventListener("online", reflectConnection);
      window.removeEventListener("offline", reflectConnection);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const workers = new Set<ServiceWorker>();
    const reflectWaiting = () => {
      if (!disposed && registration?.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(registration.waiting);
      }
    };
    const onStateChange = () => reflectWaiting();
    const onUpdateFound = () => {
      const worker = registration?.installing;
      if (worker) {
        workers.add(worker);
        worker.addEventListener("statechange", onStateChange);
      }
    };
    const onControllerChange = () => {
      // First install and updates accepted in another tab never interrupt this tab.
      if (acceptingUpdate.current) window.location.reload();
      else setWaitingWorker(null);
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((result) => {
        if (disposed) return;
        registration = result;
        reflectWaiting();
        registration.addEventListener("updatefound", onUpdateFound);
        onUpdateFound();
      })
      .catch(() => {
        // The online app remains usable if a browser declines service workers.
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
      workers.forEach((worker) => worker.removeEventListener("statechange", onStateChange));
    };
  }, []);

  function acceptUpdate() {
    if (!waitingWorker || updating) return;
    try {
      setUpdateError(false);
      acceptingUpdate.current = true;
      waitingWorker.postMessage({ type: "ACTIVATE_UPDATE" });
      setUpdating(true);
    } catch {
      acceptingUpdate.current = false;
      setUpdateError(true);
    }
  }

  if (!offline && !waitingWorker) return null;

  return (
    <aside className="runtime-notice" aria-label="Kết nối và phiên bản ứng dụng">
      {offline && <p role="status">Đang ngoại tuyến. Bạn có thể kết nối lại khi thuận tiện.</p>}
      {waitingWorker && (
        <div>
          <p role="status">
            {updateError
              ? "Chưa thể cập nhật. Bạn có thể thử lại."
              : "Có phiên bản mới. Lưu việc đang làm trước khi cập nhật."}
          </p>
          <button className="runtime-update" type="button" onClick={acceptUpdate} disabled={updating}>
            {updating ? "Đang cập nhật…" : "Cập nhật khi bạn sẵn sàng"}
          </button>
        </div>
      )}
    </aside>
  );
}
