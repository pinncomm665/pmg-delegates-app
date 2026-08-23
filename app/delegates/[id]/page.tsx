import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDelegate, getEnrolments, getContactProfile, stageBadgeClass, stageLabel, STAGES } from "@/lib/data";
import EmailHistory from "./EmailHistory";
import ProfileTabs from "./ProfileTabs";
import { companyDisplay } from "@/lib/company";
import RegistrationForm from "./RegistrationForm";
import InstantlyHistory from "./InstantlyHistory";
import Avatar from "../../Avatar";
import Shell from "../../Shell";
import Breadcrumb from "../../Breadcrumb";
import { updateStatus } from "./actions";
import ContactDetails from "./ContactDetails";
import BriefView from "./BriefView";
import RemoveDelegateDialog from "./RemoveDelegateDialog";
import ActivityList from "../../ActivityList";
import { getContactActivity } from "@/lib/changes";
import { canEdit, NO_ACCESS_MSG } from "@/lib/policy";

export const dynamic = "force-dynamic";

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
  const [enrolments, profile, activity] = await Promise.all([
    c.id ? getEnrolments(c.id) : Promise.resolve([]),
    c.id ? getContactProfile(c.id, "delegate", d.event_id) : Promise.resolve(null),
    c.id ? getContactActivity(c.id) : Promise.resolve([]),
  ]);
  const editable = canEdit(user, { eventId: d.event_id, edition: d.event_edition });

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

          <ProfileTabs
            contact={
              <ContactDetails
                delegateId={d.id}
                ret={ret}
                editable={editable}
                companyName={companyDisplay(c.company?.name ?? c.company_name_submitted) ?? null}
                contact={{
                  full_name_clean: c.full_name_clean ?? null,
                  first_name_clean: c.first_name_clean ?? null,
                  last_name_clean: c.last_name_clean ?? null,
                  job_title: c.job_title ?? null,
                  email: c.email ?? null,
                  personal_email: c.personal_email ?? null,
                  phone: c.phone ?? null,
                  mobile: c.mobile ?? null,
                  office_phone: c.office_phone ?? null,
                  other_phone: c.other_phone ?? null,
                  linkedin_url_canonical: c.linkedin_url_canonical ?? null,
                  email_mv_result: c.email_mv_result ?? null,
                  email_verified_status: c.email_verified_status ?? null,
                  scrubby_result: c.scrubby_result ?? null,
                }}
              />
            }
            history={
              <div className="grid2">
                <div>
                  <h3 className="section-title" style={{ marginBottom: 12 }}>Email history</h3>
                  <EmailHistory email={c.email ?? c.personal_email ?? null} />
                </div>
                <div>
                  <h3 className="section-title" style={{ marginBottom: 12 }}>Instantly history</h3>
                  <InstantlyHistory
                    email={c.email ?? c.personal_email ?? null}
                    enrolments={enrolments}
                  />
                </div>
              </div>
            }
            registration={
              <div className="form-stack">
                <section className="fieldset" role="group" aria-labelledby="fs-stage">
                  <h3 className="section-title" id="fs-stage">Stage</h3>
                  <form action={updateStatus} className="stage-row">
                    <input type="hidden" name="delegateId" value={d.id} />
                    <input type="hidden" name="return" value={ret} />
                    <label htmlFor="stage-select" className="cd-label">Stage</label>
                    <select id="stage-select" name="stage" className="stage-select" defaultValue={(d.stage ?? "identified").toLowerCase()} disabled={!editable}>
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" type="submit" disabled={!editable}>Save</button>
                  </form>
                  <p className="help">
                    {d.stage_updated_at
                      ? `Last updated ${new Date(d.stage_updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}.`
                      : "Not updated yet."}{" "}
                    Moving out of a secured stage (registered / confirmed / attended) goes to review.
                  </p>
                </section>

                <RegistrationForm d={d} ret={ret} />

                {user.role === "admin" && (
                  <RemoveDelegateDialog delegateId={d.id} ret={ret} name={c.full_name_clean ?? "this delegate"} />
                )}
              </div>
            }
            background={<BriefView profile={profile} delegateId={d.id} ret={ret} />}
            activity={
              <div>
                <div className="section-head">
                  <div>
                    <h3 className="section-title">Activity</h3>
                    <p className="section-sub">Every change made to this contact through the team apps — who, when, what. Newest first.</p>
                  </div>
                </div>
                <ActivityList rows={activity} />
              </div>
            }
          />
        </div>
    </Shell>
  );
}
