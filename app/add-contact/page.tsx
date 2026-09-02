import { requireUser } from "@/lib/session";
import Shell from "../Shell";
import Breadcrumb from "../Breadcrumb";
import AddContactForm from "./AddContactForm";

export const dynamic = "force-dynamic";

export default async function AddContactPage() {
  const user = await requireUser();

  return (
    <Shell user={user}>
      <div style={{ maxWidth: 560 }}>
        <Breadcrumb items={[{ label: "Home", href: "/dashboard" }, { label: "Add Contact" }]} />
        <p className="muted" style={{ marginTop: 4, marginBottom: 20, fontSize: 13 }}>
          Paste a LinkedIn profile URL to add someone to the CRM. The server
          enriches the contact automatically — no manual name or title entry
          needed.
        </p>
        <AddContactForm />
      </div>
    </Shell>
  );
}
