"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeAuthRedirect } from "@/modules/auth/redirect";

function SignInContent({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "missing_code"
      ? "Thiếu mã xác thực. Vui lòng thử lại."
      : errorParam === "auth_failed"
        ? "Đăng nhập thất bại. Vui lòng thử lại."
        : null,
  );

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", safeAuthRedirect(searchParams.get("next")));
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callback.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (authError) {
        setError("Không thể kết nối đăng nhập. Vui lòng thử lại.");
        setLoading(false);
      }
      // If no error, the browser will redirect to Google.
    } catch {
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
      setLoading(false);
    }
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
          <h1>Chào mừng về Nhà</h1>
          <p className="auth-subtitle">
            Ngôi nhà nhỏ và thế giới của hai đứa.
          </p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="9" />
              <path d="M10 6v5m0 2v1" />
            </svg>
            {error}
          </div>
        )}

        <button
          className="google-sign-in-button"
          onClick={signInWithGoogle}
          disabled={loading || !configured}
          type="button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="google-icon">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {loading ? "Đang kết nối…" : "Đăng nhập với Google"}
        </button>

        {!configured && <p role="status">Đăng nhập chưa được mở ở phiên bản này.</p>}
        <p className="auth-privacy-note">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 9V6a5 5 0 0 1 10 0v3M4 9h12v9H4Z" />
            <circle cx="10" cy="13" r="1" />
          </svg>
          Nhà Mình dùng tài khoản Google để xác thực. Không gian của hai đứa
          được bảo vệ theo quyền thành viên trong Nhà.
        </p>
      </div>
    </main>
  );
}

export function SignInPage({ configured }: { configured: boolean }) {
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
      <SignInContent configured={configured} />
    </Suspense>
  );
}
