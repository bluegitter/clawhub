import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "../../lib/i18n";
import { useAuthStatus } from "../../lib/useAuthStatus";

export const Route = createFileRoute("/cli/auth")({
  component: CliAuth,
});

function CliAuth() {
  const { t } = useI18n();
  const { isAuthenticated, isLoading } = useAuthStatus();

  return (
    <main className="section">
      <div className="card">
        <h1 className="section-title" style={{ marginTop: 0 }}>
          {t("cli.title")}
        </h1>
        <p className="section-subtitle">
          {isLoading
            ? t("cli.checking")
            : isAuthenticated
              ? t("cli.unavailableAuthed")
              : t("cli.unavailableUnauthed")}
        </p>
        <div className="stat">{t("cli.body")}</div>
      </div>
    </main>
  );
}
