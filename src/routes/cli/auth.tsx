import { createFileRoute } from "@tanstack/react-router";
import { useAuthStatus } from "../../lib/useAuthStatus";

export const Route = createFileRoute("/cli/auth")({
  component: CliAuth,
});

function CliAuth() {
  const { isAuthenticated, isLoading } = useAuthStatus();

  return (
    <main className="section">
      <div className="card">
        <h1 className="section-title" style={{ marginTop: 0 }}>
          CLI login
        </h1>
        <p className="section-subtitle">
          {isLoading
            ? "Checking local session…"
            : isAuthenticated
              ? "CLI token issuance has not been migrated to the local backend yet."
              : "Sign in on the web first. CLI token issuance has not been migrated to the local backend yet."}
        </p>
        <div className="stat">
          The previous browser-to-CLI token flow depended on Convex token APIs. Local deployment still
          needs a replacement token service before `clawhub login` can work here.
        </div>
      </div>
    </main>
  );
}
