import { createFileRoute, Link } from "@tanstack/react-router";
import { getLocalBackendOrigin } from "../lib/runtimeEnv";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const backendOrigin = getLocalBackendOrigin();
  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/` : "http://localhost:3000/";
  const loginUrl = backendOrigin
    ? new URL("/auth/login", backendOrigin)
    : null;

  if (loginUrl) {
    loginUrl.searchParams.set("redirect_uri", redirectUri);
  }

  return (
    <main className="section">
      <div className="card">
        <h1 className="section-title" style={{ marginTop: 0 }}>
          Login
        </h1>
        {loginUrl ? (
          <>
            <p className="section-subtitle">
              This environment uses the self-host authentication gateway on port 3001. It will
              decide whether to use unified SSO or the local development login flow.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <a className="btn btn-primary" href={loginUrl.toString()}>
                Sign in
              </a>
              <Link to="/" className="btn">
                Back home
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="section-subtitle">
              Local login is not configured for this environment.
            </p>
            <Link to="/" className="btn" style={{ marginTop: 20 }}>
              Back home
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
