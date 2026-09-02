// Inline LinkedIn "in" glyph — read-only rows show ONLY this icon (accent
// colour, opens the profile in a new tab); the full URL appears in edit mode.
// One shared copy per app; do not inline it in components again.
export default function LinkedInIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ verticalAlign: "-4px" }}>
      <rect width="24" height="24" rx="4" fill="var(--accent)" />
      <path
        fill="#fff"
        d="M6.94 8.7H4.34V19h2.6V8.7ZM5.64 7.58a1.51 1.51 0 1 0 0-3.02 1.51 1.51 0 0 0 0 3.02ZM12 13.27c0-1.18.54-1.88 1.58-1.88.96 0 1.42.68 1.42 1.88V19h2.59v-6.64c0-2.25-1.28-3.34-3.06-3.34-1.43 0-2.06.8-2.42 1.36h-.11V8.7H9.41V19H12v-5.73Z"
      />
    </svg>
  );
}
