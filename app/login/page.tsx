import { login } from "./actions";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
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
        style={{ width: 340, padding: 28 }}
      >
        <h2 style={{ margin: "0 0 4px" }}>PMG Delegates</h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 13 }}>
          Sign in to manage delegates
        </p>
        {searchParams.error && (
          <div className="flash flash-warn">{searchParams.error}</div>
        )}
        <label>Email</label>
        <input name="email" type="email" required autoFocus />
        <div style={{ height: 12 }} />
        <label>Password</label>
        <input name="password" type="password" required />
        <div style={{ height: 18 }} />
        <button className="btn btn-primary" style={{ width: "100%" }} type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}
