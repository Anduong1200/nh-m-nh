import { HomeScene } from "@/components/home-scene";
import { ThemeControl } from "@/components/theme-control";

function HouseMark() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true" className="house-mark">
      <path d="M7 20 22 8l15 12v17H7Z" />
      <path d="M3 22 22 6l19 16M18 37V25h8v12" />
      <path d="M12 22h4v5h-4zm16 0h4v5h-4z" />
      <path d="m29 6 2-3m3 8 4-1" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="home-shell">
      <header className="site-header">
        <div className="brand">
          <HouseMark />
          <div>
            <span className="brand-name">Nhà Mình</span>
            <span className="brand-caption">một nơi dành cho hai đứa</span>
          </div>
        </div>
        <ThemeControl />
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">
              <span className="tiny-leaf" aria-hidden="true">✦</span>
              Ngôi nhà nhỏ và thế giới của hai đứa
            </p>
            <h1 id="welcome-title">
              Một góc nhỏ.
              <br />
              <span>Của hai đứa.</span>
            </h1>
            <p className="welcome-description">
              Để lại một điều bé xíu cho người thương tìm thấy.
              Một nét vẽ, một lá thư, hay một câu chuyện còn dang dở.
            </p>
            <div className="paper-note">
              <span className="paper-tape" aria-hidden="true" />
              <p className="note-label">Sẵn sàng về Nhà?</p>
              <p>
                Đăng nhập bằng tài khoản Google để dựng Nhà cùng người thương.
              </p>
              <a className="primary-button" href="/auth/sign-in">
                Đăng nhập
              </a>
            </div>
            <p className="welcome-footnote">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 9V6a5 5 0 0 1 10 0v3M4 9h12v9H4Z" />
                <circle cx="10" cy="13" r="1" />
              </svg>
              Một ngôi nhà riêng tư, chỉ dành cho hai người.
            </p>
          </div>

          <figure className="room-figure">
            <div className="room-heading">
              <span className="room-caption">Một căn phòng đang chờ những dấu vết nhỏ</span>
              <span className="preview-label">Minh họa</span>
            </div>
            <HomeScene />
            <figcaption>
              Hai chiếc cốc. Một chiếc bàn. Còn nhiều chỗ cho chuyện của mình.
            </figcaption>
          </figure>
        </section>

        <section className="foundation-note" aria-labelledby="foundation-title">
          <div className="trail-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40">
              <path d="M20 4v32M9 11h23l4 5-4 5H9l-4-5ZM11 27h18" />
              <path d="m24 13 4 3-4 3" />
            </svg>
          </div>
          <div>
            <h2 id="foundation-title">Hai đứa, mỗi người một nhịp.</h2>
            <p>
              Một nơi để ghé thăm theo nhịp riêng: trên máy tính hay trong
              lòng bàn tay, cả khi hai đứa không ở đây cùng lúc.
            </p>
          </div>
          <p className="small-promise">Ghé khi bạn muốn.<br />Không cần vội.</p>
        </section>
      </main>

      <footer className="site-footer">
        <span>Nhà Mình <span aria-hidden="true">·</span> bản khởi tạo V1</span>
        <span>Để những điều nhỏ có một nơi ở lại.</span>
      </footer>
    </div>
  );
}
