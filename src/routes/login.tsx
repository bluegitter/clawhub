import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "../lib/i18n";
import { getLocalBackendOrigin } from "../lib/runtimeEnv";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const backendOrigin = getLocalBackendOrigin();
  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/` : "http://localhost:3000/";
  const loginUrl = backendOrigin ? new URL("/auth/login", backendOrigin) : null;

  if (loginUrl) {
    loginUrl.searchParams.set("redirect_uri", redirectUri);
  }

  return (
    <main className="section">
      <div className="card">
        <h1 className="section-title" style={{ marginTop: 0 }}>
          {t("login.title")}
        </h1>
        {loginUrl ? (
          <>
            <p className="section-subtitle">{t("login.configured")}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <a className="btn btn-primary" href={loginUrl.toString()}>
                {t("login.signIn")}
              </a>
              <Link to="/" className="btn">
                {t("login.backHome")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="section-subtitle">{t("login.unconfigured")}</p>
            <Link to="/" className="btn" style={{ marginTop: 20 }}>
              {t("login.backHome")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
