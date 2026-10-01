"use client";

export function HouseUnavailable() {
  return (
    <main id="main-content" className="state-page">
      <div className="state-paper" role="alert">
        <h1>Chưa mở được Nhà.</h1>
        <p>Chưa tải được Nhà của hai bạn. Bạn có thể thử tải lại.</p>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>Thử tải lại</button>
      </div>
    </main>
  );
}
