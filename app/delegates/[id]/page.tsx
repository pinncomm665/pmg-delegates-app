import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, isAdmin, isReviewer } from "@/lib/session";
import { getDelegate, getEnrolments, getContactProfile, getContactSummary, stageBadgeClass, stageLabel, STAGES } from "@/lib/data";
import AISummary from "./AISummary";
import EmailHistory from "./EmailHistory";
import ProfileTabs from "./ProfileTabs";
import { companyDisplay } from "@/lib/company";
import RegistrationForm from "./RegistrationForm";
import InstantlyHistory from "./InstantlyHistory";
import Avatar from "../../Avatar";
import Shell from "../../Shell";
import Breadcrumb from "../../Breadcrumb";
import { updateStatus, flagRole } from "./actions";
import { emailStatusOf } from "@/lib/emailstatus";
import ContactDetails from "./ContactDetails";
import BriefView from "./BriefView";
import RemoveDelegateDialog from "./RemoveDelegateDialog";
import ActivityList from "../../ActivityList";
import { getContactActivity } from "@/lib/changes";
import { canEdit, NO_ACCESS_MSG } from "@/lib/policy";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
  // Independent reads → one round trip.
  const [enrolments, profile, activity, summary] = await Promise.all([
    c.id ? getEnrolments(c.id) : Promise.resolve([]),
    c.id ? getContactProfile(c.id, "delegate", d.event_id) : Promise.resolve(null),
    c.id ? getContactActivity(c.id) : Promise.resolve([]),
    c.id ? getContactSummary(c.id) : Promise.resolve(null),
  ]);
  const editable = canEdit(user, { eventId: d.event_id, edition: d.event_edition });
  const companyName = companyDisplay(c.company?.name ?? c.company_name_submitted) ?? null;
  const stageUpdated = fmtDate(d.stage_updated_at);

  return (
    <Shell user={user}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <Breadcrumb
            items={[
              { label: "Home", href: "/dashboard" },
              { label: "Delegates", href: "/delegates" },
              ...(d.event_edition
                ? [{ label: d.event_edition, href: `/delegates?edition=${encodeURIComponent(d.event_edition)}` }]
                : []),
              { label: c.full_name_clean ?? "Delegate" },
            ]}
          />
          <Link href={backHref} className="muted page-head-aside" style={{ fontSize: 13 }}>
            ← Back to delegates
          </Link>
        </div>

        {searchParams.flash && (
          <div
            className={`flash ${searchParams.flash === "ok" ? "flash-ok" : "flash-warn"}`}
            style={{ marginTop: 12 }}
          >
            {searchParams.msg}
          </div>
        )}
        {!editable && (
          <div className="flash flash-warn" style={{ marginTop: 12 }} role="status">
            Read-only: {NO_ACCESS_MSG}
          </div>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <div className="section sp-head">
            <div className="sp-head-id">
              <Avatar name={c.full_name_clean} photo={c.profile_image_url} seed={c.id} size={56} />
              <div>
              <h2 style={{ margin: 0, fontSize: "var(--fs-xl)" }}>{c.full_name_clean ?? "—"}</h2>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                {c.job_title ?? "—"} · {companyDisplay(c.company?.name ?? c.company_name_submitted) ?? "—"}
              </p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                {d.event_brand && <strong>{d.event_brand}</strong>}
                {d.event_brand && d.event_edition ? " › " : ""}
                {d.event_edition ?? ""}
              </p>
              </div>
            </div>
            <span className={stageBadgeClass(d.stage)}>{stageLabel(d.stage)}</span>
          </div>

          {c.id && <AISummary contactId={c.id} initial={summary} />}

          <ProfileTabs
            contact={
              <ContactDetails
                delegateId={d.id}
                isReviewer={isReviewer(user)}
                contact={{
                  id: c.id ?? null,
                  full_name_clean: c.full_name_clean ?? null,
                  first_name_clean: c.first_name_clean ?? null,
                  last_name_clean: c.last_name_clean ?? null,
                  job_title: c.job_title ?? null,
                  company_name: companyName,
                  email: c.email ?? null,
                  email_status: c.email ? emailStatusOf(c) : null,
                  email_source: c.email_source ?? null,
                  personal_email: c.personal_email ?? null,
                  office_phone: c.office_phone ?? null,
                  mobile: c.mobile ?? c.phone ?? null,
                  other_phone: c.other_phone ?? null,
                  linkedin_url_canonical: c.linkedin_url_canonical ?? null,
                }}
              >
                <details>
                  <summary>Left the company or changed role? Flag it</summary>
                  <form action={flagRole}>
                    <input type="hidden" name="delegateId" value={d.id} />
                    <input type="hidden" name="return" value={ret} />
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="flag-title">New job title</label>
                        <input id="flag-title" className="input" name="newTitle" placeholder="Optional" />
                      </div>
                      <div className="field">
                        <label htmlFor="flag-company">New company</label>
                        <input id="flag-company" className="input" name="newCompany" placeholder="Optional" />
                      </div>
                      <div className="span-2 form-actions">
                        <button className="btn btn-sm" type="submit">Submit for review</button>
                        <p className="help">Goes to the admin queue. The record is not changed until approved.</p>
                      </div>
                    </div>
                  </form>
                </details>
              </ContactDetails>
            }
            history={
              <div className="grid2">
                <div>
                  <p className="section-title" style={{ marginBottom: 12 }}>Email history</p>
                  <EmailHistory email={c.email ?? c.personal_email ?? null} />
                </div>
                <div>
                  <p className="section-title" style={{ marginBottom: 12 }}>Instantly history</p>
                  <InstantlyHistory
                    email={c.email ?? c.personal_email ?? null}
                    enrolments={enrolments}
                  />
                </div>
              </div>
            }
            registration={
              <div className="fieldset-stack">
                <form action={updateStatus} className="field" style={{ maxWidth: 460 }}>
                  <input type="hidden" name="delegateId" value={d.id} />
                  <input type="hidden" name="return" value={ret} />
                  <label htmlFor="stage-select">Stage</label>
                  <div className="stage-row">
                    <select
                      id="stage-select"
                      name="stage"
                      className="stage-select"
                      defaultValue={(d.stage ?? "identified").toLowerCase()}
                      aria-label={`Stage for ${c.full_name_clean ?? "delegate"}`}
                    >
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" type="submit">Save</button>
                  </div>
                  <p className="help">{stageUpdated ? `Last updated ${stageUpdated}.` : "Not updated yet."}</p>
                </form>

                <RegistrationForm d={d} ret={ret} />

                {isAdmin(user) && (
                  <RemoveDelegateDialog delegateId={d.id} ret={ret} name={c.full_name_clean ?? "this delegate"} />
                )}
              </div>
            }
            background={<BriefView profile={profile} delegateId={d.id} ret={ret} />}
            activity={
              <div style={{ maxWidth: 760 }}>
                <p className="section-title">Activity</p>
                <p className="section-sub" style={{ marginBottom: 12 }}>
                  Every change made to this contact through the team apps — who, when, what. Pending rows are waiting in the review queue.
                </p>
                <ActivityList rows={activity} />
              </div>
            }
          />
        </div>
    </Shell>
  );
}
