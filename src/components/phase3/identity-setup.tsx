"use client";

import { useState } from "react";
import { updateDisplayNameAction, assignMascotAction } from "@/modules/houses/actions";

export function IdentitySetup({
  defaultName,
  onSubmit,
}: {
  defaultName: string;
  onSubmit: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [mascot, setMascot] = useState<"rabbit" | "owl" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Vui lòng nhập tên hoặc biệt danh.");
      return;
    }
    if (!mascot) {
      setError("Vui lòng chọn một linh vật.");
      return;
    }

    setLoading(true);
    setError(null);

    // Update name
    const nameResult = await updateDisplayNameAction(name);
    if (nameResult.error) {
      setError(nameResult.error);
      setLoading(false);
      return;
    }

    // Assign mascot
    const mascotResult = await assignMascotAction(mascot);
    if (mascotResult.error) {
      setError(mascotResult.error);
      setLoading(false);
      return;
    }

    onSubmit();
  }

  return (
    <main id="main-content" className="auth-page">
      <div className="auth-card setup-card">
        <div className="auth-header">
          <h1>Ai đang về Nhà?</h1>
          <p className="auth-subtitle">
            Cập nhật tên và chọn linh vật để người thương dễ dàng nhận ra bạn.
          </p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="join-form">
          <div style={{ marginBottom: "20px" }}>
            <label htmlFor="display-name" className="join-label">
              Tên / Biệt danh của bạn
            </label>
            <input
              id="display-name"
              type="text"
              className="join-input"
              placeholder="VD: Cục cưng"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              maxLength={50}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <p className="join-label" id="mascot-label">
              Bạn là ai trong Nhà?
            </p>
            <div
              role="radiogroup"
              aria-labelledby="mascot-label"
              style={{ display: "flex", gap: "16px", marginTop: "8px" }}
            >
              <label
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px",
                  border: mascot === "rabbit" ? "2px solid var(--forest)" : "1px solid var(--line)",
                  borderRadius: "8px",
                  background: mascot === "rabbit" ? "color-mix(in srgb, var(--forest) 5%, transparent)" : "var(--paper)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <input
                  type="radio"
                  name="mascot"
                  value="rabbit"
                  checked={mascot === "rabbit"}
                  onChange={() => setMascot("rabbit")}
                  disabled={loading}
                  style={{ display: "none" }}
                />
                <span style={{ fontSize: "32px" }} aria-hidden="true">🐰</span>
                <span style={{ fontWeight: mascot === "rabbit" ? "bold" : "normal" }}>Thỏ</span>
              </label>

              <label
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px",
                  border: mascot === "owl" ? "2px solid var(--forest)" : "1px solid var(--line)",
                  borderRadius: "8px",
                  background: mascot === "owl" ? "color-mix(in srgb, var(--forest) 5%, transparent)" : "var(--paper)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <input
                  type="radio"
                  name="mascot"
                  value="owl"
                  checked={mascot === "owl"}
                  onChange={() => setMascot("owl")}
                  disabled={loading}
                  style={{ display: "none" }}
                />
                <span style={{ fontSize: "32px" }} aria-hidden="true">🦉</span>
                <span style={{ fontWeight: mascot === "owl" ? "bold" : "normal" }}>Cú</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="primary-button"
            disabled={loading || !name.trim() || !mascot}
            style={{ width: "100%" }}
          >
            {loading ? "Đang lưu…" : "Vào Nhà"}
          </button>
        </form>
      </div>
    </main>
  );
}
