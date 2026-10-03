import { OfflineWorkspace } from "./workspace";
export const dynamic = "force-static";
export const metadata = { title: "Nháp trên thiết bị · Nhà Mình" };
/** Public static shell only. All private content is read from account-bound IDB after consent. */
export default function OfflinePage() { return <OfflineWorkspace />; }
