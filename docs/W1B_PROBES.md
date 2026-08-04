# W1B · WORLD GRAPH PROBE MATRIX

Function: `world-graph` (`supabase/functions/world-graph/index.ts`, build `w1b.1`)
Actions: `stage` · `govern` · `merge` · `delta` · `profile`
Endpoint: `POST https://<project>.functions.supabase.co/world-graph` with
`Authorization: Bearer <connector OAuth JWT | app user JWT>` and a JSON body
carrying an `action` discriminator.

The cid is derived server-side on every request. A `cid` in the body is
ignored. Verify that by inspection: `derivePrincipal()` in `identity.ts` is the
only source of `p.cid`, and every query is `.eq("cid", p.cid)`.

## Probe matrix

| # | Probe | Body | Expect |
|---|-------|------|--------|
| P1 | No bearer | `{"action":"delta"}` | 401 `missing_bearer_token` |
| P2 | Bad bearer | garbage token | 401 `invalid_token` |
| P3 | Stage · new entity | `stage` with `subject:{etype:"org",name:"Acme Holdings [synthetic]"}` | 200, one entity `mode:"new"`, one staged claim, `receipt.ok true` |
| P4 | Stage · deterministic key attach | same source, `resolution_keys:["domain:acme.test"]` twice | second call `mode:"key"`, `entities_created 0` |
| P5 | Stage · exact name attach | `name:"acme holdings [synthetic]"` (case differs) | `mode:"exact"`, no new entity |
| P6 | Stage · trigram near match | `name:"Acme Holdings Inc [synthetic]"` | new entity `status candidate`, extra `same_as_candidate` claim with `grade inference` pointing at the matched id |
| P7 | Stage · below threshold | `name:"Zephyr Freight [synthetic]"` | `mode:"new"`, `status active`, no inference claim |
| P8 | Stage · source upsert | repeat stage, `wave:3` | same `source_id`, `last_wave` 3, `last_mined_at` bumped |
| P9 | Govern · confirm | `{"action":"govern","claim_id":<P3 claim>,"action":"confirm"}` | claim status `confirmed`, new `governs` claim `grade client-asserted` `status confirmed`, `supersedes null` |
| P10 | Govern · flag | `action:"flag"` | claim `flagged`, governing claim `supersedes = ruled claim id` |
| P11 | Govern · explain | `action:"explain","note":"wrong fiscal year"` | claim `flagged`, governing `value_text` = `explain: wrong fiscal year` |
| P12 | Append-only proof | `select count(*) from world_claims where id = <ruled id>` before/after, compare all columns except `status` | only `status` differs |
| P13 | Merge | `{"action":"merge","entity_id":A,"into_id":B}` | A `status merged`, `merged_into B`, confirmed `merged_into` claim, receipt ok |
| P14 | Merge hop on read | `profile` with `entity_id: A` | returns B, `followed_merge true` |
| P15 | Delta | `{"action":"delta"}` | only rows with the caller's cid |
| P16 | Sensitivity · privileged | stage a claim `sensitivity:"privileged"` then `delta` | claim absent from delta and from `profile` |
| P17 | Sensitivity · third-party-npi | same with `third-party-npi` | absent |
| P18 | Sensitivity · sensitive, owning principal | owner token | present |
| P19 | Sensitivity · sensitive, non-owning principal | fleet-only token (`tenant_role` null) | absent |
| P20 | **Negative cross-tenant read** | tenant X token, `profile` with an `entity_id` belonging to tenant Y | 404 `entity_not_found_in_tenant`, nothing leaked |
| P21 | **Negative cross-tenant govern** | tenant X token, `claim_id` of tenant Y | 404 `claim_not_found_in_tenant`, tenant Y claim status unchanged |
| P22 | **Negative cross-tenant merge** | tenant X token, entity ids from tenant Y | 404 `entity_not_found_in_tenant` |
| P23 | Body cid spoof | any action with `"cid":"CID-999999"` in the body | ignored; response `cid` is the derived cid |
| P24 | Receipts | after P3/P9/P13 | one `change_log` row each, `entity 'world'`, `actor` `cob` for stage and `client` for govern/merge, `tenant_id` = derived cid |
| P25 | Unknown action | `{"action":"nope"}` | 400 `unknown_action` |

All write probes run against synthetic test tenants; entity names carry the
`[synthetic]` marker so cleanup is deterministic.

## Cross-tenant verification SQL (service role)

```sql
-- P21: the other tenant's claim must be untouched
select id, cid, status from public.world_claims where id = '<tenant-Y-claim>';

-- P24: receipts present and correctly attributed
select tenant_id, entity, change, actor, at
from public.change_log
where entity = 'world'
order by at desc
limit 10;
```

## Helper objects

| Object | Type | Grants |
|--------|------|--------|
| `public.world_resolve_entity_v1(text, text, text, jsonb)` | SECURITY DEFINER, STABLE, `search_path = public, pg_temp` | EXECUTE revoked from PUBLIC, `anon`, `authenticated`, `sandbox_exec`; granted to `service_role` only |
| `pg_trgm` | extension | created if absent, schema `public` |

No table grants were added or changed. The four registers remain RLS-on with
zero policies, reachable only by the service role inside this function.
