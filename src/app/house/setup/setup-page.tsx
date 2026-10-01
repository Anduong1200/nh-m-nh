"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHouseAction } from "@/modules/houses/actions";

export function SetupPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateHouse() {
    setCreating(true);
    setError(null);

    const result = await createHouseAction();

    if (result?.error) {
      setError(result.error);
      setCreating(false);
    }
    // On success, createHouseAction redirects to /house.
  }

  return (
    <main id="main-content" className="auth-page">
      <div className="auth-card setup-card">
        <div className="auth-header">
          <svg viewBox="0 0 44 44" aria-hidden="true" className="auth-house-mark">
            <path d="M7 20 22 8l15 12v17H7Z" />
            <path d="M3 22 22 6l19 16M18 37V25h8v12" />
            <path d="M12 22h4v5h-4zm16 0h4v5h-4z" />
            <path d="m29 6 2-3m3 8 4-1" />
          </svg>
          <h1>Bắt đầu dựng Nhà</h1>
          <p className="auth-subtitle">
            Tạo một Nhà mới, rồi mời người thương ghép đôi.
          </p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <div className="setup-options">
          <div className="setup-option">
            <div className="setup-option-header">
              <span className="setup-option-icon" aria-hidden="true">🏠</span>
              <h2>Dựng Nhà mới</h2>
            </div>
            <p>
              Bạn sẽ là người đầu tiên. Sau đó gửi lời mời cho người thương.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={handleCreateHouse}
              disabled={creating}
            >
              {creating ? "Đang dựng Nhà…" : "Dựng Nhà mới"}
            </button>
          </div>

          <div className="setup-divider">
            <span>hoặc</span>
          </div>

          <div className="setup-option">
            <div className="setup-option-header">
              <span className="setup-option-icon" aria-hidden="true">💌</span>
              <h2>Nhận lời mời</h2>
            </div>
            <p>
              Nếu người thương đã tạo Nhà và gửi đường dẫn mời, hãy mở đường dẫn
              đó trong trình duyệt.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => router.push("/house/join")}
            >
              Tôi có đường dẫn mời
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
