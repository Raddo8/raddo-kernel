// supabase/functions/world-graph/heat.ts
//
// HEAT · how much attention something deserves. Read-only, cid-scoped.
//
// Heat is attention, never loss. The surface paints it on a brass scale; red is
// reserved for a real clock. Every score carries the plain-language reason the
// database wrote for it.

type Admin = any;

export interface HeatRow {
  name: string;
  etype: string;
  claims: number;
  degree: number;
  folders: number;
  last_touch: string | null;
  heat: number;
  why: string | null;
}

export interface LaneHeatRow {
  lane: string;
  entries: number;
  subjects: number;
  open_items: number;
  last_touch: string | null;
  heat: number;
  why: string | null;
}

export interface HubRow {
  name: string;
  etype: string;
  folders: number;
  folder_list: string | null;
  degree: number;
  is_hub: boolean;
}

/** Everything the surfaces need to paint heat, in one read. */
export async function actionHeat(admin: Admin, cid: string) {
  const [ent, lane, hubs] = await Promise.all([
    admin.rpc("world_entity_heat_v2", { _cid: cid }),
    admin.rpc("world_lane_heat_v1", { _cid: cid }),
    admin.rpc("world_hubs_v1", { _cid: cid }),
  ]);

  // Heat is a convenience, never a dependency: a missing score is simply absent.
  return {
    ok: true,
    action: "heat",
    cid,
    subjects: (ent.data ?? []) as HeatRow[],
    lanes: (lane.data ?? []) as LaneHeatRow[],
    hubs: ((hubs.data ?? []) as HubRow[]).filter((h) => h.is_hub),
  };
}

/** Heat by subject name, for modules that already hold entity rows. */
export async function heatByName(admin: Admin, cid: string): Promise<Map<string, HeatRow>> {
  const { data } = await admin.rpc("world_entity_heat_v2", { _cid: cid });
  const map = new Map<string, HeatRow>();
  for (const r of (data ?? []) as HeatRow[]) map.set(String(r.name ?? "").toLowerCase(), r);
  return map;
}

/** Subjects that show up in three or more folders, by name. */
export async function hubsByName(admin: Admin, cid: string): Promise<Map<string, HubRow>> {
  const { data } = await admin.rpc("world_hubs_v1", { _cid: cid });
  const map = new Map<string, HubRow>();
  for (const r of (data ?? []) as HubRow[]) {
    if (r.is_hub) map.set(String(r.name ?? "").toLowerCase(), r);
  }
  return map;
}
