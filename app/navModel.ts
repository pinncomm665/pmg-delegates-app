import type { NavItem } from "./NavLinks";

// Client-safe nav model (no server imports) shared by Sidebar (server) and
// MobileNav (client). Shell.tsx resolves the groups once and hands them to both
// so the two surfaces can never drift. Same three-section shape as the
// roundtables and speakers apps — Lists / Actions / Reports.
//
//   Lists    → All delegates
//   Actions  → Add Contact · My changes · Review queue (reviewer)
//   Reports  → Activity Report · Pulse dashboard
//
// The Pulse dashboard is also reached by clicking the app name.
export type NavGroups = {
  lists: NavItem[];
  actions: NavItem[];
  reports: NavItem[];
};

export const NAV_SECTIONS: { key: keyof NavGroups; label: string }[] = [
  { key: "lists", label: "Lists" },
  { key: "actions", label: "Actions" },
  { key: "reports", label: "Reports" },
];
