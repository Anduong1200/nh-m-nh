import { SignInPage } from "./sign-in-page";
import { getSupabasePublicConfiguration } from "@/lib/env";

export const metadata = {
  title: "Đăng nhập — Nhà Mình",
  description: "Đăng nhập vào Nhà Mình, ngôi nhà nhỏ của hai đứa.",
};

export default function Page() {
  return <SignInPage configured={Boolean(getSupabasePublicConfiguration())} />;
}
