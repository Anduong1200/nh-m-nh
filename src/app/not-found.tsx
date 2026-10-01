import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="state-page">
      <div className="state-paper">
        <span className="state-symbol" aria-hidden="true">⌂</span>
        <h1>Đường này chưa dẫn về Nhà.</h1>
        <p>Trang bạn tìm chưa có ở đây.</p>
        <Link className="primary-button" href="/">
          Về Nhà
        </Link>
      </div>
    </main>
  );
}
