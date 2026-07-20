/**
 * Executable migration tests — runs EVERY migration in supabase/migrations
 * against a real Postgres, then exercises the security-critical functions.
 *
 *   npm run test:db
 *
 * WHY THIS EXISTS: these migrations previously could not be run at all without
 * Docker, so "it applies cleanly" was an assumption rather than a fact, and the
 * security properties (can a non-friend read the feed? can a user rewrite their
 * own payouts?) were only ever argued in comments. This runs Postgres in-process
 * via PGlite (WASM) — no Docker, no server, no network.
 *
 * WHAT IT DOES NOT COVER — read this before trusting a green run:
 *   * RLS POLICIES ARE NOT EXERCISED. Everything here runs as the superuser, so
 *     policies are bypassed. What IS verified is the SECURITY DEFINER functions,
 *     which is where this app puts its real cross-user authorization.
 *   * pg_cron / pg_net / pg_trgm / pgcrypto are unavailable in PGlite. The
 *     `stub()` below removes exactly those statements — so cron SCHEDULING and
 *     the trigram indexes are not verified here, only everything around them.
 *   * gen_random_bytes is a non-cryptographic stand-in. It exercises the reward
 *     code's byte->alphabet mapping, NOT its entropy.
 *
 * A green run means the SQL is valid and the logic behaves. It is not a
 * substitute for `supabase db push` against a staging project.
 */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs'; import path from 'node:path';

import { fileURLToPath } from 'node:url';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const db = await new PGlite();
await db.exec(`
  create schema if not exists auth; create schema if not exists extensions; create schema if not exists cron;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  -- auth.uid() reads a session GUC so tests can act AS a given user.
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role; exception when duplicate_object then null; end $$;
  create or replace function public.gen_random_bytes(n integer) returns bytea
    language sql as $$ select decode(string_agg(lpad(to_hex((random()*255)::int),2,'0'),''),'hex') from generate_series(1,n) $$;
  create or replace function cron.schedule(a text,b text,c text) returns bigint language sql as $$ select 1::bigint $$;
`);
// Remove only what PGlite genuinely cannot provide — see the caveats above.
const stub = s => s.replace(/create extension if not exists (pg_cron|pg_net|pg_trgm|pgcrypto);/g,'--')
                    .replace(/create index if not exists profiles_(username|display_name)_trgm[\s\S]*?;/g,'--');
for (const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.sql')).sort())
  await db.exec(stub(fs.readFileSync(path.join(DIR,f),'utf8')));

let pass=0, fail=0;
const ok  = (n)=>{pass++; console.log(`  PASS  ${n}`);};
const bad = (n,d)=>{fail++; console.log(`  FAIL  ${n}\n        ${d}`);};
const q = async (sql,p=[]) => (await db.query(sql,p)).rows;
const as = async (uid) => db.exec(`set test.uid = '${uid}';`);

// --- fixtures -------------------------------------------------------------
const mk = async (name) => {
  const [{id}] = await q(`insert into auth.users(email) values ($1) returning id`,[`${name}@t.dev`]);
  // The 0001 auth trigger already inserts the profile row; update it instead.
  await q(`insert into public.profiles(id,username) values ($1,$2)
           on conflict (id) do nothing`,[id,name]);
  await q(`update public.profiles set username=$2, display_name=$2,
             goal_calories=2500, goal_protein_g=180 where id=$1`,[id,name]);
  return id;
};
const alice = await mk('alice'), bob = await mk('bob'), carol = await mk('carol');

console.log('\n== consume_api_quotas (migration 0020) ==');
try{
  const r1 = await q(`select * from public.consume_api_quotas($1,array['t:burst'],array[2],array[60])`,[alice]);
  const r2 = await q(`select * from public.consume_api_quotas($1,array['t:burst'],array[2],array[60])`,[alice]);
  const r3 = await q(`select * from public.consume_api_quotas($1,array['t:burst'],array[2],array[60])`,[alice]);
  (r1[0].r_allowed && r2[0].r_allowed && !r3[0].r_allowed)
    ? ok('allows up to the limit then denies') : bad('limit enforcement',JSON.stringify([r1,r2,r3]));
  r3[0].r_used===3 ? ok('keeps counting past the limit (abuse stays visible)') : bad('count',r3[0].r_used);

  const multi = await q(`select * from public.consume_api_quotas($1,array['a','b'],array[5,5],array[60,86400]) order by r_bucket`,[bob]);
  multi.length===2 ? ok('resolves BOTH windows in one call') : bad('multi-window',JSON.stringify(multi));

  const other = await q(`select * from public.consume_api_quotas($1,array['t:burst'],array[2],array[60])`,[bob]);
  other[0].r_allowed ? ok('quota is per-user, not global') : bad('per-user isolation','bob denied by alice usage');

  const dup = await q(`select * from public.consume_api_quotas($1,array['d','d'],array[5,5],array[60,60])`,[carol]);
  dup.length===1 ? ok('duplicate bucket collapses (no ON CONFLICT crash)') : bad('dedupe',JSON.stringify(dup));
}catch(e){bad('quota suite threw', e.message);}

console.log('\n== normalize_rule_set (migration 0025) ==');
try{
  await as(alice);
  await q(`insert into public.gamification_rule_sets(owner_user_id,scope,name,duration_days,is_default,rules)
           values ($1,'individual','Cheat',14,true, $2::jsonb)`,
    [alice, JSON.stringify({leaderboard:{per_meal:100000},points:{per_meal:99999},xp:{per_meal:99999},
                            meal_count:{enabled:true,required:1}, protein_goal:{enabled:true,min_pct:1}})]);
  const [row] = await q(`select rules from public.gamification_rule_sets where owner_user_id=$1`,[alice]);
  const r = row.rules;
  r.leaderboard.per_meal===10 ? ok('leaderboard payout forced to system value') : bad('leaderboard payout', JSON.stringify(r.leaderboard));
  r.points.per_meal===10      ? ok('points payout forced to system value')      : bad('points payout', JSON.stringify(r.points));
  r.xp.per_meal===50          ? ok('xp payout forced to system value')          : bad('xp payout', JSON.stringify(r.xp));
  r.meal_count.required===3   ? ok('easier meal threshold clamped up to baseline'): bad('meal_count', JSON.stringify(r.meal_count));
  r.protein_goal.min_pct===100? ok('easier protein threshold clamped up')        : bad('protein_goal', JSON.stringify(r.protein_goal));

  await q(`update public.gamification_rule_sets set rules = $2::jsonb where owner_user_id=$1`,
    [alice, JSON.stringify({meal_count:{enabled:true,required:6}, protein_goal:{enabled:true,min_pct:120}})]);
  const [h] = await q(`select rules from public.gamification_rule_sets where owner_user_id=$1`,[alice]);
  (h.rules.meal_count.required===6 && h.rules.protein_goal.min_pct===120)
    ? ok('HARDER personal thresholds are preserved') : bad('harder thresholds', JSON.stringify(h.rules));
  h.rules.leaderboard.per_meal===10 ? ok('payout still system-owned after update') : bad('payout on update','');
}catch(e){bad('rule-set suite threw', e.message);}

console.log('\n== get_friend_activity_feed (migration 0021) ==');
try{
  await q(`insert into public.gamification_events(user_id,event_type,source_type,xp_delta,points_delta,leaderboard_delta)
           values ($1,'meal_logged','meal_log',50,10,10)`,[bob]);
  await as(alice);
  let feed = await q(`select * from public.get_friend_activity_feed(20,null,null)`);
  feed.length===0 ? ok('a NON-friend sees nothing') : bad('leak: non-friend saw events', feed.length);

  await q(`insert into public.friendships(requester_id,addressee_id,status) values ($1,$2,'accepted')`,[alice,bob]);
  feed = await q(`select * from public.get_friend_activity_feed(20,null,null)`);
  feed.length===1 ? ok('an accepted friend sees the event') : bad('friend feed empty', feed.length);
  feed[0]?.actor_name==='bob' ? ok('event is attributed to the FRIEND, not the viewer') : bad('attribution', feed[0]?.actor_name);

  await q(`update public.profiles set activity_visibility='private' where id=$1`,[bob]);
  feed = await q(`select * from public.get_friend_activity_feed(20,null,null)`);
  feed.length===0 ? ok('activity_visibility=private removes them from the feed') : bad('private opt-out ignored', feed.length);
  await q(`update public.profiles set activity_visibility='friends' where id=$1`,[bob]);

  await q(`insert into public.gamification_events(user_id,event_type,source_type,points_delta)
           values ($1,'reward_redemption','reward',-500)`,[bob]);
  feed = await q(`select * from public.get_friend_activity_feed(20,null,null)`);
  feed.every(r=>r.event_type!=='reward_redemption') ? ok('reward redemptions never appear in a friend feed') : bad('redemption leaked','');

  await as(bob);
  const own = await q(`select * from public.get_friend_activity_feed(20,null,null)`);
  own.every(r=>r.actor_id!==bob) ? ok('your own events are not in your friend feed') : bad('self in feed','');
}catch(e){bad('feed suite threw', e.message);}

console.log('\n== get_friend_social_links (migration 0021) ==');
try{
  await q(`update public.profiles set instagram_handle='bobhandle' where id=$1`,[bob]);
  await as(carol);
  let l = await q(`select * from public.get_friend_social_links($1)`,[bob]);
  l.length===0 ? ok('a non-friend gets ZERO rows (cannot probe)') : bad('handle leaked to non-friend', JSON.stringify(l));
  await as(alice);
  l = await q(`select * from public.get_friend_social_links($1)`,[bob]);
  l[0]?.instagram_handle==='bobhandle' ? ok('an accepted friend sees the handle') : bad('friend cannot see handle', JSON.stringify(l));
  await q(`update public.profiles set social_links_visibility='private' where id=$1`,[bob]);
  l = await q(`select * from public.get_friend_social_links($1)`,[bob]);
  l.length===0 ? ok('links set to private are hidden even from friends') : bad('private links leaked','');
}catch(e){bad('social-links suite threw', e.message);}

console.log('\n== handle format constraints (migration 0021) ==');
for (const [v,should] of [['good.handle_1',true],['https://evil.com',false],['a/b',false],['has space',false],['x'.repeat(31),false]]) {
  try { await q(`update public.profiles set instagram_handle=$2 where id=$1`,[carol,v]);
        should ? ok(`accepts ${JSON.stringify(v)}`) : bad(`ACCEPTED hostile handle ${JSON.stringify(v)}`,''); }
  catch { should ? bad(`rejected valid ${v}`,'') : ok(`rejects ${JSON.stringify(v)}`); }
}

console.log('\n== list_challenges_with_counts (migration 0024) ==');
try{
  await as(alice);
  const [{id:ch}] = await q(`insert into public.challenges(created_by,name,type,goal_type,stakes_text,duration_days,start_date,end_date)
    values ($1,'Test','solo','points','bragging rights',14,current_date-20,current_date-1) returning id`,[alice]);
  await q(`insert into public.challenge_participants(challenge_id,user_id,team_name) values ($1,$2,'A'),($1,$3,'A')`,[ch,alice,bob]);
  const rows = await q(`select * from public.list_challenges_with_counts()`);
  const row = rows.find(r=>r.id===ch);
  Number(row?.participant_count)===2 ? ok('participant_count aggregated server-side') : bad('count', row?.participant_count);
  row?.joined===true ? ok('joined flag is per-caller (alice joined)') : bad('joined flag', row?.joined);
  await as(carol);
  const c = (await q(`select * from public.list_challenges_with_counts()`)).find(r=>r.id===ch);
  c?.joined===false ? ok('joined flag false for a non-participant') : bad('joined leak', c?.joined);

  console.log('\n== finalize_challenge authorization (migration 0024) ==');
  try { await q(`select * from public.finalize_challenge($1)`,[ch]);
        bad('a NON-PARTICIPANT was able to finalize',''); }
  catch(e){ /^.*participant/i.test(e.message) ? ok('non-participant refused') : bad('wrong error', e.message); }
  await as(alice);
  const fin = await q(`select * from public.finalize_challenge($1)`,[ch]);
  fin[0]?.already_finalized===false ? ok('a participant CAN finalize') : bad('participant finalize', JSON.stringify(fin));
  const again = await q(`select * from public.finalize_challenge($1)`,[ch]);
  again[0]?.already_finalized===true ? ok('finalization is idempotent') : bad('idempotency', JSON.stringify(again));
}catch(e){bad('challenge suite threw', e.message);}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
// Non-zero exit so CI actually fails on a regression.
if (fail > 0) process.exit(1);
