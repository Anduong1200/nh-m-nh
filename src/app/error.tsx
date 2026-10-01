"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="state-page">
      <div className="state-paper" role="alert">
        <span className="state-symbol" aria-hidden="true">⌂</span>
        <h1>Cửa chưa mở được.</h1>
        <p>Có một lỗi khi tải giao diện. Bạn có thể thử lại.</p>
        <button className="primary-button" onClick={reset}>
          Thử lại
        </button>
      </div>
    </main>
  );
}
