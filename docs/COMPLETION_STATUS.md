# Mức độ hoàn thành V1 — 2026-10-03

Đối chiếu `AGENTS.md`, `PRODUCT_SPEC.md`, `ROADMAP.md` và các hợp đồng trong
`docs/` với code main `f583441`. **Đợt tích hợp đã hoàn tất; sản phẩm V1 chưa đủ
điều kiện chốt phát hành.** Có màn hình và có tests không đồng nghĩa với đã hoàn
thành mọi yêu cầu hoặc đã chạy được trên Supabase thật.

Không dùng một phần trăm tổng để che các khoảng trống về tính năng, dữ liệu và
nghiệm thu. Bảng dưới phân biệt code hiện có với phần còn phải làm.

## Preview báo ngoại tuyến

Lúc bắt đầu kiểm tra, `http://127.0.0.1:3101/` từ chối kết nối: server preview
không chạy. Service worker có thể trả trang dự phòng khi server không truy cập
được, ngay cả khi thiết bị vẫn có mạng. Trang dự phòng hiện ghi “Thiết bị đang
ngoại tuyến”, nên chưa phân biệt đúng hai tình huống này.

Đã khởi động lại bằng `pnpm dev --hostname 127.0.0.1 --port 3101`; Next báo Ready
và GET `/` trả HTTP 200, có nội dung app thay vì HTML dự phòng. Trong tab đang
mở, bấm **Thử mở lại** hoặc tải lại trang. Server local cần tiếp tục chạy để dùng
preview; push lên GitHub không tạo một server hay deployment đang hoạt động.

Công cụ điều khiển tab lỗi khởi tạo kernel, nên lần này chưa quan sát được tab
đang đăng nhập của người dùng. HTTP 200 xác nhận server đã trở lại, chưa xác
nhận phiên đăng nhập/House hiện tại hoặc `navigator.onLine` của tab đó.
Không xóa cache, cookie, IndexedDB hay bản nháp để xử lý sự cố này.

## Theo từng hạng mục

| Hạng mục V1 | Đã có | Còn thiếu hoặc chưa nghiệm thu |
| --- | --- | --- |
| Auth | Google login, verified identity, cookie refresh, profile/nickname | Người dùng đã thử hai tài khoản ở bản trước; cần thử lại các route mới trên build hiện tại |
| Pairing / House | Invite một lần, giới hạn hai thành viên, authorization/RLS, identity thỏ/cú theo thành viên | Kiểm tra schema hosted hiện có và chạy lại hai viewer trên build mới |
| Home | Phòng, ngày/đêm, linh vật và lối vào các màn thật | Nghiệm thu trên PWA cài ở iPhone/Android thật |
| Presence | Các trường trạng thái, expiry, version/conflict, quyền theo House | Cập nhật/đọc hai chiều và expiry trên Supabase thật |
| Knock | Note/sticker, inbox, retry, settings/quiet hours/privacy và foreground notification | Delivery hai chiều trên bản hiện tại; chưa có Web Push nền |
| Shared Board | Note/sticker, move/rotate, domain/RLS, draft/queue và conflict recovery | **UI tạo link/photo/audio/doodle chưa hoàn chỉnh**; photo/audio/doodle chưa render nội dung thực trong Board; thao tác trash/restore còn ở domain, chưa có UI sản phẩm |
| Whiteboard | Excalidraw, các công cụ V1, snapshot/version, draft/offline và conflict | Migration hosted, thử hai tài khoản, touch và vòng đời PWA trên thiết bị thật |
| Bốn games | UI và core của Doodle Relay, Draw & Guess, One-line Story, Photo Mission; turn validation/RLS, artifacts, draft/reconnect | Hosted schema và nghiệm thu đủ bốn game; Photo Mission cần cấu hình media server/private Storage thật |
| Letters | Gửi ngay/hẹn giờ, clue/sealed, quyền đọc theo actor, mở cùng nhau với cả hai online trong cùng phiên | Migration hosted; gửi/mở/expiry/reconnect bằng hai tài khoản thật; chưa có delivery notification sender |
| Shared Island | Ledger và state được suy ra từ nguồn game/mission/weekly activity; mở lại artifacts đã hoàn thành | **Chưa persistence/producer cho Memory và Milestone**, chưa có promotion Memory qua xác nhận của người dùng |

Board không được tính là hoàn tất chỉ vì domain đã hỗ trợ các loại object. Toolbar
hiện chỉ tạo note/sticker; các loại photo/audio/doodle mới có nhãn thay cho nội
dung. Xem [Board UI](../src/components/phase3/board.tsx) và
[kế hoạch Phase 3](PHASE3_REVIEW.md). Quyền đã chốt vẫn giữ nguyên: cả hai sửa;
chỉ người tạo đưa vào thùng rác và khôi phục; không có purge vĩnh viễn.

Memory/Milestone là nguồn tăng trưởng của Island trong phạm vi hiện tại, không
phải cớ để thêm Museum, AI recap hoặc tính năng backlog. Hợp đồng event vẫn
reserved cho đến khi có dữ liệu nguồn được authorize và persist:
[Island domain](ISLAND_DOMAIN.md).

## Các phần xuyên suốt

- **Offline/PWA: một phần.** Có public app shell, recent cache theo account/House,
  draft/queue và reconnect cho các luồng đã triển khai. Các thao tác nhạy cảm như
  gửi/mở thư vẫn cần online. Mở lại private workspace từ đầu khi mất mạng hiện
  nhận public fallback; chưa có cold-offline recovery hoàn chỉnh. Không cache
  authenticated HTML/API/media để vượt ranh giới privacy.
- **Media: Photo Mission có code/UI.** Máy hiện tại có public Supabase config,
  nhưng chưa cấu hình `SUPABASE_SECRET_KEY` phía server. Không suy ra rằng hosted
  migration/private bucket đã được cài từ kết quả tests local. Board audio còn
  thiếu pipeline/UI; không gộp phần thiếu code này vào “chỉ chờ deploy”.
- **Notifications: abstraction/preferences và foreground Knock đã có.** Chưa
  triển khai Web Push subscription/server sender hoặc delivery notifier cho thư
  và game. Không quảng cáo thông báo nền hoạt động. Các loại thông báo được phép
  không đồng nghĩa mọi loại đều đã được triển khai.
- **Privacy/security: có kiểm thử authorization/RLS theo domain.** Hosted Storage
  và cạnh tranh transaction từ các kết nối PostgreSQL độc lập còn phải nghiệm
  thu; PGlite tests không chứng minh hai điều đó.

## Bằng chứng kiểm thử

Kết quả của **code baseline `f583441`**, đã chạy trong đợt tích hợp trước:

- Lint: pass, không warning.
- Typecheck: pass.
- Unit/integration: **568/568**, 59 files.
- Production test build: pass (`pnpm build:e2e`).
- Playwright: **174/174**, desktop Chromium, iPhone 12 WebKit và Android Chromium.
- Manual browser/visual review dùng fixtures cho Home/Games/Letters/Island/
  Whiteboard, desktop và viewport iPhone; không dùng hai account hosted thật.
- GitHub CI của cùng commit đã được xác nhận thành công ở đợt bàn giao:
  [CI run](https://github.com/Anduong1200/nh-m-nh/actions/runs/37112482009).

Chi tiết và giới hạn: [V1 integration review](V1_INTEGRATION_REVIEW.md).
Lần báo cáo này chỉ đối chiếu source, kiểm tra cấu hình theo cờ có/không và
khởi động/kiểm tra HTTP preview; không chạy lại bộ lint/typecheck/tests/build/E2E.
Thay đổi của lần báo cáo này chỉ là tài liệu, không đổi runtime/schema.

## Thứ tự để chốt V1

1. Hoàn thiện các khoảng trống code đã có trong V1: Board mixed content và UI
   trash/restore, Memory/Milestone source + confirmed promotion, cold-offline
   recovery. Không tự thêm backlog.
2. Đối chiếu migration history của Supabase thật; chỉ áp dụng phần additive còn
   thiếu. Cấu hình server media secret và kiểm tra private Storage. Không chạy
   lại bootstrap/reset project đang có dữ liệu.
3. Nghiệm thu bằng hai tài khoản thật: đủ bốn games + artifacts, thư thường/hẹn
   giờ/mở cùng nhau, Board/Whiteboard conflict, quyền outsider/cross-House,
   logout/account switch và reconnect.
4. Kiểm tra installed PWA trên iPhone/Android thật; chạy lại các gate bắt buộc sau
   thay đổi implementation rồi mới chốt phát hành.

Chưa deploy, chưa tự áp dụng hosted schema, chưa cấu hình secret, chưa xóa dữ
liệu và chưa thực hiện các phần implementation còn thiếu trong lần báo cáo này.
