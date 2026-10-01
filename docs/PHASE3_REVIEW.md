# Phase 3 — review và bàn giao

Ngày: 2026-10-01. Trạng thái: review mức sẵn sàng, chưa triển khai Phase 3.

Nguồn yêu cầu: `AGENTS.md`, `PRODUCT_SPEC.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/UX_RULES.md`. Các đề xuất dưới đây không thay thế yêu cầu canonical; các lựa chọn còn ảnh hưởng quyền truy cập phải được chốt trước khi triển khai.

## Bối cảnh đã xác nhận

- Người dùng báo đã thử hai tài khoản Google thật và thấy luồng hiện tại khá ổn. Đây là kết quả người dùng báo, không phải kiểm chứng độc lập của agent về mọi trường hợp RLS, thiết bị vật lý hay notification nền.
- Yêu cầu mới: sửa được tên/biệt danh; người dùng là **thỏ**, người yêu là **cú**. Hai tài khoản phải thấy cùng một phép gán.
- Home, Presence, Knock và preferences đã có implementation. Font tiếng Việt và hình thỏ/cú vừa được sửa. Baseline gần nhất: lint/typecheck/build pass, 191 Vitest và 45 Playwright pass.
- Board, Whiteboard, media và sync hiện chủ yếu là README ranh giới module. Chưa có bảng dữ liệu Board/Whiteboard, private bucket, editor hoặc sync coordinator.
- IndexedDB có draft, queue và recent cache theo account. Đây là primitives, chưa phải luồng offline của sản phẩm.

## Critical

Không ghi nhận lỗi Critical mới từ phạm vi đọc mã lần này. Đây không phải audit đầy đủ, và Phase 3 chưa có implementation để kiểm định. Thiếu RLS, storage riêng tư hoặc ghi đè công việc người kia khi triển khai sẽ là lỗi chặn phát hành.

## High

### H1. Gán linh vật theo người đang xem, nên bị đảo giữa hai tài khoản

`src/components/phase2/home-room.tsx:322` dùng `self ? "🐰" : "🦉"`. Người yêu đăng nhập sẽ thành thỏ trên màn hình của họ. `HomeScene` hiện chỉ vẽ hai con vật trang trí, chưa gắn với thành viên.

Sửa trước khi mở rộng Phase 3: lưu identity theo `(house_id, user_id)`; `self` chỉ quyết định nhãn “bạn” và quyền sửa. Không suy luận từ email, giới tính, owner/partner, slot 1/2 hay thứ tự mảng. Không hardcode tài khoản thật vào source.

Gợi ý additive schema: `house_members.mascot` nhận `rabbit | owl`, cho phép chưa chọn khi chuyển đổi dữ liệu cũ; bảo đảm không trùng linh vật giữa hai active members bằng constraint và transaction. Giữ nguyên cấm direct membership writes. RPC hẹp phải lấy actor/House từ verified identity và quyền hiện có, không nhận một user ID tùy ý làm bằng chứng quyền.

Luồng thiết lập: người dùng đăng nhập chọn “Mình là thỏ”; khi House đã ghép hai người, transaction gán thỏ cho actor và cú cho thành viên còn lại nếu identity chưa được thiết lập. Người còn lại thấy “Bạn là cú”. Nếu đã có phép gán khác, báo xung đột; không tự đổi hoặc hoán đổi. Việc đổi linh vật sau thiết lập không cần cho yêu cầu này. Hai người chọn cùng lúc phải có kết quả nhất quán.

### H2. Offline chưa có ràng buộc đích House trong cấu trúc queue

`src/lib/offline/store.ts` lưu account/entity/operation nhưng không có trường House bắt buộc. Hiện chưa có worker gửi dữ liệu nên đây là khoảng trống cho Phase 3, không phải kết luận đang có rò rỉ dữ liệu.

Draft, queue và recent content mới phải ràng buộc cả account lẫn House và payload schema version. Sau reconnect, xác minh lại actor và House trước khi gửi. Nếu membership/session đã đổi, dừng queue và giữ công việc để xử lý rõ ràng; không chuyển công việc của Nhà cũ sang Nhà mới. Nâng version IndexedDB bằng migration giữ dữ liệu; không xóa DB để nâng cấp.

### H3. Chưa có sync idempotent, version conflict và hoàn tất resolve

`enqueue()` tạo operation UUID mới mỗi lần gọi; retry phải dùng lại operation cũ. `preserveConflict()` giữ hai bản; `acknowledgeOperation()` từ chối conflict; chưa có luồng giải quyết rồi hoàn tất nó.

Cần server transaction cho create/update với ID thao tác ổn định, actor/House authorization và version authoritative. Response mất sau commit phải retry ra cùng kết quả, kể cả update đã tăng version. Kiểm tra replay trước stale-version rejection. Chỉ ack/xóa queue khi nhận đúng operation ID và kết quả authoritative. Không đổi payload của thao tác đã gửi nhưng chưa biết server có commit hay chưa.

Không auto-merge toàn bộ canvas. Giữ local/remote/base version; cho xem bản hiện tại, giữ bản đang viết làm bản riêng hoặc chủ động áp dụng thay thế có version check mới. Thao tác resolve cũng phải chịu được mạng lỗi và thay đổi tiếp theo của người kia.

### H4. Multi-tab và offline cold start chưa hoàn chỉnh

Store handle revocation chỉ có hiệu lực trong JavaScript context hiện tại. Logout hiện xác nhận xóa draft nhưng chưa có thông báo liên tab hoặc lựa chọn lấy bản nháp ra trước khi xóa. Service worker trả public offline page khi navigation mất mạng; một trang Home đã mở có thể giữ form trong memory, nhưng chưa có editor phục hồi draft sau reload offline.

Phase 3 phải có lifecycle account/session giữa các tab, dừng in-flight sync trước logout/account switch, bảo vệ callback đến muộn và hiển thị lỗi quota/private browsing. Thêm recovery thực sự cho draft khi reload và app shell vào offline workspace đã được thiết kế; không chỉ test một tab đang mở.

Không cache authenticated HTML/API/Supabase response bằng service worker để vượt vấn đề này. Thiết kế cách mở recent content/draft riêng tư ngoại tuyến phải ghi rõ nguồn account context, cleanup, thời hạn và fail-closed khi không xác định được account. Không lưu token/credentials trong draft. Nếu giải pháp đòi thay auth model hoặc privacy behavior lớn, cần ADR và làm rõ trước implementation.

### H5. Media phải đi cùng storage authorization

Roadmap Phase 3 có ảnh và audio, không chỉ note/link. Chưa có bucket hoặc pipeline. Cần private bucket, object metadata có House/owner, storage policies đọc/ghi riêng, kiểm tra MIME thực tế/size/duration; audio tối đa 60 giây theo spec. Không dùng URL public hoặc upload SVG/HTML tùy ý. Không coi MIME phía client là validation đủ.

Việc tạo metadata và upload không phải một DB transaction chung: cần trạng thái pending/ready/error, retry ổn định và xử lý upload dang dở. Không đánh dấu object là hoàn tất khi upload hoặc metadata chưa thành công. Không cache signed media URL vào recent cache lâu dài.

## Medium

### M1. Chưa có UI sửa tên/biệt danh

`profiles.display_name` đã tồn tại; RLS hiện cho người dùng sửa profile của chính mình. Profile bootstrap ở callback, `ensureProfile()` và create-House dùng `ignoreDuplicates: true`; **không có bằng chứng chúng đang ghi đè tên tự chọn ở mỗi login**. Giữ hành vi này.

Mặc định gọn: một ô **Tên / biệt danh** lưu vào `profiles.display_name`, là tên chung cả hai cùng thấy; chưa thêm biệt danh bí mật riêng cho người yêu. Giới hạn/trim/Unicode validation, loading/error, chống submit lặp, revalidate/refresh tên bên tài khoản kia. Chỉ sửa profile actor; xác minh expected viewer giống các action Phase 2. Logout/login lại phải giữ tên. Tên Nhà là một yêu cầu khác, chưa được yêu cầu sửa.

### M2. Cần chốt quyền sửa/xóa shared object trước schema

**Cập nhật 2026-10-02:** người dùng đã chốt quyền Board: cả hai được sửa/move; chỉ người tạo được đưa vào thùng rác và khôi phục. Hợp đồng triển khai, retry và offline nằm trong [BOARD_DOMAIN.md](BOARD_DOMAIN.md). Không triển khai purge.

Canonical docs yêu cầu isolation theo House nhưng chưa quy định đủ quyền sửa/xóa Board giữa hai thành viên. Không tự coi đề xuất là đã được duyệt.

Đề xuất để chốt: cả hai được xem và thêm; cả hai chỉnh/move shared object với version check; bản nháp chưa chia sẻ là riêng theo account; thao tác đưa vào thùng rác phải có quy tắc rõ, phục hồi được. Cần quyết định ai được đưa object của người kia vào thùng rác. Whiteboard là không gian cả hai chỉnh async, dùng version check. Không triển khai purge vĩnh viễn trong Phase 3.

Chốt authorization matrix với người dùng nếu canonical docs chưa giải đáp; ghi quyết định và test đúng matrix. Đây là điểm cần làm rõ trước phần write/RLS liên quan, không cản làm UI/profile hoặc review độc lập.

### M3. Whiteboard cần quyết định thư viện, serialization và undo

Chưa có canvas dependency. Chọn tooling trưởng thành sau khi kiểm tra API, giấy phép, hỗ trợ React/SSR, iOS touch, highlighter/eraser/text/sticky note và xuất/nhập dữ liệu. Ghi decision và phiên bản. Không tự viết editor engine hoặc thêm paid dependency.

Snapshot có schema/library version, giới hạn độ lớn và server validation. Chỉ load nội dung đã được phép, không nhận URL/image/font ngoài tùy ý từ snapshot. Undo local không được tự đảo một thay đổi người kia vừa lưu. Simultaneous realtime drawing là V2; image trong Whiteboard có thể hoãn đến khi persistence ổn định, theo AGENTS.

## Low

- Dùng linh vật nhỏ cùng phong cách SVG ở thẻ identity để tránh emoji khác nhau theo OS; bảo đảm accessible label và tên người tương ứng. Không làm mascot phản ứng theo last-seen.
- Home cần hai lối rõ vào Board/Whiteboard và quay lại phòng; mở đối tượng có implementation thật mới bỏ nhãn chưa mở. Map, game box, Letters giữ đúng trạng thái ở phase hiện tại.
- Giữ warm scrapbook, bố cục có tính không gian. Board cho move/rotate với lựa chọn bàn phím; không bắt người dùng phải drag trên điện thoại. Chỉ refactor component khi phục vụ phần việc này.
- `docs/DATA_MODEL.md` vẫn có `knocks.seen_at` theo mô hình conceptual cũ. Không đưa nó vào Phase 3 hay biến private dismissal thành read receipt.

## Acceptable trade-offs

- Poll/refresh như Phase 2 là đủ cho bản async; realtime không phải điều kiện cơ bản.
- Note/doodle có durable offline queue trước; upload ảnh/audio online trong Phase 3 là cách chia implementation hợp lý nếu UI giải thích rõ, không giả vờ đã queue media.
- Body font hệ thống và Lora self-hosted hiện tại được giữ. Không cần redesign toàn bộ Home.
- V1 lưu trữ client chưa E2EE; không quảng cáo nội dung offline là đã mã hóa đầu-cuối.
- Audio/photo/link/note vẫn phải hoàn thành trước khi gọi toàn bộ Phase 3 xong. Chia nhỏ milestone không phải cắt chúng khỏi roadmap.

## Required fixes before merge — thứ tự giao Gemini

1. **3A — Identity prerequisite:** tên/biệt danh, gán thỏ/cú ổn định, migration additive và test hai viewer/cạnh tranh. Hoàn thành riêng, dễ review.
2. **3B — Board note/link + durable offline:** schema/RLS đã chốt; note/link read/create/edit/move, draft survive reload, queue idempotent, reconnect/conflict UX, session/account/House lifecycle.
3. **3C — Private photo/audio:** private storage, bounds, metadata lifecycle/retry, hai người đọc cùng House và deny outsider/cross-House. Link chỉ http/https; không fetch preview tùy ý trên server.
4. **3D — Async Whiteboard:** tooling có giấy phép phù hợp, pen/highlighter/eraser/text/sticky note, serialization, local drafts, versioned save và conflict. Move/rotate nếu tooling hỗ trợ an toàn.
5. **3E — Integration/verification:** Home entries, offline shell/recovery, responsive/a11y, tests trên browser matrix và thử hai account thật sau cài migration mới.

Các milestone đều nằm trong Phase 3 đã có; 3A là yêu cầu identity người dùng bổ sung. Games, Letters, Island progression, Radio, Campfire, thêm AI, analytics, video và realtime Whiteboard không thuộc việc bàn giao này.

## Acceptance cần có bằng chứng

- Hai viewer thấy người dùng là thỏ, người yêu là cú; nickname giữ sau login lại; không sửa profile người khác. Hai thao tác identity đồng thời không làm hai thỏ/hai cú.
- Create note/doodle offline, đóng/reload editor, mở lại còn đủ dữ liệu, reconnect nhận một object duy nhất ở tài khoản kia.
- Commit thành công nhưng mất response: retry create **và update** không nhân bản hoặc conflict giả.
- Hai editor sửa cùng base version: một bản được lưu, bản còn lại được giữ để resolve; không overwrite im lặng. Resolve bị ngắt mạng vẫn không mất bản.
- Hai tab cùng sync; logout/account switch/House mismatch khi request đang bay; không gửi nhầm account/House và không làm private cache cũ xuất hiện dưới account mới.
- Anonymous, outsider, third member, cross-House UUID/path: đọc/ghi DB và storage bị từ chối. Membership direct writes vẫn bị cấm. Payload sai type/oversize/version/URL bị từ chối.
- Photo/audio upload hoặc metadata lỗi có retry rõ; mic từ chối vẫn dùng Board được; người kia nghe/xem media private đúng quyền.
- Whiteboard restore snapshot/draft, các công cụ cơ bản, keyboard/touch/undo an toàn; 390px iPhone WebKit và 320px không overflow/che control.
- Quota/IDB không khả dụng, expired session, schema/version cũ, server/network lỗi: không báo “đã lưu/đồng bộ” sai. Loading/error/empty/offline/conflict đều có UI.
- Update PWA khi draft đang viết không xóa công việc. Logout cung cấp cancel/lấy draft ra trước khi xác nhận discard; không purge nội dung server.

## Migration và verification boundary

Supabase hiện có dữ liệu thật. **Không sửa ba migration đã áp dụng, không chạy lại `setup-new-project.sql`, không reset/drop project.** Thêm migration mới, test cả fresh schema và nâng từ baseline, kiểm tra migration history do setup từng chạy qua SQL Editor. Bàn giao SQL tăng thêm và hướng dẫn apply, không tự biến bootstrap bundle thành incremental migration.

Giữ suite cũ, thêm tests có ý nghĩa cho hành vi mới. Gate implementation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, sau đó `pnpm build:e2e` và `pnpm test:e2e`. `build:e2e` là production test build với empty Supabase config trong child process, không sửa `.env.local`. E2E dùng 3100/3103; dev thật ở 3101, manual UI fixture ở 3102.

PGlite chạy actual SQL/RLS nhưng không mô phỏng hosted Storage/Auth hoặc independent concurrent connections. Fixture browser hiện dùng backend mô phỏng và chưa có Board/Whiteboard. Bổ sung local/hosted Supabase integration thích hợp; không nhận fixture pass làm bằng chứng end-to-end live. Manual iOS/Android installed PWA vẫn cần thiết bị thật.

Lần review này đọc canonical docs và source; không sửa runtime/schema, không chạy lại lint/typecheck/test/build/E2E. Số 191/45 là baseline đã chạy ở lần sửa UI ngay trước, không phải tests Phase 3.
