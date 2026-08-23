import Link from "next/link";
import { getUser } from "@/lib/session";
import Shell from "./Shell";

export const dynamic = "force-dynamic";

function Card() {
  return (
    <div className="card section" style={{ maxWidth: 460 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: "var(--fs-lg)" }}>We couldn’t find that record</h2>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
        It may have been removed, merged into another contact, or the link is out of date.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/delegates" className="btn btn-primary">Back to delegates</Link>
        <Link href="/dashboard" className="btn">Home</Link>
      </div>
    </div>
  );
}

// Rendered inside the Shell when we know who the user is (keeps nav + rail);
// bare page-bg card otherwise.
export default async function NotFound() {
  const user = await getUser();
  if (user) {
    return (
      <Shell user={user}>
        <Card />
      </Shell>
    );
  }
  return (
    <div className="shell" style={{ alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card />
    </div>
  );
}
