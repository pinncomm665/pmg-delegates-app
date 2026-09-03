// Per-summit stage funnel for the Pulse dashboard — where everyone on an
// upcoming edition currently sits, one bar per stage, each bar a link to that
// stage's tab on the list. Counts are the CURRENT distribution (the same
// numbers as the list's stage tabs), not cumulative "reached" counts, so a
// click always lands on exactly the people it counted.
import { readEditionCounts } from "./data";
import { STAGES } from "./data";

export type FunnelRow = { stage: string; label: string; count: number };
export type EventFunnel = { event_id: string; total: number; rows: FunnelRow[] };

// Terminal exits sit off the funnel — a "Declined" bar reads as a stage to
// work, which it is not; they appear as a footnote instead.
const EXIT_STAGES = new Set(["declined", "cancelled", "no_show", "rejected", "no_response", "superseded"]);

export async function getFunnels(eventIds: string[]): Promise<Map<string, EventFunnel>> {
  const out = new Map<string, EventFunnel>();
  if (eventIds.length === 0) return out;
  const wanted = new Set(eventIds);
  const perEvent = new Map<string, Map<string, number>>();

  const counts = await readEditionCounts();
  if (counts) {
    for (const r of counts) {
      if (!r.event_id || !wanted.has(r.event_id)) continue;
      const m = perEvent.get(r.event_id) ?? new Map<string, number>();
      const st = (r.stage ?? "identified").toLowerCase();
      m.set(st, (m.get(st) ?? 0) + r.n);
      perEvent.set(r.event_id, m);
    }
  }
  for (const id of eventIds) {
    const m = perEvent.get(id) ?? new Map<string, number>();
    const rows: FunnelRow[] = STAGES.filter((s) => !EXIT_STAGES.has(s.value)).map((s) => ({ stage: s.value, label: s.label, count: m.get(s.value) ?? 0 }));
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0);
    out.set(id, { event_id: id, total, rows });
  }
  return out;
}
