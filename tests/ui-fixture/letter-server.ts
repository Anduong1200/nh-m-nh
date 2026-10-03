// Test-only HTTP boundary over the real PostgreSQL schema/RPCs; fake auth identities only.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLettersDatabase, letterActors, letterAsUser, makeLetterDue } from "../fixtures/letters-db";
let database: ReturnType<typeof createLettersDatabase> | undefined;
function json(response: ServerResponse, value: unknown, status = 200) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); }
export async function handleLetterFixture(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (!url.pathname.startsWith("/api/letters/")) return false;
  database ??= createLettersDatabase();
  const { db, house, otherHouse } = await database;
  const actor = letterActors[Number(url.searchParams.get("actor") ?? 0)];
  if (!actor) { json(response, { blocked: true }, 403); return true; }
  const context = { accountId: actor, houseId: actor === letterActors[0] || actor === letterActors[1] ? house : otherHouse };
  try {
    if (url.pathname === "/api/letters/context") { json(response, context); return true; }
    if (url.pathname === "/api/letters/list") {
      const ids = await letterAsUser<{ id: string }>(db, actor, "select id from public.letters where house_id=$1 order by deliver_at desc limit 30", [context.houseId]);
      const letters = [];
      for (const row of ids) {
        const values = await letterAsUser<{ r: unknown }>(db, actor, "select public.get_letter($1,$2) r", [context.houseId, row.id]);
        if (values[0]!.r !== null) letters.push(values[0]!.r);
      }
      json(response, { context, letters }); return true;
    }
    if (url.pathname === "/api/letters/read") {
      const rows = await letterAsUser<{ r: unknown }>(db, actor, "select public.get_letter($1,$2) r", [context.houseId, url.searchParams.get("id")]);
      json(response, { context, letter: rows[0]!.r }); return true;
    }
    let body = ""; for await (const chunk of request) { body += chunk; if (body.length > 50000) throw new Error("Too large"); }
    const command = JSON.parse(body);
    if (url.pathname === "/api/letters/control") {
      // Trusted fixture controls only, not production endpoints or alternate auth paths.
      if (command.due) await makeLetterDue(db, command.letterId);
      if (command.staleActor !== undefined) await db.query("update public.letter_reveal_participants set heartbeat_at=clock_timestamp()-interval '16 seconds' where session_id=$1 and user_id=$2", [command.sessionId, letterActors[command.staleActor]!]);
      if (command.expire) await db.query("update public.letter_reveal_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1", [command.sessionId]);
      json(response, { ok: true }); return true;
    }
    const name = url.pathname === "/api/letters/apply" ? "apply_letter_command" : url.pathname === "/api/letters/reveal" ? "apply_letter_reveal" : null;
    if (!name) throw new Error("Unknown fixture action");
    const rows = await letterAsUser<{ r: unknown }>(db, actor, `select public.${name}($1,$2) r`, [context.houseId, command]);
    json(response, name === "apply_letter_command" ? { receipt: rows[0]!.r } : { context, session: rows[0]!.r });
  } catch { json(response, { error: "Fixture request not authorized or valid" }, 403); }
  return true;
}
