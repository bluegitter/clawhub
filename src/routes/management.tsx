import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "../lib/i18n";
import { isModerator } from "../lib/roles";
import { useAuthStatus } from "../lib/useAuthStatus";

export const Route = createFileRoute("/management")({
  validateSearch: (search) => ({
    skill: typeof search.skill === "string" && search.skill.trim() ? search.skill : undefined,
  }),
  component: Management,
});

function Management() {
  const { t } = useI18n();
  const { me, isLoading } = useAuthStatus();
  const staff = isModerator(me);

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">{t("management.loading")}</div>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="section">
        <div className="card">{t("management.only")}</div>
      </main>
    );
  }

  return (
    <main className="section">
      <h1 className="section-title">{t("management.title")}</h1>
      <p className="section-subtitle">{t("management.subtitle")}</p>
      <div className="card">
        <div className="stat">{t("management.notAvailable")}</div>
        <div className="stat">{t("management.reportedSkills")}</div>
        <div className="stat">{t("management.canonical")}</div>
        <div className="stat">{t("management.ownerTransfer")}</div>
        <div className="stat">{t("management.roles")}</div>
      </div>
    </main>
  );
}
