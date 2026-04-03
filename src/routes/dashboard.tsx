import { createFileRoute, Link } from "@tanstack/react-router";
import { Plug, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { deleteLocalSkill, fetchLocalSkillsList } from "../lib/localBackend";
import type { LocalSkillListEntry } from "../lib/localBackend";
import { formatCompactStat } from "../lib/numberFormat";
import { useAuthStatus } from "../lib/useAuthStatus";

const emptyPluginPublishSearch = {
  ownerHandle: undefined,
  name: undefined,
  displayName: undefined,
  family: undefined,
  nextVersion: undefined,
  sourceRepo: undefined,
} as const;

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const { me, isAuthenticated, isLoading } = useAuthStatus();
  const [skills, setSkills] = useState<LocalSkillListEntry[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !me?.handle) {
      setSkills([]);
      return;
    }

    let cancelled = false;
    setLoadingSkills(true);
    void fetchLocalSkillsList({ limit: 200 })
      .then((result) => {
        if (cancelled) return;
        const handle = me.handle?.trim().toLowerCase();
        setSkills(
          result.items.filter((entry) => (entry.ownerHandle ?? "").trim().toLowerCase() === handle),
        );
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSkills(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, me?.handle]);

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">{t("dashboard.loading")}</div>
      </main>
    );
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="section">
        <div className="card">{t("dashboard.signIn")}</div>
      </main>
    );
  }

  const ownerHandle = me.handle ?? me.displayName ?? me.name ?? "unknown";

  async function handleDeleteSkill(slug: string) {
    if (!window.confirm(t("dashboard.deleteConfirm", { slug }))) return;
    setDeletingSlug(slug);
    try {
      await deleteLocalSkill(slug);
      setSkills((current) => current.filter((entry) => entry.skill.slug !== slug));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to delete skill.");
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <main className="section">
      <div className="dashboard-header">
        <div style={{ display: "grid", gap: "6px" }}>
          <h1 className="section-title" style={{ margin: 0 }}>
            {t("dashboard.title")}
          </h1>
          <p className="section-subtitle" style={{ margin: 0 }}>
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/publish-skill" search={{ updateSlug: undefined }} className="btn btn-primary">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {t("dashboard.publishSkill")}
          </Link>
          <Link
            to="/publish-plugin"
            search={{ ...emptyPluginPublishSearch, ownerHandle }}
            className="btn"
          >
            <Plug className="h-4 w-4" aria-hidden="true" />
            {t("dashboard.publishPlugin")}
          </Link>
        </div>
      </div>

      <section className="card dashboard-owner-panel">
        <div className="dashboard-owner-grid">
          <section className="dashboard-collection-block">
            <div className="dashboard-section-header">
              <div>
                <h2 className="dashboard-collection-title">{t("dashboard.publishedSkills")}</h2>
                <p className="section-subtitle" style={{ margin: "6px 0 0" }}>
                  {t("dashboard.publishedSkillsSubtitle", { owner: ownerHandle })}
                </p>
              </div>
            </div>
            {loadingSkills ? (
              <div className="dashboard-inline-empty">{t("dashboard.loadingSkills")}</div>
            ) : skills.length === 0 ? (
              <div className="dashboard-inline-empty">
                <div className="dashboard-inline-empty-copy">
                  <strong>{t("dashboard.noSkills")}</strong> {t("dashboard.noSkillsSubtitle")}
                </div>
                <Link
                  to="/publish-skill"
                  search={{ updateSlug: undefined }}
                  className="btn btn-primary"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {t("dashboard.publishSkill")}
                </Link>
              </div>
            ) : (
              <div className="dashboard-list">
                <div className="dashboard-list-header">
                  <span>{t("dashboard.skillColumn")}</span>
                  <span>{t("dashboard.summaryColumn")}</span>
                  <span>{t("dashboard.statsColumn")}</span>
                  <span>{t("dashboard.actionsColumn")}</span>
                </div>
                {skills.map((entry) => (
                  <SkillRow
                    key={entry.skill._id}
                    entry={entry}
                    ownerHandle={ownerHandle}
                    deletingSlug={deletingSlug}
                    onDelete={handleDeleteSkill}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-collection-block">
            <div className="dashboard-section-header">
              <div>
                <h2 className="dashboard-collection-title">{t("dashboard.plugins")}</h2>
                <p className="section-subtitle" style={{ margin: "6px 0 0" }}>
                  {t("dashboard.pluginsSubtitle")}
                </p>
              </div>
            </div>
            <div className="dashboard-inline-empty">
              <div className="dashboard-inline-empty-copy">
                <strong>{t("dashboard.pluginsEmpty")}</strong> {t("dashboard.pluginsEmptySubtitle")}
              </div>
              <Link
                to="/publish-plugin"
                search={{ ...emptyPluginPublishSearch, ownerHandle }}
                className="btn"
              >
                <Plug className="h-4 w-4" aria-hidden="true" />
                {t("dashboard.openPublishPlugin")}
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SkillRow({
  entry,
  ownerHandle,
  deletingSlug,
  onDelete,
}: {
  entry: LocalSkillListEntry;
  ownerHandle: string;
  deletingSlug: string | null;
  onDelete: (slug: string) => void;
}) {
  const { t } = useI18n();
  const stats = entry.skill.stats;
  const latestVersion = entry.latestVersion?.version ?? t("dashboard.unversioned");
  const hrefOwner = entry.ownerHandle ?? ownerHandle;

  return (
    <div className="dashboard-list-row">
      <div className="dashboard-list-primary">
        <div className="dashboard-list-title">
          <Link
            to="/$owner/$slug"
            params={{ owner: hrefOwner, slug: entry.skill.slug }}
            className="dashboard-skill-name"
          >
            {entry.skill.displayName}
          </Link>
          <span className="dashboard-list-id">/{entry.skill.slug}</span>
        </div>
        <div className="dashboard-list-meta">
          {t("dashboard.latestVersion", { version: latestVersion })}
        </div>
      </div>
      <div className="dashboard-list-secondary">{entry.skill.summary ?? t("skill.noSummary")}</div>
      <div className="dashboard-list-secondary">
        {[
          `↓ ${formatCompactStat(stats.downloads)}`,
          `★ ${formatCompactStat(stats.stars)}`,
          `v ${formatCompactStat(stats.versions)}`,
        ].join(" · ")}
      </div>
      <div className="dashboard-list-actions">
        <Link
          to="/$owner/$slug"
          params={{ owner: hrefOwner, slug: entry.skill.slug }}
          className="btn"
        >
          {t("dashboard.view")}
        </Link>
        <Link
          to="/publish-skill"
          search={{ updateSlug: entry.skill.slug }}
          className="btn btn-primary"
        >
          {t("dashboard.release")}
        </Link>
        <button
          type="button"
          className="btn"
          onClick={() => void onDelete(entry.skill.slug)}
          disabled={deletingSlug === entry.skill.slug}
        >
          {deletingSlug === entry.skill.slug ? t("dashboard.deleting") : t("common.delete")}
        </button>
      </div>
    </div>
  );
}
