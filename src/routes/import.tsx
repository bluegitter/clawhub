import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "../lib/i18n";

export const Route = createFileRoute("/import")({
  component: ImportGitHub,
});

export function ImportGitHub() {
  const { t } = useI18n();
  return (
    <main className="section upload-shell">
      <div className="upload-header">
        <div>
          <div className="upload-kicker">{t("import.kicker")}</div>
          <h1 className="upload-title">{t("import.title")}</h1>
          <p className="upload-subtitle">{t("import.subtitle")}</p>
        </div>
        <div className="upload-badge">
          <div>{t("import.notMigrated")}</div>
          <div className="upload-badge-sub">{t("import.useLocal")}</div>
        </div>
      </div>

      <div className="upload-card">
        <p className="section-subtitle" style={{ marginTop: 0 }}>
          {t("import.body")}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/publish-skill" search={{ updateSlug: undefined }} className="btn btn-primary">
            {t("import.openPublishSkill")}
          </Link>
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: "downloads",
              dir: undefined,
              highlighted: undefined,
              nonSuspicious: true,
              view: undefined,
              focus: undefined,
            }}
            className="btn"
          >
            {t("home.skills.browse")}
          </Link>
        </div>
      </div>
    </main>
  );
}
