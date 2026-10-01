"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { acceptPairingInviteAction } from "@/modules/houses/actions";

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleAcceptInvite() {
    if (!token.trim()) {
      setError("Vui lòng nhập mã mời.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await acceptPairingInviteAction(token.trim());

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess(true);
      // Wait a moment so the user sees the success message, then redirect.
      setTimeout(() => router.push("/house"), 1500);
    }
  }

  if (success) {
    return (
      <main id="main-content" className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <span className="paired-icon" aria-hidden="true">🏡</span>
            <h1>Về Nhà thành công!</h1>
            <p className="auth-subtitle">
              Hai đứa đã ở trong cùng một Nhà. Đang chuyển hướng…
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <svg viewBox="0 0 44 44" aria-hidden="true" className="auth-house-mark">
            <path d="M7 20 22 8l15 12v17H7Z" />
            <path d="M3 22 22 6l19 16M18 37V25h8v12" />
            <path d="M12 22h4v5h-4zm16 0h4v5h-4z" />
            <path d="m29 6 2-3m3 8 4-1" />
          </svg>
          <h1>Nhận lời mời</h1>
          <p className="auth-subtitle">
            Dán đường dẫn mời hoặc mã mời để ghép đôi và về Nhà cùng người thương.
          </p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <div className="join-form">
          <label htmlFor="invite-token" className="join-label">
            Mã mời
          </label>
          <input
            id="invite-token"
            type="text"
            className="join-input"
            placeholder="Dán mã mời ở đây…"
            value={token}
            onChange={(e) => {
              // Extract token from full URL if pasted.
              const val = e.target.value;
              const match = val.match(/[?&]token=([a-f0-9]+)/i);
              setToken(match?.[1] ?? val);
            }}
            disabled={loading}
          />
          <button
            type="button"
            className="primary-button"
            onClick={handleAcceptInvite}
            disabled={loading || !token.trim()}
          >
            {loading ? "Đang xử lý…" : "Về Nhà"}
          </button>
        </div>
      </div>
    </main>
  );
}

export function JoinPage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="auth-page">
          <div className="auth-card">
            <div className="auth-header">
              <h1>Đang tải…</h1>
            </div>
          </div>
        </main>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
