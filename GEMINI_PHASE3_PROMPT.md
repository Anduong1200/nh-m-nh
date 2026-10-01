# Prompt bàn giao cho Gemini — Nhà Mình Phase 3

Bạn tiếp tục repo Nhà Mình hiện có, không bootstrap lại. Mục tiêu là xử lý các khoảng trống đã review, hoàn thành Phase 3 trong roadmap, giữ frozen V1. Đọc toàn bộ `docs/PHASE3_REVIEW.md` trước khi triển khai.

## Đọc trước

`AGENTS.md`, `PRODUCT_SPEC.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/UX_RULES.md`, `docs/DESIGN_SYSTEM.md`, `docs/DATA_MODEL.md`, `docs/PHASE2.md`, `docs/PHASE3_REVIEW.md`, `docs/TESTING.md`; relevant `skills/product`, `frontend-ui`, `security`, `database`, `pwa-offline`, `testing`, `review` SKILL.md. Với Next.js API, đọc guide phù hợp trong `node_modules/next/dist/docs` của phiên bản đã cài.

Các docs canonical và yêu cầu trực tiếp từ người dùng có ưu tiên. Những dòng đề xuất hoặc cần chốt trong review chưa phải quyết định authorization đã được duyệt.

## Bối cảnh thực tế

- Người dùng đã thử hai Google account thật, báo khá ổn. Không cần làm lại sign-in/pairing từ đầu.
- Có Supabase project và dữ liệu thật. Public config ở `.env.local` đã ignore. Không yêu cầu service-role key; không in hay đưa credentials vào prompt/commit.
- UI vừa sửa font Việt, thỏ/cú bị che và nét vẽ thỏ. Giữ font self-hosted, theme ngày/đêm, desktop/mobile và scrapbook identity.
- Baseline gần nhất 191 Vitest và 45 Playwright pass; tests Phase 3 chưa tồn tại. Không biến số đó thành bằng chứng Phase 3 đã xong.
- Dev thật `127.0.0.1:3101`; fixture mô phỏng 3102; E2E 3100/3103. Phân biệt dữ liệu test với dữ liệu thật.

## Làm đầu tiên: tên/biệt danh và identity

Yêu cầu người dùng: **người dùng là thỏ, người yêu là cú**. Hai bên phải nhìn thấy cùng mapping, không phụ thuộc ai đang xem.

1. Thêm UI **Tên / biệt danh** cho profile chính mình; ưu tiên reuse `profiles.display_name`, không tự thêm hệ thống biệt danh bí mật cho đối phương. Validate và xử lý loading/error; update sang màn hình người kia; login lại không reset tên. Giữ profile bootstrap `ignoreDuplicates: true`.
2. Sửa lỗi `self ? rabbit : owl` trong HomeRoom. Lưu mascot theo membership đã xác minh, unique trong House, transaction-safe. Không gán từ creator/slot/email/thứ tự mảng. House đang tồn tại chưa có mapping phải có lựa chọn rõ: người dùng chọn “Mình là thỏ”, thành viên còn lại là cú; không cần lấy email/UUID để hardcode.
3. Không mở direct writes vào house_members để làm nhanh. Nếu cần schema thì migration additive và RPC hẹp; derive actor/House server/database-side. Nếu mapping đã có hoặc hai bên thiết lập đồng thời, xử lý xung đột rõ; không tự hoán đổi một mapping đã thiết lập.
4. Card và hình linh vật trong phòng phải chỉ cùng người. `self` chỉ dùng cho nhãn “bạn” và quyền chỉnh own profile. Test cả hai viewer và concurrent selection.

Hoàn thành phần identity thành milestone riêng trước Board. Chỉ refactor có mục đích; giữ luồng Phase 2 đang chạy.

## Phase 3 phải hoàn thành

Theo `ROADMAP.md`: mixed-object Board gồm **notes, photos, links, audio**; async Whiteboard; IndexedDB draft queue; reconnect sync; conflict UX. Offline-created note/doodle phải sống qua reload/reconnect, dữ liệu người kia không bị overwrite im lặng.

Thực hiện lần lượt 3B–3E trong review:

- Chốt quyền sửa/xóa Board theo canonical docs; nếu chưa rõ, đề xuất authorization matrix và hỏi điểm auth/authorization trước write/RLS liên quan. Tiếp tục công việc độc lập trong lúc cần câu trả lời.
- Board sống như bảng ghim chung: thêm/xem/sửa note/link, positioning/move/rotate phù hợp desktop và touch; không biến thành dashboard hoặc feed. Chỉ http/https links, render text an toàn, không server-fetch URL arbitrary để làm preview.
- Persist note/doodle draft thật qua reload. Queue gắn account+House+schema version, idempotency với stable operation ID, server version check. Retry sau mất response commit phải làm việc đúng cho create và update. Chỉ ack chính operation đã được server xác nhận. Giữ cả bản local/remote khi conflict, có resolution an toàn và retry được.
- Lifecycle multi-tab: verify lại actor/House trước sync, stop khi phiên đổi, không gửi queue Nhà cũ vào Nhà mới. Cleanup account cache và pending-work choice đúng; không làm callback muộn ghi/sync dưới account khác. Quota/IDB/upgrade/network lỗi có UI.
- Offline shell phải có luồng phục hồi editor/cached recent content thật; không cache private SSR/API hoặc token để né auth. Ghi design account context và cold-start privacy. Nếu phải thay auth hoặc privacy behavior lớn, ADR và làm rõ trước.
- Private photo/audio pipeline: storage RLS, bounded validation, audio tối đa 60 giây, metadata/upload states và retry, deny outsider/cross-House. Có đường chọn file khi mic không dùng được. Không public bucket/signed URL lưu lâu trong cache. Media có thể online trước, nhưng photo/audio không được bỏ khỏi Phase 3 hoàn chỉnh.
- Whiteboard dùng thư viện trưởng thành sau kiểm tra giấy phép/API/browser; không viết editor engine, không thêm paid service. Có pen/highlighter/eraser/text/sticky note, versioned serialization/save, draft restore và conflict. Image trong Whiteboard có thể hoãn theo canonical optional rule. Không realtime simultaneous drawing.
- Mở Board/Whiteboard từ Home bằng lối rõ, có quay về phòng. Chỉ bỏ nhãn chưa mở với đối tượng đã làm thật. Kiểm tra keyboard, focus, reduced motion, 44px targets, day/night, desktop, iPhone WebKit, Android.

## Giới hạn và dữ liệu hiện có

Không thêm Games, Letters, Island progression, Radio, Campfire, AI, analytics, video hoặc realtime Whiteboard trong lần này. Không đổi architecture/auth model hoặc bỏ security control để làm nhanh.

Ba migration hiện có đã áp dụng: không sửa lại chúng, không chạy `supabase/setup-new-project.sql` trên project hiện có, không reset/drop/xóa dữ liệu. Thêm migration mới với RLS cùng lúc tạo bảng; test fresh schema và upgrade. Xác minh migration history vì baseline từng được cài qua SQL Editor. Cung cấp incremental SQL/hướng dẫn apply reviewable. Schema/destructive change phải tuân AGENTS/ADR/explicit approval; không có quyền tự reset dữ liệu.

Reuse domain boundaries `src/modules/board`, `whiteboard`, `media`, `sync` và `src/lib/offline`. Offline primitives hiện chưa bind House hoặc có complete resolver; nâng chúng bằng migration giữ dữ liệu, không xóa IndexedDB để bắt đầu lại. Giữ recent cache bounded; draft/queue không tự expire. Ngăn snapshot/HTML/SVG/URL không tin cậy gây XSS hoặc request ra ngoài.

## Cách báo tiến độ và Definition of Done

Trước code, báo assessment ngắn dựa trên source và thứ tự milestone. Ghi assumptions/decision chưa chốt vào docs. Mỗi milestone cần migration/types/UI/states/security/tests liên quan; milestone hoàn thành riêng không đồng nghĩa toàn Phase 3 hoàn thành.

Giữ tests cũ; thêm unit/integration/RLS/storage/E2E cho các acceptance trong review, đặc biệt lost acknowledgement, stale edit, multi-tab account switch, cross-House và offline reload. PGlite/fixture không thay thế hosted Storage hoặc independent concurrency checks.

Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, rồi `pnpm build:e2e` + `pnpm test:e2e`. Manually inspect desktop/iPhone-class viewport và thử hai tài khoản thật khi migration đã được cài. Không gọi hoàn thành khi check bị bỏ qua. Báo command, kết quả, việc chưa chạy, lỗi còn lại; link files và incremental migrations đã tạo.

Viết cập nhật ngắn bằng tiếng Việt, hỏi chỉ khi thật sự thiếu thông tin ảnh hưởng auth/authorization/destructive change. Đừng gửi cho người dùng một loạt yêu cầu setup đã làm xong, đừng thay UI mới chỉ vì sở thích của agent.
