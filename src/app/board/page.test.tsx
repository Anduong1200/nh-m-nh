import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(()=>({config:vi.fn(),user:vi.fn(),house:vi.fn(),read:vi.fn(),redirect:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("@/lib/env",()=>({getSupabasePublicConfiguration:m.config}));vi.mock("@/modules/auth/server",()=>({getVerifiedUser:m.user}));
vi.mock("@/modules/houses/server",async original=>({...await original<typeof import("@/modules/houses/server")>(),getMyHouse:m.house}));
vi.mock("@/modules/board/server",()=>({readBoardItems:m.read}));vi.mock("next/navigation",()=>({redirect:m.redirect}));vi.mock("./room",()=>({BoardRoom:()=>null}));
import BoardPage from "./page";
import { HouseLoadError } from "@/modules/houses/server";
import { HouseUnavailable } from "../house/house-unavailable";
beforeEach(()=>{m.config.mockReturnValue({});m.user.mockResolvedValue({id:"actor"});m.house.mockResolvedValue({id:"house",members:[{user_id:"actor"},{user_id:"partner"}]});m.read.mockResolvedValue({items:[]});m.redirect.mockImplementation((path:string)=>{throw new Error("redirect:"+path);});});
it("requires authentication, pairing and actor membership before Board reads",async()=>{
  m.user.mockResolvedValue(null);await expect(BoardPage()).rejects.toThrow("redirect:/auth/sign-in");expect(m.read).not.toHaveBeenCalled();
  m.user.mockResolvedValue({id:"actor"});for(const members of [[{user_id:"actor"}],[{user_id:"other"},{user_id:"partner"}]]){m.house.mockResolvedValue({id:"house",members});await expect(BoardPage()).rejects.toThrow("redirect:/house");}expect(m.read).not.toHaveBeenCalled();
});
it("returns a retry state rather than another House when the existing House fails to load",async()=>{m.house.mockRejectedValue(new HouseLoadError());expect((await BoardPage()).type).toBe(HouseUnavailable);expect(m.read).not.toHaveBeenCalled();});
it("passes missing-schema errors through so an empty writable Board cannot hide them",async()=>{m.read.mockResolvedValue({error:"Bảng Chung đang chờ cập nhật dữ liệu."});const page=await BoardPage();expect(page.props).toMatchObject({accountId:"actor",houseId:"house",initialItems:[],initialError:"Bảng Chung đang chờ cập nhật dữ liệu."});expect(m.read).toHaveBeenCalledWith("house",true);});
