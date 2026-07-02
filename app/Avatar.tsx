"use client";

/**
 * Shared contact avatar — the ONE place photo / initials / silhouette logic lives.
 *
 *   photo present      → circular <=64px image (objectFit: cover)
 *   photo null / fails → initials monogram (first+last initial), on a colour picked
 *                        DETERMINISTICALLY from the seed (contact id) so the same
 *                        person always gets the same colour and the roster is stable.
 *   no name at all     → generic person silhouette.
 *
 * onError degrades a broken/expired image URL to the monogram — never a broken glyph.
 * Photos are an INTERNAL recognition aid (80x80 source); we never render >80px.
 */

import { useState } from "react";

// Muted, PMG-ish palette — readable white text on each.
const PALETTE = [
  "#b5462f", "#0f6e56", "#2f6db5", "#8a5a2b", "#6b4c9a",
  "#2b7a78", "#a03e6f", "#4a6b2f", "#b5872f", "#3f5b8a",
];

function initials(name?: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0][0] ?? "").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

// Stable hash → palette index. Same seed → same colour on every render.
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Avatar({
  name,
  photo,
  seed,
  size = 32,
}: {
  name?: string | null;
  photo?: string | null;
  seed?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const px = Math.min(size, 80); // never render larger than the 80x80 source
  const ini = initials(name);
  const bg = colorFor(seed || name || "?");
  const showPhoto = !!photo && !failed;

  const base: React.CSSProperties = {
    width: px,
    height: px,
    borderRadius: "50%",
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: showPhoto ? "#e9e6df" : bg,
    color: "#fff",
    fontWeight: 600,
    fontSize: Math.round(px * 0.4),
    lineHeight: 1,
    userSelect: "none",
  };

  return (
    <span style={base} aria-hidden={!name} title={name ?? undefined}>
      {showPhoto ? (
        <img
          src={photo as string}
          alt=""
          width={px}
          height={px}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: px, height: px, objectFit: "cover", display: "block" }}
        />
      ) : ini ? (
        ini
      ) : (
        <svg width={Math.round(px * 0.62)} height={Math.round(px * 0.62)} viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
      )}
    </span>
  );
}
