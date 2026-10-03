import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),house:vi.fn(),result:{data:[] as unknown[]|null,error:null as {code:string;message?:string}|null}}));
vi.mock("server-only",()=>({}));vi.mock("@/lib/supabase/server",()=>({createSupabaseServerClient:mocks.client}));vi.mock("@/modules/auth/server",()=>({requireVerifiedUser:mocks.user}));vi.mock("@/modules/houses/server",()=>({getMyHouse:mocks.house}));
import { readBoardItems } from "./server";
beforeEach(()=>{mocks.result={data:[],error:null};const query={select:vi.fn(),eq:vi.fn(),is:vi.fn(),order:vi.fn()};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.is.mockReturnValue(query);query.order.mockImplementation(()=>Object.assign(Promise.resolve(mocks.result),query));mocks.client.mockResolvedValue({from:()=>query});});
describe("Board unavailable state",()=>{
  it.each(["PGRST205","PGRST204","42P01","42703"])("labels known absent schema %s without raw diagnostics",async code=>{mocks.result={data:null,error:{code,message:"private table detail"}};const result=await readBoardItems(crypto.randomUUID());expect(result).toEqual({error:"Bảng Chung đang chờ cập nhật dữ liệu.",unavailableReason:"schema"});expect(JSON.stringify(result)).not.toContain("private");});
  it.each(["42501","28000","PGRST301","XX000"])("keeps auth/read failure %s closed rather than pretending the Board is empty",async code=>{mocks.result={data:null,error:{code}};expect(await readBoardItems(crypto.randomUUID())).toEqual({error:"Chưa tải được bảng chung.",unavailableReason:"read"});});
  it("does not treat malformed cached/schema rows as an empty usable Board",async()=>{mocks.result.data=[{id:crypto.randomUUID(),payload:{text:"Bad row"}}];expect((await readBoardItems(crypto.randomUUID())).unavailableReason).toBe("read");});
});
