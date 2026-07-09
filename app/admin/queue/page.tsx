import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Shell from "../../Shell";
import { approveRequest, rejectRequest, removeDelegateFromQueue, approveIntake, mergeIntake, rejectIntake } from "./actions";
import { fetchPendingIntake } from "./intake";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const admin = await requireAdmin();
  const sb = supabaseAdmin();
  const { data: pending } = await sb
    .from("contact_change_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = pending ?? [];
  const intake = await fetchPendingIntake();

  return (
    <Shell user={admin}>
        <h2 style={{ margin: "0 0 4px" }}>New contacts · intake</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          New contacts submitted via Add Contact. Approve to insert as a new
          contact, Merge into an existing one, or Reject.
        </p>
        <div className="card" style={{ overflowX: "auto", marginBottom: 28 }}>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Brand / Role</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {intake.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.hydrated?.full_name_clean ?? "—"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {[r.hydrated?.job_title, r.hydrated?.company_name].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {r.linkedin_url && (
                      <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>
                        LinkedIn ↗
                      </a>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.event_brand ?? "—"}
                    <br />
                    {r.participant_type ?? "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.submitted_by_email ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <form action={approveIntake}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn btn-primary" type="submit" style={{ padding: "6px 10px" }}>
                            Approve (new)
                          </button>
                        </form>
                        <form action={rejectIntake}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn" type="submit" style={{ padding: "6px 10px" }}>
                            Reject
                          </button>
                        </form>
                      </div>
                      {(r.duplicate_candidates ?? []).map((d) => (
                        <form action={mergeIntake} key={d.contact_id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="merge_into" value={d.contact_id} />
                          <button className="btn" type="submit" style={{ padding: "6px 10px", borderColor: "#d9b95a" }}>
                            Merge → {d.full_name ?? d.contact_id.slice(0, 8)}
                          </button>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {d.job_title ?? ""} {d.confidence ? `(${d.confidence})` : ""}
                          </span>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {intake.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No new contacts waiting.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 style={{ margin: "0 0 4px" }}>Change requests</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Field edits submitted by the team. Approve to apply.
        </p>

        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Current</th>
                <th>Proposed</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge badge-info">{r.kind}</span>
                  </td>
                  <td className="muted">{r.current_value ?? "—"}</td>
                  <td>
                    {r.proposed_value ?? "—"}
                    {r.proposed_company ? ` @ ${r.proposed_company}` : ""}
                    {r.mv_result ? (
                      <span className="muted"> ({r.mv_result})</span>
                    ) : null}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.submitted_by_email ?? "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <form action={approveRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-primary" type="submit" style={{ padding: "6px 10px" }}>
                          Approve
                        </button>
                      </form>
                      <form action={rejectRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn" type="submit" style={{ padding: "6px 10px" }}>
                          Reject
                        </button>
                      </form>
                      {r.delegate_id && (
                        <form action={removeDelegateFromQueue}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            className="btn"
                            type="submit"
                            style={{ padding: "6px 10px", color: "#c0392b", borderColor: "#e0b4b4" }}
                          >
                            Remove delegate
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    Nothing waiting for review.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    </Shell>
  );
}
