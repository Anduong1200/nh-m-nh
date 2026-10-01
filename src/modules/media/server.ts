import "server-only";
import { requireVerifiedUser } from "@/modules/auth/server";
import { getMyHouse } from "@/modules/houses/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/modules/knocks/model";
import { mediaReferenceFromRow } from "./model";
export async function getMediaReference(id: string, houseId: string) {
  const user = await requireVerifiedUser();
  const house = await getMyHouse();
  if (!isUuid(id) || house?.id !== houseId || !house.members.some((m) => m.user_id === user.id)) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("media_objects").select("id,house_id,owner_id,media_type,bucket_id,storage_path,state,mime_type,size_bytes,duration_seconds").eq("id",id).eq("house_id",houseId).eq("state","ready").maybeSingle();
  const result = error ? null : mediaReferenceFromRow(data);
  return result?.houseId === houseId ? result : null;
}
