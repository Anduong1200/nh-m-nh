import { isUuid } from "@/modules/knocks/model";
export type MediaReference = { id: string; houseId: string; ownerId: string; kind: "photo" | "audio"; bucket: "nha-minh-private"; path: string; mime: string; bytes: number; durationSeconds: number | null };
export function mediaReferenceFromRow(value: unknown): MediaReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const bytes = typeof row.size_bytes === "string" ? Number(row.size_bytes) : row.size_bytes;
  const duration = typeof row.duration_seconds === "string" ? Number(row.duration_seconds) : row.duration_seconds;
  if (!isUuid(row.id) || !isUuid(row.house_id) || !isUuid(row.owner_id) || row.state !== "ready" || row.bucket_id !== "nha-minh-private" || row.storage_path !== `${row.house_id}/${row.id}` || !Number.isSafeInteger(bytes) || typeof bytes !== "number" || bytes < 1 || bytes > 20971520) return null;
  if (row.media_type === "photo" ? !["image/jpeg","image/png","image/webp"].includes(row.mime_type as string) || duration !== null
    : row.media_type !== "audio" || !["audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav"].includes(row.mime_type as string) || typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 60) return null;
  return { id: row.id, houseId: row.house_id, ownerId: row.owner_id, kind: row.media_type as "photo" | "audio", bucket: "nha-minh-private", path: row.storage_path as string, mime: row.mime_type as string, bytes, durationSeconds: duration as number | null };
}
