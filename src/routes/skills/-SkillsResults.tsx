import { Link } from "@tanstack/react-router";
import type { RefObject } from "react";
import { SkillCard } from "../../components/SkillCard";
import { getPlatformLabels } from "../../components/skillDetailUtils";
import { SkillMetricsRow, SkillStatsTripletLine } from "../../components/SkillStats";
import { UserBadge } from "../../components/UserBadge";
import { getSkillBadges } from "../../lib/badges";
import { useI18n } from "../../lib/i18n";
import { shouldUseLocalBackend } from "../../lib/localBackend";
import { useLocalStars } from "../../lib/useLocalStars";
import { buildSkillHref, type SkillListEntry } from "./-types";

type SkillsResultsProps = {
  isLoadingSkills: boolean;
  sorted: SkillListEntry[];
  view: "cards" | "list";
  listDoneLoading: boolean;
  hasQuery: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  canAutoLoad: boolean;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  loadMore: () => void;
};

export function SkillsResults({
  isLoadingSkills,
  sorted,
  view,
  listDoneLoading,
  hasQuery,
  canLoadMore,
  isLoadingMore,
  canAutoLoad,
  loadMoreRef,
  loadMore,
}: SkillsResultsProps) {
  const { t } = useI18n();
  const { isAuthenticated, starredSet, toggle } = useLocalStars();

  return (
    <>
      {isLoadingSkills ? (
        <div className="card">
          <div className="loading-indicator">{t("skills.loading")}</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="card">
          {listDoneLoading || hasQuery ? t("skills.noMatch") : t("skills.loading")}
        </div>
      ) : view === "cards" ? (
        <div className="grid">
          {sorted.map((entry) => {
            const skill = entry.skill;
            const clawdis = entry.latestVersion?.parsed?.clawdis;
            const isPlugin = Boolean(clawdis?.nix?.plugin);
            const platforms = getPlatformLabels(clawdis?.os, clawdis?.nix?.systems);
            const ownerHandle = entry.owner?.handle ?? entry.ownerHandle ?? null;
            const skillHref = buildSkillHref(skill, ownerHandle);
            return (
              <SkillCard
                key={skill._id}
                skill={skill}
                href={skillHref}
                badge={getSkillBadges(skill)}
                chip={isPlugin ? t("skills.pluginBundle") : undefined}
                platformLabels={platforms.length ? platforms : undefined}
                summaryFallback={t("home.skills.summaryReady")}
                meta={
                  <div className="skill-card-footer-rows">
                    <UserBadge
                      user={entry.owner}
                      fallbackHandle={ownerHandle}
                      prefix={t("common.by")}
                      link={false}
                    />
                    <div className="stat">
                      <SkillStatsTripletLine stats={skill.stats} />
                    </div>
                  </div>
                }
                extraActions={
                  shouldUseLocalBackend() && isAuthenticated ? (
                    <button
                      className={`star-toggle${starredSet.has(skill.slug) ? " is-active" : ""}`}
                      type="button"
                      onClick={() => void toggle(skill.slug)}
                      aria-label={starredSet.has(skill.slug) ? "Unstar skill" : "Star skill"}
                    >
                      <span aria-hidden="true">★</span>
                    </button>
                  ) : null
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="skills-table">
          <div className="skills-table-header">
            <span>{t("skills.headerSkill")}</span>
            <span>{t("skills.headerSummary")}</span>
            <span>{t("skills.headerAuthor")}</span>
            <span className="skills-table-stats">{t("skills.headerStats")}</span>
          </div>
          {sorted.map((entry) => {
            const skill = entry.skill;
            const ownerHandle = entry.owner?.handle ?? entry.ownerHandle ?? null;
            const skillHref = buildSkillHref(skill, ownerHandle);
            return (
              <div key={skill._id} className="skills-table-row">
                <Link className="skills-table-name" to={skillHref}>
                  <span>
                    {skill.displayName}
                    {getSkillBadges(skill).map((badge) => (
                      <span key={badge} className="tag tag-compact">
                        {badge}
                      </span>
                    ))}
                  </span>
                  {entry.latestVersion?.version ? (
                    <span className="skills-table-version">v{entry.latestVersion.version}</span>
                  ) : null}
                </Link>
                <span className="skills-table-summary">
                  {skill.summary ?? t("skills.noSummary")}
                  {skill.labels?.length ? (
                    <span className="skill-card-tags" style={{ marginTop: 6, display: "flex" }}>
                      {skill.labels.map((label) => (
                        <span key={label} className="tag tag-compact">
                          #{label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="skills-table-author">
                  <UserBadge
                    user={entry.owner}
                    fallbackHandle={ownerHandle}
                    prefix=""
                    link={false}
                  />
                </span>
                <span className="skills-table-stats">
                  <SkillMetricsRow stats={skill.stats} />
                  {shouldUseLocalBackend() && isAuthenticated ? (
                    <button
                      className={`star-toggle${starredSet.has(skill.slug) ? " is-active" : ""}`}
                      type="button"
                      onClick={() => void toggle(skill.slug)}
                      aria-label={starredSet.has(skill.slug) ? "Unstar skill" : "Star skill"}
                    >
                      <span aria-hidden="true">★</span>
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canLoadMore || isLoadingMore ? (
        <div
          ref={canAutoLoad ? loadMoreRef : null}
          className="card"
          style={{ marginTop: 16, display: "flex", justifyContent: "center" }}
        >
          {canAutoLoad ? (
            isLoadingMore ? (
              t("skills.loadingMore")
            ) : (
              t("skills.scrollMore")
            )
          ) : (
            <button className="btn" type="button" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? t("skills.loadingButton") : t("skills.loadMore")}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
