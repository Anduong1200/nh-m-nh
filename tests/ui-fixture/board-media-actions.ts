import type { BoardContext } from "@/modules/board/model";
import type { MediaReference } from "@/modules/media/model";
async function upload(form: FormData, context: BoardContext, kind: "photo" | "audio"): Promise<{ media?: MediaReference; error?: string }> {
  const file=form.get("file");
  if(!(file instanceof File)||!file.size)return {error:"Chưa chọn tệp."};
  if(new URLSearchParams(location.search).get("upload-error")==="1")return {error:"Tệp chưa được xác nhận; giữ tệp và thử lại."};
  const id=crypto.randomUUID();
  return {media:{id,houseId:context.houseId,ownerId:context.accountId,kind,bucket:"nha-minh-private",path:`${context.houseId}/${id}`,mime:kind==="photo"?"image/jpeg":"audio/wav",bytes:file.size,durationSeconds:kind==="photo"?null:1}};
}
export const uploadPhotoAction=(form: FormData,context: BoardContext)=>upload(form,context,"photo");
export const uploadVoiceAction=(form: FormData,context: BoardContext)=>upload(form,context,"audio");
