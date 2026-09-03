import Link from "next/link";
import { requireUser, isReviewer, isAdmin } from "@/lib/session";
import { supabaseAdmin } from "@pmg/team-ui/lib/supabaseAdmin";
import { normalizeBrand } from "@/lib/brands";
import { kindLabel, timeAgo, hoursSince, type ChangeRow } from "@/lib/changes";
import Shell from "../../Shell";
import Breadcrumb from "@pmg/team-ui/ui/Breadcrumb";
import { approveRequest, rejectRequest, removeDelegateFromQueue, approveIntake, mergeIntake, rejectIntake } from "./actions";
import { fetchPendingIntake } from "./intake";

export const dynamic = "force-dynamic";

const WAITING_HOURS = 48;

// LinkedIn URL → "in/slug" for rows the agent couldn't hydrate a name for.
function linkedinSlug(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const m = u.pathname.match(/\/(in|company|pub)\/([^/?#]+)/i);
    return m ? `${m[1].toLowerCase()}/${decodeURIComponent(m[2])}` : u.hostname + u.pathname;
  } catch {
    return url;
  }
}

function Waiting({ createdAt }: { createdAt: string | null | undefined }) {
  if (hoursSince(createdAt) < WAITING_HOURS) return null;
  return <span className="badge badge-danger" title="Waiting more than 48 hours">Waiting &gt; 48h</span>;
}

function When({ iso }: { iso: string | null | undefined }) {
  return (
    <time dateTime={iso ?? undefined} title={iso ? new Date(iso).toLocaleString() : undefined} className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
      {timeAgo(iso)}
    </time>
  );
}

// Compact JSON before/after (registration rows) → "k: v" list.
function fmtValue(v: string | null): string {
  if (v == null || v === "") return "—";
  if (v.startsWith("{")) {
    try {
      const o = JSON.parse(v) as Record<string, unknown>;
      return Object.entries(o).map(([k, x]) => `${k}: ${x === null || x === "" ? "—" : String(x)}`).join(" · ") || "—";
    } catch { return v; }
  }
  return v;
}

export default async function QueuePage({ searchParams }: { searchParams: { flash?: string; msg?: string } }) {
  // Unauthenticated → redirect (requireUser); authenticated non-reviewer → a 403
  // card instead of a silent bounce, so the team sees WHY nothing loaded.
  const admin = await requireUser();
  if (!isReviewer(admin)) {
    return (
      <Shell user={admin}>
        <Breadcrumb items={[{ label: "Home", href: "/dashboard" }, { label: "Review queue" }]} />
        <div className="card section" role="alert" style={{ maxWidth: 460, marginTop: 14 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "var(--fs-lg)" }}>You don’t have access to the review queue</h2>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
            The review queue is for admins and reviewers. Ask Syed if you need approvals rights.
          </p>
          <Link href="/delegates" className="btn">Back to delegates</Link>
        </div>
      </Shell>
    );
  }
  const sb = supabaseAdmin();
  const [{ data: pending }, intake] = await Promise.all([
    sb
      .from("contact_change_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200),
    fetchPendingIntake(),
  ]);

  const rows = (pending ?? []) as ChangeRow[];
  const canDelete = isAdmin(admin);

  return (
    <Shell user={admin}>
        <div className="page-head">
          <Breadcrumb items={[{ label: "Home", href: "/dashboard" }, { label: "Review queue" }]} />
          <span className="muted page-head-aside" style={{ fontSize: 13 }}>
            {intake.length + rows.length} waiting
          </span>
        </div>

        {searchParams.flash && (
          <div className={`flash ${searchParams.flash === "ok" ? "flash-ok" : "flash-warn"}`} role="status">
            {searchParams.msg}
          </div>
        )}

        <h2 style={{ margin: "14px 0 4px", fontSize: "var(--fs-lg)" }}>
          New contacts · intake <span className="stage-tab-count" style={{ fontSize: 13, verticalAlign: "middle" }}>{intake.length}</span>
        </h2>
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
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {intake.map((r) => {
                const name = r.hydrated?.full_name_clean;
                const slug = linkedinSlug(r.linkedin_url);
                const dups = r.duplicate_candidates ?? [];
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {name ?? (slug ? <span title="Name not hydrated yet — LinkedIn slug shown">{slug}</span> : "—")}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[r.hydrated?.job_title, r.hydrated?.company_name].filter(Boolean).join(" · ") || (name ? "—" : "no title yet")}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 2, color: r.hydrated?.email ? "var(--accent)" : "var(--muted)" }}>
                        {r.hydrated?.email ? `✉ ${r.hydrated.email}` : "✉ no email found"}
                      </div>
                      {r.linkedin_url && (
                        <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>
                          LinkedIn ↗
                        </a>
                      )}
                      {r.submitter_note && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>“{r.submitter_note}”</div>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {normalizeBrand(r.event_brand) ?? "—"}
                      <br />
                      {r.participant_type ?? "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div><When iso={r.created_at} /></div>
                      <div className="muted" style={{ overflowWrap: "anywhere" }}>{r.submitted_by_email ?? "—"}</div>
                      <div style={{ marginTop: 4 }}><Waiting createdAt={r.created_at} /></div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <form action={approveIntake}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="btn btn-primary btn-sm" type="submit">
                              Approve (new)
                            </button>
                          </form>
                          <form action={rejectIntake}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="btn btn-sm" type="submit">
                              Reject
                            </button>
                          </form>
                        </div>
                        {dups.length > 0 && (
                          <details className="merge-menu">
                            <summary className="btn btn-sm" style={{ borderColor: "#d9b95a", display: "inline-block" }}>
                              Merge into existing ({dups.length})
                            </summary>
                            <div className="merge-list">
                              {dups.map((d) => (
                                <form action={mergeIntake} key={d.contact_id} className="merge-row">
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="merge_into" value={d.contact_id} />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{d.full_name ?? d.contact_id.slice(0, 8)}</div>
                                    <div className="muted" style={{ fontSize: 11 }}>
                                      {[d.job_title, d.reason].filter(Boolean).join(" · ")}{d.confidence ? ` (${d.confidence})` : ""}
                                    </div>
                                  </div>
                                  <button className="btn btn-sm" type="submit">Merge →</button>
                                </form>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

        <h2 style={{ margin: "0 0 4px", fontSize: "var(--fs-lg)" }}>
          Change requests <span className="stage-tab-count" style={{ fontSize: 13, verticalAlign: "middle" }}>{rows.length}</span>
        </h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Field edits submitted by the team (and anything held by the rate guard). Approve to apply.
        </p>

        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Change</th>
                <th>Current → Proposed</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ minWidth: 140 }}>
                    <span className="badge badge-info">{kindLabel(r.kind)}</span>
                    {r.field && r.kind !== "stage" && r.kind !== "stage_revert" ? (
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{r.field}</div>
                    ) : null}
                    {r.delegate_id ? (
                      <div style={{ fontSize: 12, marginTop: 3 }}>
                        <Link href={`/delegates/${r.delegate_id}?tab=activity`}>{r.event_edition ?? "open delegate"} ›</Link>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="diff">
                      <span className="diff-old">{fmtValue(r.current_value)}</span>
                      <span className="diff-arrow" aria-hidden="true">→</span>
                      <span className="diff-new">
                        {r.kind === "company" && r.proposed_company ? r.proposed_company : fmtValue(r.proposed_value)}
                        {r.proposed_company && r.kind !== "company" ? ` @ ${r.proposed_company}` : ""}
                      </span>
                    </div>
                    {r.mv_result ? <div className="muted" style={{ fontSize: 11 }}>MillionVerifier: {r.mv_result}</div> : null}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div><When iso={r.created_at} /></div>
                    <div className="muted" style={{ overflowWrap: "anywhere" }}>{r.submitted_by_email ?? "—"}</div>
                    <div style={{ marginTop: 4 }}><Waiting createdAt={r.created_at} /></div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <form action={approveRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-primary btn-sm" type="submit">
                          Approve
                        </button>
                      </form>
                      <form action={rejectRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-sm" type="submit">
                          Reject
                        </button>
                      </form>
                      {canDelete && r.delegate_id && r.kind === "role" && (
                        <form action={removeDelegateFromQueue}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn btn-danger btn-sm" type="submit">
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
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
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
