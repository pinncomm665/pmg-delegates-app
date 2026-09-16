import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Where middleware sends every page request from a parked account
// (app_metadata.maintenance). Deliberately standalone: no shell, no nav, no
// data fetch — the notice and nothing else.
export default function MaintenancePage() {
  let email = "";
  const fwd = headers().get("x-pmg-user");
  if (fwd) {
    try {
      email = JSON.parse(decodeURIComponent(fwd)).email ?? "";
    } catch {}
  }
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 12px" }}>PMG Delegates</p>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 10px" }}>
          Site under maintenance
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.75, margin: "0 0 20px" }}>
          We are making improvements to your workspace. Check back later.
        </p>
        {email ? (
          <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>Signed in as {email}</p>
        ) : null}
      </div>
    </main>
  );
}
