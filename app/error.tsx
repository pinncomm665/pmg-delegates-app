"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-segment error boundary. Client component by contract; it can't read the
// session, so it renders the Shell look (page bg + card) without the nav rail.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="shell" style={{ alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card section" role="alert" style={{ maxWidth: 460, width: "100%" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "var(--fs-lg)" }}>Something went wrong</h2>
        <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
          The page hit an error while loading. You can retry, or head back home.
          {error.digest ? <span> Ref: <code>{error.digest}</code></span> : null}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={() => reset()}>Retry</button>
          <Link href="/dashboard" className="btn">Home</Link>
        </div>
      </div>
    </div>
  );
}
