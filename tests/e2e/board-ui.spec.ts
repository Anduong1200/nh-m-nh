import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
test("Board UI saves, reopens and reconnects a note using the versioned domain", async ({ page, context }) => {
  const url = "http://127.0.0.1:3103/?board-ui=1&session=" + randomUUID();
  await page.goto(url);
  const add = page.getByRole("button", { name: "+ Thêm ghi chú", exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  const text = page.getByRole("textbox", { name: "Nội dung ghi chú" });
  await text.fill("Ghi chú thật từ giao diện");
  await page.getByRole("button", { name: "Lưu ghi chú", exact: true }).click();
  await expect(text).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Bản đang viết được giữ");
  await page.reload();
  await expect(text).toHaveValue("Ghi chú thật từ giao diện");
  await context.setOffline(true);
  await text.fill("Viết khi không có mạng");
  await page.getByRole("button", { name: "Lưu ghi chú", exact: true }).click();
  await expect(text).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("chờ đồng bộ");
  await context.setOffline(false);
  await expect(text).toBeEnabled();
  await page.reload();
  await expect(text).toHaveValue("Viết khi không có mạng");
  await page.getByRole("button", { name: "Xoay ghi chú" }).click();
  await page.getByRole("button", { name: "Di chuyển ghi chú" }).press("ArrowRight");
  await page.getByRole("button", { name: "Lưu ghi chú", exact: true }).click();
  await expect(text).toBeEnabled();
});
test("Board stickers survive offline save, reconnect, movement and rotation",async({page,context})=>{
  const url="http://127.0.0.1:3103/?board-ui=1&session="+randomUUID();
  await page.goto(url);
  await expect(page.getByRole("button",{name:"Thêm sticker",exact:true})).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole("button",{name:"Thêm sticker",exact:true}).click();
  await page.getByRole("button",{name:"Sticker leaf",exact:true}).click();
  const card=page.getByRole("article",{name:"Sticker đã ghim",exact:true});
  await expect(card).toContainText("🍃");
  const save=page.getByRole("button",{name:"Lưu sticker",exact:true});
  await save.click();await expect(save).toBeDisabled();
  await context.setOffline(false);await expect(save).toBeEnabled();
  await page.reload();await expect(card).toContainText("🍃");
  const transform=await card.evaluate(e=>(e as HTMLElement).style.transform);
  await page.getByRole("button",{name:"Di chuyển sticker",exact:true}).press("ArrowRight");
  await page.getByRole("button",{name:"Xoay sticker",exact:true}).click();
  await save.click();await expect(save).toBeEnabled();
  await page.reload();await expect(card).toContainText("🍃");
  expect(await card.evaluate(e=>(e as HTMLElement).style.transform)).not.toBe(transform);
});
test("Board links are shared, movable, and creator-only trash is recoverable",async({page,context})=>{
  test.setTimeout(60000);
  const session=randomUUID(),url=`http://127.0.0.1:3103/?board-ui=1&session=${session}`;
  await page.goto(url);await expect(page.getByRole("button",{name:"+ Link",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"+ Link",exact:true}).click();
  await page.getByRole("textbox",{name:"Liên kết mới",exact:true}).fill("https://example.com/a?b=2");
  await page.getByRole("textbox",{name:"Tên liên kết mới",exact:true}).fill("Một góc để ghé");
  await page.getByRole("button",{name:"Ghim liên kết",exact:true}).click();
  const link=page.getByRole("link",{name:"Một góc để ghé",exact:true});await expect(link).toHaveAttribute("rel","noopener noreferrer");
  await expect(page.getByRole("button",{name:"Lưu liên kết",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Di chuyển liên kết",exact:true}).press("ArrowRight");await page.getByRole("button",{name:"Xoay liên kết",exact:true}).click();
  await page.getByRole("button",{name:"Lưu liên kết",exact:true}).click();await expect(page.getByRole("button",{name:"Lưu liên kết",exact:true})).toBeEnabled();
  const partner=await context.newPage();await partner.goto(url+"&actor=1");await expect(partner.getByRole("link",{name:"Một góc để ghé",exact:true})).toBeVisible();
  await expect(partner.getByRole("button",{name:"Đưa vào thùng rác",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Đưa vào thùng rác",exact:true}).click();await expect(link).toHaveCount(0);
  await page.getByRole("button",{name:/Thùng rác \(1\)/}).click();await expect(page.getByRole("dialog",{name:"Thùng rác của bảng"})).toBeVisible();
  await page.getByRole("button",{name:"Khôi phục liên kết",exact:true}).click();await expect(page.getByRole("button",{name:"Khôi phục liên kết",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Đóng",exact:true}).click();await expect(link).toBeVisible();await page.reload();await expect(link).toBeVisible();
});
test("Board doodles persist offline and survive reload with actual pen strokes",async({page,context})=>{
  const url="http://127.0.0.1:3103/?board-ui=1&session="+randomUUID();await page.goto(url);
  await expect(page.getByRole("button",{name:"+ Vẽ",exact:true})).toBeEnabled();await page.getByRole("button",{name:"+ Vẽ",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"Vẽ trên Bảng Chung"});await expect(editor.getByRole("button",{name:"Bút xanh",exact:true})).toBeVisible();
  await editor.getByRole("button",{name:"Bút xanh",exact:true}).click();
  const canvas=editor.locator("canvas.excalidraw__canvas.interactive");await expect(canvas).toBeVisible();const box=await canvas.boundingBox();if(!box)throw new Error("Canvas not visible");
  await page.mouse.move(box.x+box.width*.35,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.55,{steps:8});await page.mouse.up();
  await expect(editor.getByRole("button",{name:"Lưu bản vẽ",exact:true})).toBeEnabled();await context.setOffline(true);await editor.getByRole("button",{name:"Lưu bản vẽ",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("chờ đồng bộ");const preview=page.getByRole("img",{name:"Nét vẽ trên Bảng Chung",exact:true});await expect(preview.locator("polyline")).toHaveCount(1);
  await context.setOffline(false);await expect(page.getByRole("button",{name:"Sửa bản vẽ",exact:true})).toBeEnabled();await page.reload();await expect(preview.locator("polyline")).toHaveCount(1);
});
test("Board voice uploads a file, retains caption, and uses authorized playback endpoint",async({page})=>{
  const url="http://127.0.0.1:3103/?board-ui=1&session="+randomUUID();await page.goto(url);await expect(page.getByRole("button",{name:"+ Âm thanh",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"+ Âm thanh",exact:true}).click();await expect(page.getByRole("button",{name:"Ghi âm bằng micro",exact:true})).toBeVisible();
  await page.getByLabel("Chọn âm thanh cho bảng",{exact:true}).setInputFiles({name:"hello.wav",mimeType:"audio/wav",buffer:Buffer.from("fixture-only-file")});
  await page.getByLabel("Chú thích tệp mới",{exact:true}).fill("Một lời nhỏ");await page.getByRole("button",{name:"Tải và ghim",exact:true}).click();
  await expect(page.getByRole("button",{name:"Lưu âm thanh",exact:true})).toBeEnabled();const audio=page.locator("audio[aria-label='Âm thanh đã ghim trong Nhà']");await expect(audio).toHaveAttribute("src",/^\/media\/[\da-f-]+\?house=33333333-3333-4333-8333-333333333333$/);
  await expect(page.getByRole("textbox",{name:"Chú thích âm thanh",exact:true})).toHaveValue("Một lời nhỏ");await page.reload();await expect(audio).toBeVisible();await expect(page.getByRole("textbox",{name:"Chú thích âm thanh",exact:true})).toHaveValue("Một lời nhỏ");
});
test("Failed media upload does not create a pretend Board attachment",async({page})=>{
  await page.goto("http://127.0.0.1:3103/?board-ui=1&upload-error=1&session="+randomUUID());await expect(page.getByRole("button",{name:"+ Ảnh",exact:true})).toBeEnabled();await page.getByRole("button",{name:"+ Ảnh",exact:true}).click();
  await page.getByLabel("Chọn ảnh cho bảng",{exact:true}).setInputFiles({name:"a.jpg",mimeType:"image/jpeg",buffer:Buffer.from("fixture-only-file")});await page.getByRole("button",{name:"Tải và ghim",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Tệp chưa được xác nhận");await expect(page.locator("[data-board-item]")).toHaveCount(0);await expect(page.getByRole("button",{name:"Tải và ghim",exact:true})).toBeEnabled();
});
test("Recovery Board holds local notes without any transport until session is verified",async({page})=>{
  let requests=0;await page.route("**/api/board/**",async route=>{requests++;await route.continue();});
  await page.goto("http://127.0.0.1:3103/?board-ui=1&sync-paused=1&session="+randomUUID());await expect(page.getByRole("button",{name:"+ Thêm ghi chú",exact:true})).toBeEnabled();
  await expect(page.getByRole("button",{name:"+ Ảnh",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"+ Âm thanh",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"+ Thêm ghi chú",exact:true}).click();await page.getByRole("textbox",{name:"Nội dung ghi chú",exact:true}).fill("Chờ xác nhận đúng Nhà rồi gửi");await page.getByRole("button",{name:"Lưu ghi chú",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("chờ đồng bộ");await page.reload();await expect(page.getByRole("textbox",{name:"Nội dung ghi chú",exact:true})).toHaveValue("Chờ xác nhận đúng Nhà rồi gửi");expect(requests).toBe(0);
  await page.getByRole("button",{name:"Xác nhận phiên kiểm thử",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Nội dung ghi chú",exact:true})).toBeEnabled();
  await expect(page.getByRole("textbox",{name:"Nội dung ghi chú",exact:true})).toHaveValue("Chờ xác nhận đúng Nhà rồi gửi");expect(requests).toBeGreaterThan(0);
});
test("Board logout invalidation immediately closes private content and open forms",async({page})=>{
  await page.goto("http://127.0.0.1:3103/?board-ui=1&session="+randomUUID());await expect(page.getByRole("button",{name:"+ Thêm ghi chú",exact:true})).toBeEnabled();await page.getByRole("button",{name:"+ Thêm ghi chú",exact:true}).click();await page.getByRole("textbox",{name:"Nội dung ghi chú",exact:true}).fill("Riêng trong Nhà");
  await page.getByRole("button",{name:"+ Link",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("nha-minh-account-cleared",{detail:"11111111-1111-4111-8111-111111111111"})));
  await expect(page.getByText("Bảng đã đóng vì phiên đăng nhập hoặc Nhà đã đổi.",{exact:true})).toBeVisible();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByRole("textbox",{name:"Nội dung ghi chú",exact:true})).toHaveCount(0);
});

test("a slow initial link save blocks edits until its receipt, then sends a versioned update",async({page},testInfo)=>{
  test.setTimeout(60000);
  let release=()=>{}, reached=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;}), entered=new Promise<void>(resolve=>{reached=resolve;});
  const requests:{mutation:string;expectedVersion:number}[]=[];
  await page.route("**/api/board/apply**",async route=>{
    const body=route.request().postDataJSON() as {operation:{mutation:string;expectedVersion:number}};
    requests.push(body.operation);if(requests.length===1){reached();await gate;}await route.continue();
  });
  try{
    await page.goto("http://127.0.0.1:3103/?board-ui=1&session="+randomUUID());await page.getByRole("button",{name:"+ Link",exact:true}).click();
    await page.getByRole("textbox",{name:"Liên kết mới",exact:true}).fill("https://example.com/slow");await page.getByRole("textbox",{name:"Tên liên kết mới",exact:true}).fill("Một góc nhỏ");await page.getByRole("button",{name:"Ghim liên kết",exact:true}).click();await entered;
    await expect(page.getByRole("button",{name:"Lưu liên kết",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"Di chuyển liên kết",exact:true})).toBeDisabled();
    release();await expect(page.getByRole("button",{name:"Lưu liên kết",exact:true})).toBeEnabled();
    await page.getByRole("button",{name:"Di chuyển liên kết",exact:true}).press("ArrowRight");await page.getByRole("button",{name:"Lưu liên kết",exact:true}).click();await expect(page.getByRole("button",{name:"Lưu liên kết",exact:true})).toBeEnabled();
    expect(requests.map(row=>({mutation:row.mutation,expectedVersion:row.expectedVersion}))).toEqual([{mutation:"append",expectedVersion:0},{mutation:"update",expectedVersion:1}]);
    await page.screenshot({path:`.pnpm-cache/qa-board-${testInfo.project.name}.png`,fullPage:true});
  }finally{release();}
});

