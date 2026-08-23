import { login } from "./actions";
import SubmitButton from "./SubmitButton";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; email?: string };
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        action={login}
        className="card"
        style={{ width: 340, maxWidth: "calc(100vw - 32px)", padding: 28 }}
      >
        <h2 style={{ margin: "0 0 4px" }}>PMG Delegates</h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>
          Sign in to manage delegates
        </p>
        {searchParams.error && (
          <div className="flash flash-warn" role="alert">{searchParams.error}</div>
        )}
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoFocus={!searchParams.email}
          autoComplete="username"
          inputMode="email"
          defaultValue={searchParams.email ?? ""}
        />
        <div style={{ height: 12 }} />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          autoFocus={!!searchParams.email}
        />
        <div style={{ height: 18 }} />
        <SubmitButton />
      </form>
    </div>
  );
}
