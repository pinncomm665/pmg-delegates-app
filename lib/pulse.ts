// Delegate-registration pulse model. Pure logic (no server imports) so it can be
// shared by the server data layer and the client dashboard components.
//
// Unlike speakers (a flat ~25 target), delegate targets are carried per-summit
// (events.delegate_target). Standard target is 100/edition; this constant is the
// fallback when an edition hasn't set one yet.

export const DEFAULT_TARGET_DELEGATES = 100;

// Stages that count as a secured delegate (registered/paid/attending).
export const CONFIRMED_STAGES = ["registered", "confirmed", "attended"];

export interface SummitPulse {
  event_id: string;
  name: string;
  brand: string | null;
  date: string; // ISO
  daysLeft: number;
  confirmed: number;
  total: number;
  target: number; // per-event delegate target
  gap: number; // target - confirmed (delegates still needed to hit target)
  finalProgress: number; // confirmed / target  (0..1)
  progressPct: number; // confirmed / target * 100
  label: HealthLabel;
}

export type HealthLabel =
  | "Critical"
  | "Weak"
  | "Satisfactory"
  | "Good"
  | "On Target"
  | "Ahead";

export function healthLabel(pct: number): HealthLabel {
  if (pct < 50) return "Critical";
  if (pct < 75) return "Weak";
  if (pct < 90) return "Satisfactory";
  if (pct < 110) return "Good";
  if (pct < 130) return "On Target";
  return "Ahead";
}

// Muted, executive palette — color only where it carries meaning.
export function healthColors(label: HealthLabel): {
  bg: string;
  fg: string;
  bar: string;
} {
  switch (label) {
    case "Critical":
      return { bg: "#fbeaea", fg: "#9b2c2c", bar: "#d06363" };
    case "Weak":
      return { bg: "#fbf0dd", fg: "#8a5a12", bar: "#d99a3e" };
    case "Satisfactory":
      return { bg: "#fdf6dc", fg: "#7a5e10", bar: "#d3b347" };
    case "Good":
      return { bg: "#eaf3e3", fg: "#3f6d22", bar: "#82af5c" };
    case "On Target":
      return { bg: "#e1f3ed", fg: "#0f6e56", bar: "#3a9e80" };
    case "Ahead":
      return { bg: "#edecfb", fg: "#3c3489", bar: "#7a72d0" };
    default:
      return { bg: "#f1efe8", fg: "#5f5e5a", bar: "#b4b2a9" };
  }
}

export function buildSummit(input: {
  event_id: string;
  name: string;
  brand: string | null;
  date: string;
  daysLeft: number;
  confirmed: number;
  total: number;
  target: number;
}): SummitPulse {
  // Pure target model: progress and gap are measured against the edition's
  // delegate target only — no "expected by now" pacing.
  const target = input.target > 0 ? input.target : DEFAULT_TARGET_DELEGATES;
  const progressPct = (input.confirmed / target) * 100;
  return {
    ...input,
    target,
    gap: Math.max(0, target - input.confirmed),
    finalProgress: input.confirmed / target,
    progressPct,
    label: healthLabel(progressPct),
  };
}
