import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { InstallSwitcher } from "../components/InstallSwitcher";
import { SkillCard } from "../components/SkillCard";
import { SkillStatsTripletLine } from "../components/SkillStats";
import { SoulCard } from "../components/SoulCard";
import { SoulStatsTripletLine } from "../components/SoulStats";
import { UserBadge } from "../components/UserBadge";
import { convexHttp } from "../convex/client";
import { getSkillBadges } from "../lib/badges";
import { useAction, useQuery } from "../lib/convexCompat";
import { useI18n } from "../lib/i18n";
import { fetchLocalSkillsList, shouldUseLocalBackend } from "../lib/localBackend";
import type { PublicPublisher, PublicSkill, PublicSoul } from "../lib/publicUser";
import { getSiteMode } from "../lib/site";
import { useLocalStars } from "../lib/useLocalStars";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const mode = getSiteMode();
  return mode === "souls" ? <OnlyCrabsHome /> : <SkillsHome />;
}

function SkillsHome() {
  const { t } = useI18n();
  type SkillPageEntry = {
    skill: PublicSkill;
    ownerHandle?: string | null;
    owner?: PublicPublisher | null;
    latestVersion?: unknown;
  };

  const [highlighted, setHighlighted] = useState<SkillPageEntry[]>([]);
  const [popular, setPopular] = useState<SkillPageEntry[]>([]);
  const useLocalBackend = shouldUseLocalBackend();
  const { isAuthenticated, starredSet, toggle } = useLocalStars();

  useEffect(() => {
    let cancelled = false;
    if (useLocalBackend) {
      void fetchLocalSkillsList({ limit: 12 })
        .then((result) => {
          if (cancelled) return;
          const entries = result.items as SkillPageEntry[];
          setHighlighted(entries.slice(0, 6));
          setPopular(entries);
        })
        .catch(() => {});
    } else {
      convexHttp
        .query(api.skills.listHighlightedPublic, { limit: 6 })
        .then((r) => {
          if (!cancelled) setHighlighted(r as SkillPageEntry[]);
        })
        .catch(() => {});
      convexHttp
        .query(api.skills.listPublicPageV4, {
          numItems: 12,
          sort: "downloads",
          dir: "desc",
          nonSuspiciousOnly: true,
        })
        .then((r) => {
          if (!cancelled) setPopular((r as { page: SkillPageEntry[] }).page);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [useLocalBackend]);

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy fade-up" data-delay="1">
            <span className="hero-badge">{t("home.skills.badge")}</span>
            <h1 className="hero-title">{t("home.skills.title")}</h1>
            <p className="hero-subtitle">{t("home.skills.subtitle")}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <Link
                to="/publish-skill"
                search={{ updateSlug: undefined }}
                className="btn btn-primary"
              >
                {t("home.skills.publish")}
              </Link>
              <Link
                to="/skills"
                search={{
                  q: undefined,
                  sort: undefined,
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
          <div className="hero-card hero-search-card fade-up" data-delay="2">
            <div className="hero-install" style={{ marginTop: 18 }}>
              <div className="stat">{t("home.skills.searchStat")}</div>
              <InstallSwitcher exampleSlug="sonoscli" />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t("home.skills.highlightedTitle")}</h2>
        <p className="section-subtitle">{t("home.skills.highlightedSubtitle")}</p>
        <div className="grid">
          {highlighted.length === 0 ? (
            <div className="card">{t("home.skills.noHighlighted")}</div>
          ) : (
            highlighted.map((entry) => (
              <SkillCard
                key={entry.skill._id}
                skill={entry.skill}
                href={`/${encodeURIComponent(entry.ownerHandle ?? String(entry.skill.ownerUserId))}/${encodeURIComponent(entry.skill.slug)}`}
                badge={getSkillBadges(entry.skill)}
                summaryFallback={t("home.skills.summaryFresh")}
                meta={
                  <div className="skill-card-footer-rows">
                    <UserBadge
                      user={entry.owner}
                      fallbackHandle={entry.ownerHandle ?? null}
                      prefix={t("common.by")}
                      link={false}
                    />
                    <div className="stat">
                      <SkillStatsTripletLine stats={entry.skill.stats} />
                    </div>
                  </div>
                }
                extraActions={
                  useLocalBackend && isAuthenticated ? (
                    <button
                      className={`star-toggle${starredSet.has(entry.skill.slug) ? " is-active" : ""}`}
                      type="button"
                      onClick={() => void toggle(entry.skill.slug)}
                      aria-label={starredSet.has(entry.skill.slug) ? "Unstar skill" : "Star skill"}
                    >
                      <span aria-hidden="true">★</span>
                    </button>
                  ) : null
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t("home.skills.popularTitle")}</h2>
        <p className="section-subtitle">{t("home.skills.popularSubtitle")}</p>
        <div className="grid">
          {popular.length === 0 ? (
            <div className="card">{t("home.skills.noPopular")}</div>
          ) : (
            popular.map((entry) => (
              <SkillCard
                key={entry.skill._id}
                skill={entry.skill}
                href={`/${encodeURIComponent(entry.ownerHandle ?? String(entry.skill.ownerUserId))}/${encodeURIComponent(entry.skill.slug)}`}
                summaryFallback={t("home.skills.summaryReady")}
                meta={
                  <div className="skill-card-footer-rows">
                    <UserBadge
                      user={entry.owner}
                      fallbackHandle={entry.ownerHandle ?? null}
                      prefix={t("common.by")}
                      link={false}
                    />
                    <div className="stat">
                      <SkillStatsTripletLine stats={entry.skill.stats} />
                    </div>
                  </div>
                }
                extraActions={
                  useLocalBackend && isAuthenticated ? (
                    <button
                      className={`star-toggle${starredSet.has(entry.skill.slug) ? " is-active" : ""}`}
                      type="button"
                      onClick={() => void toggle(entry.skill.slug)}
                      aria-label={starredSet.has(entry.skill.slug) ? "Unstar skill" : "Star skill"}
                    >
                      <span aria-hidden="true">★</span>
                    </button>
                  ) : null
                }
              />
            ))
          )}
        </div>
        <div className="section-cta">
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              highlighted: undefined,
              nonSuspicious: true,
              view: undefined,
              focus: undefined,
            }}
            className="btn"
          >
            {t("home.skills.seeAll")}
          </Link>
        </div>
      </section>
    </main>
  );
}

function OnlyCrabsHome() {
  const { t } = useI18n();
  const navigate = Route.useNavigate();
  const ensureSoulSeeds = useAction(api.seed.ensureSoulSeeds);
  const latest = (useQuery(api.souls.list, { limit: 12 }) as PublicSoul[]) ?? [];
  const [query, setQuery] = useState("");
  const seedEnsuredRef = useRef(false);
  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (seedEnsuredRef.current) return;
    seedEnsuredRef.current = true;
    void ensureSoulSeeds({});
  }, [ensureSoulSeeds]);

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy fade-up" data-delay="1">
            <span className="hero-badge">{t("home.souls.badge")}</span>
            <h1 className="hero-title">{t("home.souls.title")}</h1>
            <p className="hero-subtitle">{t("home.souls.subtitle")}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <Link
                to="/publish-skill"
                search={{ updateSlug: undefined }}
                className="btn btn-primary"
              >
                {t("home.souls.publish")}
              </Link>
              <Link
                to="/souls"
                search={{
                  q: undefined,
                  sort: undefined,
                  dir: undefined,
                  view: undefined,
                  focus: undefined,
                }}
                className="btn"
              >
                {t("home.souls.browse")}
              </Link>
            </div>
          </div>
          <div className="hero-card hero-search-card fade-up" data-delay="2">
            <form
              className="search-bar"
              onSubmit={(event) => {
                event.preventDefault();
                void navigate({
                  to: "/souls",
                  search: {
                    q: trimmedQuery || undefined,
                    sort: undefined,
                    dir: undefined,
                    view: undefined,
                    focus: undefined,
                  },
                });
              }}
            >
              <span className="mono">/</span>
              <input
                className="search-input"
                placeholder={t("home.souls.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </form>
            <div className="hero-install" style={{ marginTop: 18 }}>
              <div className="stat">{t("home.souls.searchStat")}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">{t("home.souls.latestTitle")}</h2>
        <p className="section-subtitle">{t("home.souls.latestSubtitle")}</p>
        <div className="grid">
          {latest.length === 0 ? (
            <div className="card">{t("home.souls.noLatest")}</div>
          ) : (
            latest.map((soul) => (
              <SoulCard
                key={soul._id}
                soul={soul}
                summaryFallback={t("home.souls.summary")}
                meta={
                  <div className="stat">
                    <SoulStatsTripletLine stats={soul.stats} />
                  </div>
                }
              />
            ))
          )}
        </div>
        <div className="section-cta">
          <Link
            to="/souls"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              view: undefined,
              focus: undefined,
            }}
            className="btn"
          >
            {t("home.souls.seeAll")}
          </Link>
        </div>
      </section>
    </main>
  );
}
