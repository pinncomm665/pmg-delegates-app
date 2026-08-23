"use client";

import { useFormStatus } from "react-dom";

// Disables itself while the server action is in flight (prevents double
// submits and shows progress).
export default function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" style={{ width: "100%" }} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
