import { redirect } from "next/navigation";
/** The existing authorized House remains the only Home implementation. */
export default function HomeAlias() { redirect("/house"); }
