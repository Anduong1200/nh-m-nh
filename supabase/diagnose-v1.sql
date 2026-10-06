-- Read-only deployment diagnostics. Run in the project's Supabase SQL Editor.
-- Returns schema/privilege metadata only, never private messages or user rows.
select current_database() as database_name, version() as postgres_version;

select wanted.name as table_name, c.oid is not null as exists,
       c.relrowsecurity as rls_enabled,
       case when c.oid is not null then has_table_privilege('authenticated', c.oid, 'SELECT') end as authenticated_select
from (values ('board_objects'), ('board_operations'), ('media_objects'),
             ('whiteboards'), ('game_sessions'), ('island_events'), ('island_entries')) wanted(name)
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = wanted.name and c.relkind = 'r'
order by wanted.name;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('board_objects', 'island_entries')
order by table_name, ordinal_position;

select wanted.name as rpc_name, p.oid is not null as exists,
       pg_get_function_identity_arguments(p.oid) as arguments,
       case when p.oid is not null then has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute
from (values ('apply_board_operation'), ('board_payload_valid'), ('get_island_state'),
             ('get_island_entries'), ('get_island_entry'), ('apply_island_entry_command')) wanted(name)
left join pg_namespace n on n.nspname = 'public'
left join pg_proc p on p.pronamespace = n.oid and p.proname = wanted.name
order by wanted.name;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename in ('board_objects', 'island_entries', 'island_events')
order by tablename, policyname;
