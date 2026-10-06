# Mức độ hoàn thành V1 — cập nhật 2026-10-06

Đợt completion đã nối Bảng Chung, sổ kỷ niệm/cột mốc trên Đảo, private voice,
phục hồi offline từ lúc mở app và core thông báo nền. Giữ nguyên V1 và các quyền
đã được người dùng chốt. Code đã qua các gates bên dưới; **chưa chốt phát hành
production** khi hosted schema/config và thiết bị thật còn cần xác nhận.

## Những khoảng trống đã xử lý

| Hạng mục | Bản tích hợp hiện tại |
| --- | --- |
| Vào Bảng từ Nhà | Route `/board` kiểm tra auth/paired House; lỗi schema có retry và lối mở bản nháp, không giả một bảng trống có thể ghi |
| Bảng mixed content | Note/sticker, link, photo, voice, Excalidraw doodle; nội dung thật, move/rotate, shared edits, creator-only trash/restore |
| Board retry/race | CAS draft, immutable queue/receipts; khóa vật dụng ngay khi bắt đầu lưu; reconnect/verification giữ cùng local writer; không ghi đè bản người kia |
| Đảo | Memory xác nhận trước khi lưu, nguồn game đã hoàn thành cùng House, milestone theo ngày lịch, edit/trash/restore, pagination và conflict |
| Island progression | Producer DB phát MEMORY_CREATED/MILESTONE_CREATED và weekly activity; world state suy ra từ ledger; không client increment, currency, decay hay XP |
| Media | Private photo normalization và PCM WAV voice tối đa 60 giây/4 MiB, gesture microphone, authorized no-store playback/range |
| Cold offline | Public `/offline` với code/fonts precache; namespace account/House được xác nhận gần nhất; recent content và note/doodle drafts/queue |
| Reconnect/logout | Xác nhận identity trước transport; 401/403/đổi House đóng nội dung; giữ nháp khi network hỏng; logout epoch và push binding ngăn callback muộn |
| Background notifications | Opt-in subscription, owner-only RLS, service-only leased outbox cho Knock/thư/lượt game, giờ yên tĩnh, generic payload; cần cấu hình server/scheduler |

Auth, pairing, Presence/expiry, Knock, Whiteboard, bốn game và Letters đã có từ
baseline. Đợt này giữ nguyên các state machine/quyền đó và chạy lại regression.
Letters “mở cùng nhau” vẫn cần cả hai online trong cùng phiên; memory không lấy
nội dung thư niêm phong. Board dùng năm loại persistence đã chốt; không thêm
engine địa điểm/đếm ngược/nhiệm vụ mới hoặc các tính năng V2.

## Bằng chứng kiểm thử bản tích hợp

- `pnpm lint`: pass, không warning.
- `pnpm typecheck`: pass.
- `pnpm test --maxWorkers=1`: **670 tests / 77 files**, pass.
- `pnpm build:e2e`: production build pass; route offline là public static shell.
- `pnpm test:e2e --workers=1`: **210 tests**, pass trên desktop Chromium,
  iPhone 12 WebKit và Android Chromium, runner exit 0. Windows bị kẹt bước đóng
  server test sau khi tất cả assertions qua; chỉ các server test 3100/3103 của
  lượt chạy đã được dọn để runner kết thúc. Không tắt/bỏ qua tests.
- `pnpm build`: pass với cấu hình thật từ ignored `.env.local`, sau lượt E2E.
- Đã xem screenshot Board iPhone: tiếng Việt, status, card và toolbar; thao tác
  editor/trash/reconnect được chạy qua browser tests với transport fixture.
- PostgreSQL/PGlite tests thử RLS, quyền creator, receipt/replay, source guards,
  scheduled notification eligibility, rollback và nâng cấp Phase 2 có dữ liệu.
- Bộ nâng cấp giữ House/Knock/mascot cũ, cài đầy đủ schema mới trong một transaction
  và từ chối chạy lại; fresh-project artifact cũng chứa toàn bộ canonical chain.

Build E2E để trống public Supabase config, độc lập với `.env.local`.
UI fixtures dùng component/domain thật và IndexedDB thật nhưng HTTP/auth transport
mô phỏng. Đây không phải nghiệm thu hosted Supabase, push thật hoặc PWA vật lý.
Code/ảnh/font precache khoảng 10 MiB; không chứa private HTML/API/media.

## Hosted và cấu hình còn cần xác nhận

Người dùng báo đã chạy `upgrade-phase2-to-v1.sql` thành công và xác nhận
`to_regclass` trả tên cả `board_objects` và `island_entries` ngày 2026-10-06.
Public REST probe không có phiên đăng nhập tại host cấu hình
`uhifeugjfkzqljqiwlbj.supabase.co` vẫn trả PGRST205 cho các bảng mới. Probe này
không chứng minh bảng vắng mặt hoặc phủ định kết quả SQL của người dùng.
Đã đề nghị reload REST schema cache; luồng Bảng/Đảo qua phiên đăng nhập thật
vẫn cần nghiệm thu. Không cấp quyền anonymous hay nới RLS để đổi kết quả probe.

Máy hiện tại chưa có `SUPABASE_SECRET_KEY` phía server; upload photo/voice chưa
được nghiệm thu. Chỉ ghi secret vào ignored `.env.local` hoặc deployment secrets,
không vào chat/Git/`NEXT_PUBLIC_*`. VAPID và scheduler chưa được cấu hình, nên
chưa có bằng chứng background delivery hoạt động trên thiết bị thật.

Thứ tự nghiệm thu tiếp:

1. Xác nhận bảng trong đúng project và REST schema cache; thử Bảng/Đảo bằng hai
   account thật trên bản code hiện tại.
2. Cấu hình server Secret; thử upload/read photo/voice, creator trash/restore và
   outsider denial với private Storage thật.
3. Cấu hình VAPID/dispatcher; thử app đóng, scheduled delivery, quiet hours,
   disable/logout/account switch.
4. Chạy closed-app offline/reconnect, touch/voice và vòng đời installed PWA trên
   iPhone/Android thật; stress race với các kết nối PostgreSQL độc lập.
5. Người dùng đã đăng nhập Vercel; CLI đang được kết nối qua device authorization.
   Chưa có deployment HTTPS đã nghiệm thu. Đặt environment/callback theo
   `DEPLOYMENT.md`, sau đó thử PWA trên hai điện thoại. CI của baseline `cdcf189`
   đã success; git push trước đó không tạo deployment.

## Sửa môi trường Windows và chuẩn bị phát hành — 2026-10-06

- Nguyên nhân lỗi PowerShell: pnpm chỉ có trong PATH riêng của Codex; Node hệ
  thống 22.12 không chạy được pnpm 11.25.0.
- Đã dùng NVM hiện có cài/chọn Node 22.23.3, cài pnpm 11.25.0 vào `%APPDATA%\npm`
  và thêm vào User PATH. Windows PowerShell `-NoProfile` với Machine/User PATH
  đã nhận đúng hai phiên bản, không dùng runtime/PATH riêng của Codex.
- `engines.node` và README sửa mức tối thiểu lên 22.13. `vercel.json` pin pnpm
  11.25.0 cho install với frozen lockfile và configured production build.
- Không thay auth/RLS/schema, không thêm dependency, tracking hay tính năng V2.
  `WINDOWS_PWA_SETUP.md` hướng dẫn sửa PATH, production shell và phone acceptance;
  `DEPLOYMENT.md` hướng dẫn Vercel, callback và server environment.
- Gates đợt này: lint, typecheck, 670 unit/integration tests, `build:e2e`,
  210 E2E với một worker và configured `pnpm build` pass. Lượt hai worker ban đầu
  gặp lỗi browser context đóng trước assertions rồi kẹt teardown; đã giữ trace,
  dọn đúng tiến trình test và chạy lại toàn bộ với một worker, không bỏ test.
- Configured production server chạy ở loopback 3101. Đã kiểm tra và xem ảnh
  public welcome/recovery ở desktop Chromium và iPhone 12 WebKit: manifest
  standalone, service-worker scope `/`, không tràn ngang, không page error;
  recovery vẫn tải khi dừng origin. WebKit `setOffline` gặp lỗi emulation nội bộ,
  nên kiểm tra lại bằng origin có thể dừng thật như helper E2E hiện có.
  Đây là kiểm tra shell công khai, không phải hosted auth hay installed PWA thật.
- `.vercelignore` loại credentials, cache và browser artifacts khỏi CLI upload;
  fonts/offline manifest được sinh lại trên deployment host.

Xem [hosted setup](V1_HOSTED_SETUP.md),
[private media](PRIVATE_MEDIA.md),
[background notifications](BACKGROUND_NOTIFICATIONS.md) và
[ADR 004](ADR/004-cold-offline-and-background-delivery.md).
