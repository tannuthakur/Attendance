-- Minimal pgTAP stand-ins (results recorded in public._tap). Mirrors the pgTAP functions our tests use.
create table public._tap (n serial, ok boolean, descr text, diag text);
grant all on public._tap to anon, authenticated; grant all on sequence public._tap_n_seq to anon, authenticated;
create function public._rec(ok boolean, descr text, diag text default null) returns text language plpgsql security definer as $$
begin insert into public._tap(ok, descr, diag) values (ok, descr, diag); return (case when ok then 'ok' else 'not ok' end) || ' - ' || coalesce(descr,''); end $$;
create function public.no_plan() returns setof boolean language sql as $$ select true where false $$;
create function public.plan(int) returns text language sql as $$ select '1..' || $1 $$;
create function public.finish() returns setof text language sql as $$ select 'finish' where false $$;
create function public.pass(text) returns text language sql as $$ select public._rec(true, $1) $$;
create function public.ok(boolean, text) returns text language sql as $$ select public._rec(coalesce($1,false), $2) $$;
create function public."is"(anyelement, anyelement, text) returns text language sql as $$ select public._rec($1 is not distinct from $2, $3, 'have ' || coalesce($1::text,'NULL') || ' want ' || coalesce($2::text,'NULL')) $$;
create function public.matches(text, text, text) returns text language sql as $$ select public._rec($1 ~ $2, $3, 'have ' || coalesce($1,'NULL')) $$;
create function public.has_function(name, name, text) returns text language sql as $$ select public._rec(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2), $3) $$;
create function public.is_empty(text, text) returns text language plpgsql as $$ declare c int := 0; r record; begin for r in execute $1 loop c := c + 1; end loop; return public._rec(c = 0, $2, c || ' rows'); exception when others then return public._rec(false, $2, 'error ' || sqlstate || ' ' || sqlerrm); end $$;
create function public.isnt_empty(text, text) returns text language plpgsql as $$ declare c int := 0; r record; begin for r in execute $1 loop c := c + 1; end loop; return public._rec(c > 0, $2, c || ' rows'); exception when others then return public._rec(false, $2, 'error ' || sqlstate || ' ' || sqlerrm); end $$;
create function public.lives_ok(text, text) returns text language plpgsql as $$ begin execute $1; return public._rec(true, $2); exception when others then return public._rec(false, $2, 'died ' || sqlstate || ' ' || sqlerrm); end $$;
create function public.throws_ok(text, char(5), text, text) returns text language plpgsql as $$
begin execute $1; return public._rec(false, $4, 'no exception');
exception when others then return public._rec(sqlstate = $2 and ($3 is null or sqlerrm = $3), $4, 'got ' || sqlstate || ' ' || sqlerrm);
end $$;
grant execute on all functions in schema public to anon, authenticated;
