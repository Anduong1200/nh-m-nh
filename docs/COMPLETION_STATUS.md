# Mức độ hoàn thành V1 — 2026-10-03

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
- `pnpm test:e2e --workers=2`: **210 tests**, pass trên desktop Chromium,
  iPhone 12 WebKit và Android Chromium, runner exit 0. Windows bị kẹt bước đóng
  server test sau khi tất cả assertions qua; chỉ các server test 3100/3103 của
  lượt chạy đã được dọn để runner kết thúc. Không tắt/bỏ qua tests.
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

Người dùng báo đã chạy `upgrade-phase2-to-v1.sql` thành công. Public REST probe
tại đúng host `uhifeugjfkzqljqiwlbj.supabase.co` vẫn trả PGRST205 cho Board sau
đó. Vì vậy chưa khẳng định schema mới đã hiện trong REST hay luồng đăng nhập
thật đã dùng được; câu hỏi xác minh `to_regclass` trong SQL Editor đang chờ
kết quả. Không bỏ guard hay nới RLS để vượt lỗi này.

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
5. Deployment và CI của commit main mới cần được xác nhận riêng; git push
   không tạo deployment.

Xem [hosted setup](V1_HOSTED_SETUP.md),
[private media](PRIVATE_MEDIA.md),
[background notifications](BACKGROUND_NOTIFICATIONS.md) và
[ADR 004](ADR/004-cold-offline-and-background-delivery.md).
