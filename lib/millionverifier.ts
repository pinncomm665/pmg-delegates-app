// MillionVerifier single-email check. Mirrors the Agent's MV usage.
// Docs: https://developer.millionverifier.com/  result in {ok, catch_all, unknown, disposable, invalid, error}
export type MvResult = {
  result: string;
  valid: boolean; // treat only 'ok' as a clean auto-overwrite
};

export async function verifyEmail(email: string): Promise<MvResult> {
  const key = process.env.MILLIONVERIFIER_API_KEY;
  if (!key) return { result: "no_api_key", valid: false };
  try {
    const url = `https://api.millionverifier.com/api/v3/?api=${key}&email=${encodeURIComponent(
      email
    )}&timeout=20`;
    const r = await fetch(url, { cache: "no-store" });
    const j: any = await r.json();
    const result = String(j?.result ?? "unknown");
    return { result, valid: result === "ok" };
  } catch {
    return { result: "error", valid: false };
  }
}
