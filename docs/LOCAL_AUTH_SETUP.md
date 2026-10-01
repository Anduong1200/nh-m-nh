# Đăng nhập Google trên máy local

## Nối project

Project URL và publishable key của project thử nghiệm được đặt trong `.env.local` (file được Git bỏ qua):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Hai giá trị lấy trong **Connect** hoặc **Settings → API Keys** của project. Ứng dụng không cần service-role key, database password hay Google Client Secret trong file này. [Tài liệu API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Dùng server development cho đăng nhập trên HTTP local:

```powershell
pnpm dev --hostname 127.0.0.1 --port 3101
```

Mở `http://localhost:3101/auth/sign-in` bằng Chrome/Edge hoặc Safari. Phiên thử nghiệm hiện chạy development trên cổng 3101; chạy production qua HTTPS khi triển khai thật. Không giảm bảo vệ Secure cookie của production để thử trên HTTP, vì WebKit không nhận Secure cookie ở preview HTTP loopback.

## Bật Google

1. Vào project trong Supabase, mở **Authentication → Sign In / Providers → Google**. Sao chép **Callback URL** của provider; dạng `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Trong [Google Cloud Console](https://console.cloud.google.com/), tạo hoặc chọn project. Mở **Google Auth Platform** và hoàn thành Branding, Audience, Data Access nếu được yêu cầu. Với app External ở chế độ Testing, thêm hai tài khoản thử vào Test users. Chỉ cần các scope xác thực `openid`, email và profile.
3. Vào **Clients**, tạo OAuth client loại **Web application**. Authorized JavaScript origins: `http://localhost:3101`. Authorized redirect URIs: dán **Callback URL của Supabase** ở bước 1.
4. Lấy **Client ID** và **Client Secret** vừa tạo, điền vào Google provider trong Supabase, bật provider và lưu. Client Secret nằm trong cấu hình Supabase, không gửi qua chat hay đặt trong `NEXT_PUBLIC_*`.

[Hướng dẫn chính thức Google provider](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Cho phép ứng dụng nhận callback

Trong Supabase **Authentication → URL Configuration**:

- Site URL: `http://localhost:3101`
- Redirect URLs cho development: `http://localhost:3101/**` và `http://127.0.0.1:3101/**`

Hai host là hai origin khác nhau. Giữ cùng host từ lúc bấm đăng nhập đến callback để cookie PKCE hoạt động. Các mẫu local bao gồm query `next` mà ứng dụng dùng giữ lại lời mời ghép đôi. Khi triển khai production, dùng địa chỉ HTTPS và redirect cụ thể, không dùng wildcard rộng cho domain production. [Tài liệu redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Schema trước khi vào Nhà

Áp dụng các migration đã kiểm thử theo thứ tự timestamp bằng quy trình migration Supabase:

1. `supabase/migrations/20261001080000_create_identity_and_house.sql`
2. `supabase/migrations/20261001090000_harden_house_authorization.sql`
3. `supabase/migrations/20261001100000_create_presence_and_knocks.sql`

Source SQL trong repository là nguồn chuẩn. Không tạo bảng hoặc sửa RLS thủ công cho nhanh. Cần áp dụng toàn bộ schema/hardening trước khi thử House/pairing; riêng publishable key không có quyền chạy migration. Project mới hiện chưa có bảng profiles trong schema API. Xem `supabase/migrations/README.md`.

Với project mới và chưa cài Supabase CLI, mở `supabase/setup-new-project.sql`, sao chép toàn bộ vào **SQL Editor → New query** trong đúng project, rồi bấm **Run**. File được sinh bằng `node scripts/generate-supabase-setup.mjs` từ chính các migration trên, áp dụng toàn bộ trong một transaction và yêu cầu API reload schema. Nó từ chối chạy lại nếu schema ứng dụng đã tồn tại; không xóa dữ liệu. Không sửa schema bằng các query tự nghĩ thêm trong Dashboard.

Ghi lại đã áp dụng ba timestamp trên. Nếu chuyển sang quản lý bằng Supabase CLI sau khi chạy file setup, cần đối chiếu schema và ghi nhận các migration đã áp dụng trước khi `db push`; không chạy lại baseline. Các thay đổi tiếp theo vẫn là migration mới trong repository.

## Thử sau khi cấu hình xong

Mở `/auth/sign-in`, bấm Google, xác nhận trở về `/house/setup`. Tạo Nhà, tạo lời mời và mở lời mời trong một browser profile khác với tài khoản thứ hai. Thử trạng thái và Knock qua hai phiên. Kiểm tra đăng xuất và tải lại `/house` phải quay về đăng nhập. Đây là kiểm thử hosted cần chạy thật; 191 test local và fixture UI không thay thế được nó.
