"use client";

import { useDialer } from "./DialerProvider";

// Click-to-dial via the shared JustCall dialer (same mechanism as pmg-sales-app).
// Renders nothing without a phone. Icon-only `.btn-ghost .btn-sm`, sits beside
// the number in detail rows and list phone cells.
export default function CallButton({
  phone,
  name,
  className,
}: {
  phone?: string | null;
  name?: string | null;
  className?: string;
}) {
  const { call } = useDialer();
  if (!phone) return null;
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm call-btn${className ? ` ${className}` : ""}`}
      onClick={(e) => { e.stopPropagation(); call(phone, name); }}
      title={`Call ${phone} via JustCall`}
      aria-label={`Call ${phone} via JustCall`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
      </svg>
    </button>
  );
}
