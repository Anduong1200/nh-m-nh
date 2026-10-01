import { redirect } from "next/navigation";
import { getMyHouse } from "@/modules/houses/server";
import { SetupPage } from "./setup-page";

export const metadata = {
  title: "Dựng Nhà — Nhà Mình",
  description: "Tạo Nhà mới hoặc nhận lời mời ghép đôi.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const house = await getMyHouse();

  // Already have a house — go to it.
  if (house) {
    redirect("/house");
  }

  return <SetupPage />;
}
