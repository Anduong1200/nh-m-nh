import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabasePublicConfiguration } from "@/lib/env";
import { getVerifiedUser } from "@/modules/auth/server";
import { getMyHouse, HouseLoadError } from "@/modules/houses/server";
import { listLettersAction } from "@/modules/letters/actions";
import { LettersScreen } from "@/components/phase4/letters";
import "./letters.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hòm thư · Nhà Mình" };

export default async function LettersPage() {
  if (!getSupabasePublicConfiguration()) redirect("/auth/sign-in");
  const user = await getVerifiedUser();
  if (!user) redirect("/auth/sign-in");
  let house;
  try { house = await getMyHouse(); }
  catch (error) {
    if (!(error instanceof HouseLoadError)) throw error;
    return <main id="main-content" className="state-page"><div className="state-paper" role="alert"><h1>Chưa mở được hòm thư.</h1><p>Chưa xác nhận được quyền vào Nhà. Bạn có thể thử tải lại.</p><Link href="/house">Về Nhà</Link></div></main>;
  }
  if (!house) redirect("/house/setup");
  if (house.members.length !== 2) return <main id="main-content" className="state-page"><div className="state-paper"><h1>Hòm thư của hai đứa.</h1><p>Mời người thương vào Nhà để gửi thư cho nhau.</p><Link href="/house">Về Nhà</Link></div></main>;
  const context = { accountId: user.id, houseId: house.id };
  const result = await listLettersAction(context);
  if (result.blocked) return <main id="main-content" className="state-page"><div className="state-paper" role="alert"><h1>Cần xác nhận lại quyền vào Nhà.</h1><Link href="/house">Về Nhà</Link></div></main>;
  const names = Object.fromEntries(house.members.map(member => [member.user_id, member.profile?.display_name || "Người thương"]));
  return <LettersScreen key={`${user.id}:${house.id}`} context={context} initialLetters={result.letters ?? []} names={names} initialError={result.error ?? null} />;
}
