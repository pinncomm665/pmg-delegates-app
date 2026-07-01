import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDelegate, getEnrolments, stageBadgeClass, stageLabel, STAGES } from "@/lib/data";
import { emailStatusOf, emailStatusColors } from "@/lib/emailstatus";
import EmailHistory from "./EmailHistory";
import ProfileTabs from "./ProfileTabs";
import { companyDisplay } from "@/lib/company";
import RegistrationForm from "./RegistrationForm";
import InstantlyHistory from "./InstantlyHistory";
import Shell from "../../Shell";
import {
  updateStatus,
  submitEmail,
  addOtherPhone,
  flagRole,
  removeDelegate,
} from "./actions";
import UpdateCompany from "./UpdateCompany";

export const dynamic = "force-dynamic";

function ReadOnly({ label, value, href }: { label: string; value?: string | null; href?: boolean }) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <span>
        {value ? (
          href ? (
            <a href={value} target="_blank" rel="noreferrer">link</a>
          ) : (
            value
          )
        ) : (
          <span className="muted">—</span>
        )}{" "}
        <span className="lock" title="read only">🔒</span>
      </span>
    </div>
  );
}

export default async function DelegateDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { flash?: string; msg?: string; return?: string };
}) {
  const user = await requireUser();
  const d = await getDelegate(params.id);
  if (!d) notFound();
  const c = d.contact ?? {};
  const ret = searchParams.return ?? "";
  const backHref = ret ? `/delegates?${ret}` : "/delegates";
  const es = emailStatusOf(c);
  const esc = es ? emailStatusColors(es) : null;
  const enrolments = c.id ? await getEnrolments(c.id) : [];

  return (
    <Shell user={user}>
        <Link href={backHref} className="muted" style={{ fontSize: 13 }}>
          ← Back to delegates
        </Link>

        {searchParams.flash && (
          <div
            className={`flash ${searchParams.flash === "ok" ? "flash-ok" : "flash-warn"}`}
            style={{ marginTop: 12 }}
          >
            {searchParams.msg}
          </div>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <div className="section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>{c.full_name_clean ?? "—"}</h2>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                {c.job_title ?? "—"} · {companyDisplay(c.company?.name ?? c.company_name_submitted) ?? "—"}
              </p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                {d.event_brand && <strong>{d.event_brand}</strong>}
                {d.event_brand && d.event_edition ? " › " : ""}
                {d.event_edition ?? ""}
              </p>
            </div>
            <span className={stageBadgeClass(d.stage)}>{stageLabel(d.stage)}</span>
          </div>

          <ProfileTabs
            contact={
              <div className="grid2">
                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Contact details · read only
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="field">
                      <span className="lbl">Work email</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {c.email ? c.email : <span className="muted">—</span>}
                        {es && esc && (
                          <span
                            style={{
                              background: esc.bg,
                              color: esc.fg,
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "1px 8px",
                              borderRadius: 999,
                            }}
                          >
                            {es}
                          </span>
                        )}
                        <span className="lock" title="read only">🔒</span>
                      </span>
                    </div>
                    <ReadOnly label="Personal email" value={c.personal_email} />
                    <ReadOnly label="Phone" value={c.office_phone} />
                    <ReadOnly label="Mobile" value={c.mobile ?? c.phone} />
                    <ReadOnly label="Other phone" value={c.other_phone} />
                    <ReadOnly label="LinkedIn" value={c.linkedin_url_canonical} href />
                  </div>
                </div>

                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Update
                  </p>

                  <div style={{ marginBottom: 18 }}>
                    <label>Company</label>
                    <UpdateCompany
                      delegateId={d.id}
                      current={companyDisplay(c.company?.name ?? c.company_name_submitted)}
                    />
                  </div>

                  <form action={submitEmail} style={{ marginBottom: 18 }}>
                    <input type="hidden" name="delegateId" value={d.id} />
                    <input type="hidden" name="return" value={ret} />
                    <label>Found a new email?</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input name="newEmail" type="email" placeholder="name@company.com" />
                      <button className="btn" type="submit">Verify</button>
                    </div>
                    <p className="muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
                      Valid → updates instantly. Invalid → queued for review.
                    </p>
                  </form>

                  <form action={addOtherPhone} style={{ marginBottom: 18 }}>
                    <input type="hidden" name="delegateId" value={d.id} />
                    <input type="hidden" name="return" value={ret} />
                    <label>Add another phone</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input name="newPhone" placeholder="+…" />
                      <button className="btn" type="submit">Add</button>
                    </div>
                    <p className="muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
                      Saved to “Other phone”. Original numbers never overwritten.
                    </p>
                  </form>

                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 14 }}>
                      Flag: left company / changed role
                    </summary>
                    <form action={flagRole} style={{ marginTop: 10 }}>
                      <input type="hidden" name="delegateId" value={d.id} />
                      <input type="hidden" name="return" value={ret} />
                      <label>New job title</label>
                      <input name="newTitle" placeholder="New title (optional)" />
                      <div style={{ height: 8 }} />
                      <label>New company</label>
                      <input name="newCompany" placeholder="New company (optional)" />
                      <div style={{ height: 10 }} />
                      <button className="btn" type="submit">Submit for review</button>
                      <p className="muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
                        Goes to the admin queue. Record is not changed until approved.
                      </p>
                    </form>
                  </details>
                </div>
              </div>
            }
            history={
              <div className="grid2">
                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Email history
                  </p>
                  <EmailHistory email={c.email ?? c.personal_email ?? null} />
                </div>
                <div>
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Instantly history
                  </p>
                  <InstantlyHistory
                    email={c.email ?? c.personal_email ?? null}
                    enrolments={enrolments}
                  />
                </div>
              </div>
            }
            registration={
              <div>
                <form action={updateStatus} style={{ marginBottom: 18, maxWidth: 460 }}>
                  <input type="hidden" name="delegateId" value={d.id} />
                  <input type="hidden" name="return" value={ret} />
                  <label>Status</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select name="stage" defaultValue={(d.stage ?? "identified").toLowerCase()}>
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" type="submit">Save</button>
                  </div>
                </form>

                <div style={{ borderTop: "1px solid var(--border)", margin: "20px 0 0", paddingTop: 8 }}>
                  <RegistrationForm d={d} ret={ret} />
                </div>

                {user.role === "admin" && (
                  <details style={{ marginTop: 24 }}>
                    <summary style={{ cursor: "pointer", fontSize: 14, color: "#c0392b" }}>
                      Remove from delegates (no longer attending)
                    </summary>
                    <form action={removeDelegate} style={{ marginTop: 10 }}>
                      <input type="hidden" name="delegateId" value={d.id} />
                      <input type="hidden" name="return" value={ret} />
                      <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
                        Permanently removes this delegate role row — use when the person should no
                        longer be tracked for this event. Secured delegates
                        (registered / confirmed / attended) can’t be removed.
                      </p>
                      <button
                        className="btn"
                        type="submit"
                        style={{ color: "#c0392b", borderColor: "#e0b4b4" }}
                      >
                        Confirm remove
                      </button>
                    </form>
                  </details>
                )}
              </div>
            }
          />
        </div>
    </Shell>
  );
}
