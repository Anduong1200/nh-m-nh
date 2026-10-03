import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { AccountOfflineStore, clearAccountOfflineData, getOfflineRecoveryContext, RECENT_CONTENT_MAX_AGE_MS } from "./store";
const accounts: string[] = [];
function account() { const id=crypto.randomUUID();accounts.push(id);return new AccountOfflineStore(id); }
function binding(store: AccountOfflineStore, now = Date.now()) { return { accountId:store.accountScope, houseId:crypto.randomUUID(), displayName:"Thỏ", houseName:"Nhà", verifiedAt:new Date(now).toISOString() }; }
afterEach(async()=>{for(const id of accounts)await clearAccountOfflineData(id);accounts.length=0;});
it("offers only the latest verified namespace and ignores late responses from another account",async()=>{
  const a=account(), b=account(), now=Date.now(), first=binding(a,now), next=binding(b,now+1);
  await a.rememberRecoveryContext(first);await b.rememberRecoveryContext(next);await a.rememberRecoveryContext(first);
  expect(await getOfflineRecoveryContext(now+1)).toMatchObject(next);
  await clearAccountOfflineData(a.accountScope);expect(await getOfflineRecoveryContext(now+1)).toMatchObject(next);
});
it("local logout invalidates old handles and late verified pages without rebinding erased data",async()=>{
  const a=account(), old=binding(a,Date.now()-1000);await a.rememberRecoveryContext(old);await a.assertCurrent();await clearAccountOfflineData(a.accountScope);
  expect(await getOfflineRecoveryContext()).toBeNull();await expect(a.rememberRecoveryContext(old)).rejects.toThrow(/cleared/);
  const reopened=new AccountOfflineStore(a.accountScope);await reopened.rememberRecoveryContext(old);expect(await getOfflineRecoveryContext()).toBeNull();reopened.close();
});
it("expires recovery permission without deleting local drafts and rejects future clock anomalies",async()=>{
  const a=account(), now=Date.now(), old=binding(a,now-RECENT_CONTENT_MAX_AGE_MS-1);await a.rememberRecoveryContext(old);
  await a.saveDraft({houseId:old.houseId,schemaVersion:1,id:"saved-note",kind:"note",payload:"Still here",expectedVersion:null});
  expect(await getOfflineRecoveryContext(now)).toBeNull();expect((await a.getDraft("saved-note"))?.payload).toBe("Still here");
  await a.rememberRecoveryContext({...old,verifiedAt:new Date(now+10*60_000).toISOString()});expect(await getOfflineRecoveryContext(now)).toBeNull();
});
it("rejects invalid actor/House and unbounded labels before touching recovery metadata",async()=>{
  const a=account(), row=binding(a);
  for(const bad of [{...row,houseId:"other"},{...row,accountId:crypto.randomUUID()},{...row,houseName:"x".repeat(101)}])await expect(a.rememberRecoveryContext(bad)).rejects.toThrow(/Invalid recovery/);
  expect(await getOfflineRecoveryContext()).toBeNull();
});
