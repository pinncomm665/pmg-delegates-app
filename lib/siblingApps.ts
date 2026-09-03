// Where the sibling team apps live — a role change can move a person out of
// this app entirely (a speaker becoming a delegate now lives in the delegates
// app), so the chip needs somewhere to send the user. Overridable per
// environment; the defaults are production.
export const DELEGATES_APP_URL = process.env.NEXT_PUBLIC_DELEGATES_APP_URL ?? "https://delegates.pmgapphub.com";
export const SPEAKERS_APP_URL = process.env.NEXT_PUBLIC_SPEAKERS_APP_URL ?? "https://speakers.pmgapphub.com";
