import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { LocalStarredSkillEntry } from "../lib/localBackend";
import { listLocalStarredSkills, toggleLocalStar } from "../lib/localBackend";
import { useAuthStatus } from "../lib/useAuthStatus";

export const Route = createFileRoute("/stars")({
  component: Stars,
});

function Stars() {
  const { t, formatCompactNumber, formatDateTime } = useI18n();
  const { me, isAuthenticated, isLoading } = useAuthStatus();
  const [items, setItems] = useState<LocalStarredSkillEntry[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !me) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoadingItems(true);
    setError(null);
    void listLocalStarredSkills()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load starred skills.",
          );
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, me?._id]);

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">{t("stars.loading")}</div>
      </main>
    );
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="section">
        <div className="card">{t("stars.signIn")}</div>
      </main>
    );
  }

  return (
    <main className="section">
      <h1 className="section-title">{t("stars.title")}</h1>
      <p className="section-subtitle">{t("stars.subtitle")}</p>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        {loadingItems ? <div>{t("stars.loadingItems")}</div> : null}
        {error ? <div>{error}</div> : null}
        {!loadingItems && !error && items.length === 0 ? (
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            {t("stars.empty")}
          </p>
        ) : null}
        {items.map((entry) => (
          <article
            key={entry.skill._id}
            style={{
              display: "grid",
              gap: 10,
              paddingBottom: 16,
              borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <Link
                  to="/$owner/$slug"
                  params={{
                    owner: entry.ownerHandle ?? "unknown",
                    slug: entry.skill.slug,
                  }}
                  className="dashboard-skill-name"
                >
                  {entry.skill.displayName}
                </Link>
                <div className="section-subtitle" style={{ margin: 0 }}>
                  /{entry.skill.slug}
                  {entry.ownerHandle ? ` by @${entry.ownerHandle}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void toggleLocalStar(entry.skill.slug).then(() => {
                    setItems((current) =>
                      current.filter((item) => item.skill.slug !== entry.skill.slug),
                    );
                  });
                }}
              >
                {t("stars.remove")}
              </button>
            </div>
            <div>{entry.skill.summary ?? t("skills.noSummary")}</div>
            <div className="section-subtitle" style={{ margin: 0 }}>
              {`★ ${formatCompactNumber(entry.skill.stats.stars)} · ↓ ${formatCompactNumber(entry.skill.stats.downloads)} · ${t("stars.starredAt", { date: formatDateTime(entry.starredAt) })}`}
            </div>
          </article>
        ))}
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
          className="btn btn-primary"
        >
          {t("stars.browse")}
        </Link>
      </div>
    </main>
  );
}
