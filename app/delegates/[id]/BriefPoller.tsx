"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While a background-research job is pending/generating, poll its status every
// 10 s and refresh the page (server components re-render) once it changes.
export default function BriefPoller({ delegateId, status }: { delegateId: string; status: string | null }) {
  const router = useRouter();
  const active = status === "pending" || status === "generating";
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/delegates/brief-status?id=${encodeURIComponent(delegateId)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!stopped && d.status !== status) router.refresh();
      } catch {}
    };
    const t = setInterval(tick, 10_000);
    return () => { stopped = true; clearInterval(t); };
  }, [active, delegateId, status, router]);
  return null;
}
