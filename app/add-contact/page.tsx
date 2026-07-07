import { requireUser } from "@/lib/session";
import Shell from "../Shell";
import AddContactForm from "./AddContactForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AddContactPage() {
  const user = await requireUser();

  return (
    <Shell user={user}>
      <h2 style={{ margin: "0 0 4px" }}>
        <Link href="/dashboard" style={{ color: "var(--accent, #0f6e56)" }}>Home</Link>
        <span style={{ color: "var(--muted)", margin: "0 8px" }}>›</span>
        Add Delegate
      </h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20, fontSize: 13 }}>
        Paste a LinkedIn URL to add a new delegate. No free-text fields — the CRM
        will be hydrated automatically from LinkedIn.
      </p>

      <AddContactForm />
    </Shell>
  );
}
