// Minimal ambient typing for the one react-dom hook this app uses
// (@types/react-dom is not installed — no new dependencies).
declare module "react-dom" {
  export function useFormStatus(): {
    pending: boolean;
    data: FormData | null;
    method: string | null;
    action: unknown;
  };
}
