import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
const fixture="http://127.0.0.1:3103";
const url=(scope:string,actor=0)=>`${fixture}/?games-ui=1&session=${scope}&actor=${actor}`;
async function open(page:Page,scope:string,actor=0){await page.goto(url(scope,actor));await expect(page.getByRole("heading",{name:"Hộp Trò Chơi",exact:true})).toBeVisible();await expect(page.getByRole("navigation",{name:"Hộp trò chơi"})).toBeVisible();}
async function create(page:Page,type:string,prompt:string,turns?:number){await page.getByRole("region",{name:"Bắt đầu màn mới"}).getByRole("button",{name:type,exact:false}).click();await page.getByLabel(type==="Draw & Guess"?"Từ khóa bí mật":"Chủ đề của hai đứa").fill(prompt);if(turns!==undefined)await page.getByLabel("Số lượt:",{exact:false}).fill(String(turns));await page.getByRole("button",{name:"Tạo màn",exact:true}).click();await expect(page.getByRole("region",{name:"Màn trò chơi đang chọn"})).toBeVisible();}
async function select(page:Page,type:string){await page.getByRole("region",{name:"Các màn đang chơi"}).getByRole("button",{name:type,exact:false}).click();}
async function draw(page:Page){
  await expect(page.getByRole("button",{name:"Bút xanh",exact:true})).toBeEnabled({timeout:20000});await page.getByRole("button",{name:"Bút xanh",exact:true}).click();const canvas=page.locator(".games-canvas canvas").last();await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();if(!b)throw new Error("Canvas missing");
  const touch=await page.evaluate(()=>navigator.maxTouchPoints>0);
  if(touch&&page.context().browser()?.browserType().name()==="chromium"){
    const cdp=await page.context().newCDPSession(page);await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:b.x+60,y:b.y+100,id:1}]});for(let i=1;i<=12;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:b.x+60+i*5,y:b.y+100+i*2,id:1}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();
  }else{await page.mouse.move(b.x+60,b.y+100);await page.mouse.down();await page.mouse.move(b.x+130,b.y+140,{steps:12});await page.mouse.up();}
  await expect(page.getByRole("button",{name:"Gửi lượt",exact:true})).toBeEnabled();
}
test.afterEach(async({page})=>{await page.evaluate(async()=>{const h=(window as unknown as {gamesUiHarness?:{logout():Promise<void>}}).gamesUiHarness;await h?.logout();}).catch(()=>{});});
test("story UI persists async turns and shows the genuine completed artifact",async({page,context})=>{
  const scope=randomUUID();await open(page,scope);await create(page,"One-line Story","Chiếc lá của hai đứa",2);await page.getByLabel("Một dòng tiếp theo").fill("Thỏ nhặt được chiếc lá.");await page.getByRole("button",{name:"Gửi lượt",exact:true}).click();await expect(page.getByText("Người ấy sẽ tiếp tục khi rảnh.",{exact:false})).toBeVisible();
  const partner=await context.newPage();await open(partner,scope,1);await select(partner,"One-line Story");await expect(partner.getByText("Thỏ nhặt được chiếc lá.",{exact:true})).toBeVisible();await partner.getByLabel("Một dòng tiếp theo").fill("Cú cất nó vào sổ.");await partner.getByRole("button",{name:"Gửi lượt",exact:true}).click();await expect(partner.getByText("Kỷ vật đã được giữ trong Nhà.",{exact:false})).toBeVisible();await page.getByRole("button",{name:"Tải lại",exact:true}).click();await page.getByRole("button",{name:"Kỷ vật trò chơi",exact:true}).click();await page.getByRole("region",{name:"Kỷ vật đã hoàn thành"}).getByRole("button",{name:"One-line Story",exact:false}).click();await expect(page.getByText("Cú cất nó vào sổ.",{exact:true})).toBeVisible();await partner.close();
});
test("Draw & Guess UI keeps the answer private and uses real drawing and completion",async({page,context})=>{
  test.setTimeout(60000);const scope=randomUUID();await open(page,scope);await create(page,"Draw & Guess","thỏ bí mật");await draw(page);await page.getByRole("button",{name:"Gửi lượt",exact:true}).click();
  const partner=await context.newPage();await open(partner,scope,1);await select(partner,"Draw & Guess");await expect(partner.getByText("thỏ bí mật",{exact:false})).toHaveCount(0);await expect(partner.getByRole("img",{name:"Bức vẽ chung đã gửi"})).toBeVisible();await partner.getByLabel("Bạn đoán là gì?").fill("thỏ bí mật");await partner.getByRole("button",{name:"Gửi lượt",exact:true}).click();await expect(partner.getByText("Từ khóa: thỏ bí mật",{exact:true})).toBeVisible();await expect(partner.getByText("Kỷ vật đã được giữ trong Nhà.",{exact:false})).toBeVisible();await partner.close();
});
test("Doodle Relay UI keeps both contributions in the shared artifact",async({page,context})=>{
  test.setTimeout(60000);const scope=randomUUID();await open(page,scope);await create(page,"Doodle Relay","Hai nét nhỏ",2);await draw(page);await page.getByRole("button",{name:"Gửi lượt",exact:true}).click();const partner=await context.newPage();await open(partner,scope,1);await select(partner,"Doodle Relay");await draw(partner);await partner.getByRole("button",{name:"Gửi lượt",exact:true}).click();await expect(partner.getByText("Kỷ vật đã được giữ trong Nhà.",{exact:false})).toBeVisible();await expect(partner.getByRole("img",{name:"Bức vẽ chung đã gửi"}).locator("polyline")).toHaveCount(2);await partner.close();
});
test("Photo Mission UI accepts an owned upload reference and preserves two captions",async({page,context})=>{
  const scope=randomUUID();await open(page,scope);await create(page,"Photo Mission","Bầu trời của hai đứa");await page.getByLabel("Ảnh cho thử thách").setInputFiles({name:"sky.png",mimeType:"image/png",buffer:Buffer.from("fixture-owned-photo")});await page.getByLabel("Chú thích nhỏ").fill("Trời bên thỏ");await expect(page.getByRole("button",{name:"Gửi lượt",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Gửi lượt",exact:true}).click();const partner=await context.newPage();await open(partner,scope,1);await select(partner,"Photo Mission");await expect(partner.getByText("Trời bên thỏ",{exact:true})).toBeVisible();await partner.getByLabel("Ảnh cho thử thách").setInputFiles({name:"sky.png",mimeType:"image/png",buffer:Buffer.from("fixture-owned-photo")});await partner.getByLabel("Chú thích nhỏ").fill("Trời bên cú");await expect(partner.getByRole("button",{name:"Gửi lượt",exact:true})).toBeEnabled();await partner.getByRole("button",{name:"Gửi lượt",exact:true}).click();await expect(partner.getByText("Kỷ vật đã được giữ trong Nhà.",{exact:false})).toBeVisible();await expect(partner.getByText("Trời bên cú",{exact:true})).toBeVisible();await partner.close();
});
test("offline create draft reopens after reload and logout immediately closes private UI",async({page,context})=>{
  const scope=randomUUID();await open(page,scope);await context.setOffline(true);await page.getByRole("region",{name:"Bắt đầu màn mới"}).getByRole("button",{name:"One-line Story",exact:false}).click();await page.getByLabel("Chủ đề của hai đứa").fill("Nháp riêng ngoại tuyến");await expect(page.getByText("Mở bản nháp One-line Story",{exact:true})).toBeVisible();await context.setOffline(false);await page.reload();await expect(page.getByRole("navigation",{name:"Hộp trò chơi"})).toBeVisible();await page.getByRole("button",{name:"Mở bản nháp One-line Story",exact:true}).click();await expect(page.getByLabel("Chủ đề của hai đứa")).toHaveValue("Nháp riêng ngoại tuyến");await page.evaluate(async()=>{await (window as unknown as {gamesUiHarness:{logout():Promise<void>}}).gamesUiHarness.logout();});await expect(page.getByRole("heading",{name:"Hộp trò chơi đã đóng.",exact:true})).toBeVisible();await expect(page.getByLabel("Chủ đề của hai đứa")).toHaveCount(0);
});
test("editing then immediately switching history/session and returning Home flushes the exact draft",async({page})=>{
  const scope=randomUUID();await open(page,scope);
  await page.getByRole("region",{name:"Bắt đầu màn mới"}).getByRole("button",{name:"One-line Story",exact:false}).click();
  await page.getByLabel("Chủ đề của hai đứa").fill("Những chữ cuối vừa nhập");
  // Deliberately no autosave wait between editing and navigating.
  await page.getByRole("button",{name:"Kỷ vật trò chơi",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Những màn đã thành kỷ vật",exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"Mở bản nháp One-line Story",exact:true}).click();
  await expect(page.getByLabel("Chủ đề của hai đứa")).toHaveValue("Những chữ cuối vừa nhập");
  await page.getByRole("button",{name:"Tạo màn",exact:true}).click();await expect(page.getByLabel("Một dòng tiếp theo")).toBeVisible();
  await page.getByLabel("Một dòng tiếp theo").fill("Dòng đang viết phải còn nguyên.");await page.getByRole("button",{name:"Kỷ vật trò chơi",exact:true}).click();
  await page.getByRole("button",{name:"Đang chơi",exact:true}).click();await select(page,"One-line Story");await expect(page.getByLabel("Một dòng tiếp theo")).toHaveValue("Dòng đang viết phải còn nguyên.");
  await page.getByLabel("Một dòng tiếp theo").fill("Nội dung cuối trước khi về Nhà.");await page.getByRole("link",{name:"Về Nhà",exact:true}).click();await page.waitForURL("**/house");
  await open(page,scope);await select(page,"One-line Story");await expect(page.getByLabel("Một dòng tiếp theo")).toHaveValue("Nội dung cuối trước khi về Nhà.");
});
test("a second device advancing turns preserves the old unsent line through new edits and reload",async({page})=>{
  const scope=randomUUID();await open(page,scope);await create(page,"One-line Story","Hai thiết bị, hai bản nháp",4);
  await page.getByLabel("Một dòng tiếp theo").fill("Dòng cũ đang viết dở.");await page.getByRole("button",{name:"Kỷ vật trò chơi",exact:true}).click();
  const api=(path:string,actor=0)=>`${fixture}/api/games/${path}?session=${scope}&actor=${actor}`;
  const listed=await (await page.request.get(api("list"))).json() as {sessions:{id:string}[]};const sessionId=listed.sessions[0]!.id;
  // Separate-device commands deliberately do not touch this browser's IDB draft.
  for(const [actor,expectedVersion,text] of [[0,1,"Thỏ đã gửi ở máy khác."],[1,2,"Cú tiếp tục câu chuyện."]] as const){
    const response=await page.request.post(api("apply",actor),{data:{operationId:randomUUID(),sessionId,expectedVersion,kind:"line",payload:{text}}});
    expect((await response.json() as {receipt:{outcome:string}}).receipt.outcome).toBe("applied");
  }
  await page.getByRole("button",{name:"Tải lại",exact:true}).click();await page.getByRole("button",{name:"Đang chơi",exact:true}).click();await select(page,"One-line Story");
  await expect(page.getByLabel("Một dòng tiếp theo")).toHaveValue("");
  const recovery=page.getByRole("region",{name:"Bản nháp lượt cũ",exact:true});await recovery.locator("summary").first().click();await expect(recovery.getByText("Dòng cũ đang viết dở.",{exact:true})).toBeVisible();
  await page.getByLabel("Một dòng tiếp theo").fill("Dòng mới tách khỏi bản cũ.");await page.getByRole("button",{name:"Kỷ vật trò chơi",exact:true}).click();await page.reload();await select(page,"One-line Story");
  await expect(page.getByLabel("Một dòng tiếp theo")).toHaveValue("Dòng mới tách khỏi bản cũ.");await recovery.locator("summary").first().click();await expect(recovery.getByText("Dòng cũ đang viết dở.",{exact:true})).toBeVisible();
});
