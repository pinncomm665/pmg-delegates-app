import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Shell from "../../Shell";
import { approveRequest, rejectRequest, removeDelegateFromQueue } from "./actions";

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

  return (
    <Shell user={admin}>
        <h2 style={{ margin: "0 0 4px" }}>Review queue</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Change requests submitted by the team. Approve to apply.
        </p>

        <div className="card">
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
