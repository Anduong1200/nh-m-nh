export default function Loading() {
  return (
    <main id="main-content" className="state-page">
      <div className="state-paper" role="status" aria-live="polite">
        <span className="state-symbol loading-symbol" aria-hidden="true">⌂</span>
        <h1>Đang mở cửa Nhà…</h1>
        <p>Đợi một chút nhé.</p>
      </div>
    </main>
  );
}
