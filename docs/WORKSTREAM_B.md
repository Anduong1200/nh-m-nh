# Workstream B — Presence / Knock

Ngày: 2026-10-01. Nhánh: `feature/presence-knock`, dựa trên commit `63c3f01` của `feature/home-ui`.

Yêu cầu canonical: `AGENTS.md`, `PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/UX_RULES.md`. Phạm vi: Presence, expiry, RLS, Knock, notification abstraction, API/server và tests. Không thêm tính năng V1.

## Kết quả

Giữ domain/RPC Presence và Knock đã có, bổ sung xác nhận đúng Knock operation, notification transport có thể kiểm thử độc lập, và tách dữ liệu core khỏi lỗi Board. Có kiểm tra SQL/RLS thực, server boundary và trình duyệt. Lịch sử migration đã áp dụng được giữ nguyên; workstream này không thêm migration và không ghi vào Supabase đang có dữ liệu thật.

## Contract cho giao diện

UI gọi Server Actions hiện có, không gọi RPC trực tiếp và không tự truyền actor/House làm quyền truy cập.

| Action | Input | Thành công / lỗi |
| --- | --- | --- |
| `setPresenceAction(input, expectedViewerId)` | `PresenceInput` | `{ status }` hoặc `{ error, conflict? }` |
| `clearPresenceAction(expectedVersion, expectedViewerId)` | Version đã tải | `{ status }` hoặc `{ error, conflict? }` |
| `sendKnockAction(input, expectedViewerId)` | `KnockInput` | `{ knock }` hoặc `{ error }` |
| `dismissKnockAction(knockId, expectedViewerId)` | UUID cú gõ | `{ success: true }` hoặc `{ error }` |
| `saveNotificationPreferencesAction(input, expectedViewerId)` | `NotificationPreferences` | `{ preferences }` hoặc `{ error }` |

`expectedViewerId` phải là người đang xem bản đang viết. Action so sánh nó với identity đã xác minh trong cùng request để chặn một tab cũ ghi qua tài khoản vừa đăng nhập. Nó không cấp quyền: RPC vẫn lấy actor và active House từ `auth.uid()`/membership. Không đưa nội dung lỗi SQL hoặc thông tin session vào response.

`GET /house/state` dùng cookie xác thực; không nhận tham số lựa chọn actor/House. Response thành công là `{ currentUserId, house, state }`. Mọi response dùng `Cache-Control: private, no-store, max-age=0` và `Vary: Cookie`. Mã lỗi: 401 nếu chưa xác thực, 403 nếu không có active House, 503 nếu core state không tải được. Không trả một state rỗng giả khi database lỗi.

`Phase2State` chỉ chứa `statuses`, `knocks`, `preferences`. `loadPhase2State()` xác minh lại user và active House trước truy vấn. `HomeState` trong `src/modules/houses/state.ts` ghép thêm `boardItems?` / `boardError?`. Board lỗi không làm Presence/Knock mất truy cập; UI Board phải hiện lỗi và cho tải lại, không coi dữ liệu thiếu là bảng trống đã tải thành công. Board read có House filter, RLS và kiểm tra DTO; phần core được authorize trước khi đọc Board.

## Presence và expiry

- Mood: `calm | happy | tired | overwhelmed | missing_you`.
- Energy: `low | medium | high`, lưu PostgreSQL thành 1 / 2 / 3.
- Availability: `available | later | quiet`.
- Note tối đa 160 Unicode code points; need tối đa 100. Trim đầu/cuối; không chấp nhận control characters hoặc nhiều dòng.
- Expiry: `manual | 1h | 4h | end_of_day`; IANA timezone được kiểm tra. Preset tính từ giờ server, lưu UTC. Hết ngày là thời điểm đầu tiên sang ngày địa phương kế tiếp, có test ngày DST 23/25 giờ.
- `expectedVersion = 0` chỉ cho row chưa tồn tại. Mỗi thay đổi tăng version; stale write trả conflict. Clear tạo/giữ tombstone, xóa note/need và không reset version. Hết hạn vẫn giữ version cho chủ row.
- Partner chỉ đọc status chưa clear và `expires_at > now()` qua RLS; server lọc lại. UI ẩn tại đúng boundary và cập nhật thời gian mỗi 15 giây. Expiry không cần cron xóa row.
- DTO không xuất `created_at`/`updated_at` để suy ra hoạt động. Không tạo last-seen hoặc trạng thái online tự suy luận.

Khi conflict, giao diện giữ bản đang viết, tải version hiện tại và yêu cầu người dùng chọn trước khi thay thế. Bản Presence/Knock chưa gửi hiện chỉ giữ trong bộ nhớ lần mở; đây không phải durable offline queue của Board.

## Knock và retry

`KnockInput = { operationId, kind, content }`: UUID ổn định, `note` một dòng tối đa 160 Unicode code points hoặc sticker `leaf | tea | star | hug`.

UI tạo UUID khi gửi lần đầu và đóng băng UUID/kind/content trong lần thử chưa biết kết quả. Retry dùng cùng payload. RPC khóa theo UUID, lấy House/sender/recipient từ database; cùng UUID và cùng nội dung trả lại row cũ, payload hoặc actor/House khác bị từ chối. Action chỉ báo thành công khi row hợp lệ, sender đúng verified user và ID/kind/content đúng operation đã gửi.

Home đọc tối đa 24 row recipient gần nhất, bỏ private dismissals và trả tối đa 12 cú gõ. Dismiss chỉ cất khỏi inbox người nhận; sender không đọc được dismissal. Không có read receipt, seen timestamp, trò chuyện hoặc nghĩa vụ trả lời.

## RLS / quyền dữ liệu

Schema/RPC nằm trong `20261001100000_create_presence_and_knocks.sql`, dựa trên House authorization của `20261001090000_harden_house_authorization.sql`.

| Table | SELECT | INSERT / UPDATE / DELETE từ client |
| --- | --- | --- |
| `presence_entries` | Active member cùng Nhà; partner chỉ thấy status còn hạn, chưa clear; chủ row giữ version | Bị cấm; set/clear qua RPC xác minh actor, House và version |
| `knocks` | Sender/recipient đang là active member của active House | Bị cấm; tạo qua RPC. Không sửa/xóa cú gõ |
| `knock_dismissals` | Chỉ recipient của cú gõ trong active House | Bị cấm; dismiss qua RPC idempotent, không thông báo sender |
| `notification_preferences` | Chỉ chủ tài khoản | Bị cấm; preferences qua RPC lấy actor từ session |

Anon không có quyền đọc hoặc gọi mutation. Người ngoài/cross-House không đọc được nội dung; member đã rời Nhà hoặc Nhà archived bị từ chối cả đọc nội dung lẫn mutation. Preferences là riêng theo tài khoản, không phụ thuộc Nhà. Giới hạn hai active members, FK integrity, RPC transaction/advisory lock và RLS được giữ nguyên.

Tests chạy toàn bộ chuỗi migration thật trong PGlite, với role `anon`/`authenticated` và shim `auth.uid()`. Mọi exposed public table, kể cả Board, phải có RLS; test không phụ thuộc tổng số table cố định.

## Notification abstraction

`src/modules/notifications/foreground.ts` cung cấp `NotificationTransport` (`permission`, `requestPermission`, `show`) và policy `ForegroundKnockNotifications`. HomeRoom dùng browser adapter; tests inject transport độc lập.

- First snapshot chỉ ghi nhận inbox đã có, không phát lại thông báo cũ.
- Chỉ cú gõ mới đúng recipient được xét, tối đa một lần mỗi ID trong một lần mở, kể cả ID lặp trong một snapshot.
- Chỉ phát khi online, trang visible, permission granted, Knock notifications bật và ngoài quiet hours.
- Quiet hours dùng múi giờ riêng của recipient; giờ bắt đầu gồm trong khoảng, giờ kết thúc nằm ngoài. Hỗ trợ khoảng qua nửa đêm và DST.
- Generic body mặc định: “Có một cú gõ cửa trong Nhà.” Nội dung note/sticker chỉ được đưa vào thông báo nếu recipient chọn detail.
- Không tự xin permission. Chỉ thao tác người dùng ở settings gọi `requestPermission`, và chỉ khi permission còn `default`.
- Sự kiện đã bị suppress không được phát lại sau khi cấp permission/kết thúc quiet hours/reconnect. Account đổi thì đóng notification handles và prime inbox mới. Unmount đóng notices; lỗi browser constructor/cleanup không làm mất inbox.

Đây là notification foreground abstraction. Background Web Push, subscriptions, server delivery và native OS behavior chưa được triển khai/kiểm chứng; UI nói rõ giới hạn này. Cú gõ vẫn lưu và đọc trong Nhà khi thông báo bị tắt hoặc browser không hỗ trợ. Presence/Knock/preferences không đi vào service-worker shell cache.

## Phần tích hợp với Workstream A

Baseline `63c3f01` có 7 test lỗi do Presence loader phụ thuộc Board và test cố định số table, cùng 20 lỗi/cảnh báo lint. Đã tách loader, cập nhật test vẫn yêu cầu RLS trên mọi table, bỏ unused imports/handler và thay `any` trong các điểm tích hợp bằng kiểu phù hợp. Board RPC response được giải mã cả composite row lẫn array, kiểm tra ID và DTO; có compatibility tests. Offline v1 upgrade vẫn giữ dữ liệu và gắn `legacy`/schema version 0, không xóa DB.

Fixture Phase 2 stub riêng Board actions để không bundle server/Supabase vào browser và từ chối rõ mọi Board mutation. Nó không phải bằng chứng nghiệm thu Board.

Trong snapshot B đã kiểm chứng, Gemini còn cần hoàn thiện/nghiệm thu phần Board riêng: lối mở Board chưa nối với control; sync effect phụ thuộc `isSyncing` có thể tự lặp liên tục; update retry/ack theo operation ID và conflict resolution chưa đầy đủ. Workstream B không xác nhận toàn bộ Phase 3 đã xong; xem acceptance trong `docs/PHASE3_REVIEW.md`.

## Verification

| Lệnh | Kết quả ngày 2026-10-01 |
| --- | --- |
| `pnpm lint` | Pass, không warning |
| `pnpm typecheck` | Pass |
| `pnpm test` | Pass: 21 files / 232 tests, gồm 20 SQL/RLS cases |
| `pnpm build` | Pass với development config hiện có |
| `pnpm build:e2e` | Pass, empty Supabase config chỉ trong child process |
| `pnpm test:e2e` | Pass: 45/45, không skip; desktop Chromium / iPhone 12 WebKit / Android Chromium |
| `NHA_MINH_UI_FIXTURE_PORT=3104 node tests/ui-fixture/capture.mjs` | Pass; đã xem sáu ảnh day/night/status desktop 1440px và iPhone WebKit 390px |

Các kết quả áp dụng cho snapshot Workstream B với HomeScene trước khi giao diện mới được sửa đồng thời trong cùng checkout. Commit B giữ snapshot HomeRoom đã kiểm chứng; thay đổi HomeRoom và các file `phase4` của workstream giao diện được giữ trong working tree, chưa đưa vào commit B. Bản tích hợp với giao diện mới cần chạy lại lint/typecheck/build/browser checks sau khi phần giao diện ổn định.

Browser tests dùng production app cho public/private-route denial và fixture riêng cho các form tương tác; Notification constructor được stub để kiểm tra permission/payload. Không chạy lại hai tài khoản Supabase thật, hosted PostgREST/RLS, independent concurrent DB connections, native notification hoặc PWA trên thiết bị vật lý. Người dùng đã báo thử hai account trước workstream này; không dùng báo cáo đó thay cho kết quả kiểm tra mới.
