import { JoinPage } from "./join-page";

export const metadata = {
  title: "Nhận lời mời — Nhà Mình",
  description: "Nhận lời mời ghép đôi và về Nhà cùng người thương.",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <JoinPage />;
}
