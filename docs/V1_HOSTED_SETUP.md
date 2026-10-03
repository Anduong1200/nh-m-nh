# Complete the existing project

Apply `supabase/upgrade-phase2-to-v1.sql` in the existing project's SQL Editor
once. It is generated from canonical migrations, wrapped in one transaction,
preserves user rows and rejects partial/already installed schemas. Do not remove
guards. `setup-new-project.sql` is only for a project without application tables.

Read-only verification in the same project:

```sql
select to_regclass('public.board_objects') as board,
       to_regclass('public.island_entries') as journal,
       to_regclass('public.letters') as letters,
       to_regclass('public.push_subscriptions') as push;
```

All four columns must name their tables. For a REST schema cache lag after a
successful transaction, run `notify pgrst, 'reload schema';` and retry. Do not
weaken RLS or grant anonymous access to resolve a cache error.

Photo/voice uploads need the same project's server Secret key in ignored
`.env.local` as `SUPABASE_SECRET_KEY=...` or deployment secrets. Retrieve it from
Supabase API Keys settings. Never use a `NEXT_PUBLIC_` variable, source file,
Git or chat. Restart Next after changing server configuration. The publishable
key alone cannot upload verified private media. The migration creates the private
bounded bucket.

See [BACKGROUND_NOTIFICATIONS.md](BACKGROUND_NOTIFICATIONS.md) for optional push
and scheduler setup. A git push is not a deployment.

Two-account acceptance: enter Board from Home; add/edit/move a note and doodle;
check partner edits and creator-only trash/restore; confirm a memory and create
a milestone on Island; reload both accounts; reconnect an offline note; upload
photo/voice; verify outsiders/anonymous cannot read them. Repeat cold offline and
push scenarios on installed physical iPhone/Android.
