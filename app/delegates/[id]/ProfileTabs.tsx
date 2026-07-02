"use client";

import { useState, type ReactNode } from "react";

type TabKey = "contact" | "history" | "registration";

export default function ProfileTabs({
  contact,
  history,
  registration,
}: {
  contact: ReactNode;
  history: ReactNode;
  registration: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("contact");
  const tabs: { k: TabKey; label: string }[] = [
    { k: "contact", label: "Contact Information" },
    { k: "history", label: "Contact History" },
    { k: "registration", label: "Participation" },
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--border)",
          padding: "0 8px",
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              style={{
                appearance: "none",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "12px 14px",
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text)" : "var(--muted)",
                borderBottom: active
                  ? "2px solid #0f6e56"
                  : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="section">
        {tab === "contact" && contact}
        {tab === "history" && history}
        {tab === "registration" && registration}
      </div>
    </>
  );
}
