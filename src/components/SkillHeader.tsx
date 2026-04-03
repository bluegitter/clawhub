import { Link } from "@tanstack/react-router";
import type { ClawdisSkillMetadata } from "clawhub-schema";
import {
  PLATFORM_SKILL_LICENSE,
  PLATFORM_SKILL_LICENSE_SUMMARY,
} from "clawhub-schema/licenseConstants";
import { Package } from "lucide-react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { getSkillBadges } from "../lib/badges";
import { useI18n } from "../lib/i18n";
import { formatCompactStat, formatSkillStatsTriplet } from "../lib/numberFormat";
import type { PublicPublisher, PublicSkill } from "../lib/publicUser";
import { getRuntimeEnv } from "../lib/runtimeEnv";
import { SkillInstallCard } from "./SkillInstallCard";
import { type LlmAnalysis, SecurityScanResults } from "./SkillSecurityScanResults";
import { UserBadge } from "./UserBadge";

export type SkillModerationInfo = {
  isPendingScan: boolean;
  isMalwareBlocked: boolean;
  isSuspicious: boolean;
  isHiddenByMod: boolean;
  isRemoved: boolean;
  overrideActive?: boolean;
  verdict?: "clean" | "suspicious" | "malicious";
  reason?: string;
};

type SkillFork = {
  kind: "fork" | "duplicate";
  version: string | null;
  skill: { slug: string; displayName: string };
  owner: { handle: string | null; userId: Id<"users"> | null };
};

type SkillCanonical = {
  skill: { slug: string; displayName: string };
  owner: { handle: string | null; userId: Id<"users"> | null };
};

type SkillHeaderProps = {
  skill: Doc<"skills"> | PublicSkill;
  owner: PublicPublisher | null;
  ownerHandle: string | null;
  latestVersion: Doc<"skillVersions"> | null;
  modInfo: SkillModerationInfo | null;
  canManage: boolean;
  isAuthenticated: boolean;
  isStaff: boolean;
  isStarred: boolean | undefined;
  onToggleStar: () => void;
  onOpenReport: () => void;
  forkOf: SkillFork | null;
  forkOfLabel: string;
  forkOfHref: string | null;
  forkOfOwnerHandle: string | null;
  canonical: SkillCanonical | null;
  canonicalHref: string | null;
  canonicalOwnerHandle: string | null;
  staffModerationNote: string | null;
  staffVisibilityTag: string | null;
  isAutoHidden: boolean;
  isRemoved: boolean;
  nixPlugin: string | undefined;
  hasPluginBundle: boolean;
  configRequirements: ClawdisSkillMetadata["config"] | undefined;
  cliHelp: string | undefined;
  tagEntries: Array<[string, Id<"skillVersions">]>;
  versionById: Map<Id<"skillVersions">, Doc<"skillVersions">>;
  tagName: string;
  onTagNameChange: (value: string) => void;
  tagVersionId: Id<"skillVersions"> | "";
  onTagVersionChange: (value: Id<"skillVersions"> | "") => void;
  onTagSubmit: () => void;
  onTagDelete: (tag: string) => void;
  tagVersions: Doc<"skillVersions">[];
  clawdis: ClawdisSkillMetadata | undefined;
  osLabels: string[];
};

export function SkillHeader({
  skill,
  owner,
  ownerHandle,
  latestVersion,
  modInfo,
  canManage,
  isAuthenticated,
  isStaff,
  isStarred,
  onToggleStar,
  onOpenReport,
  forkOf,
  forkOfLabel,
  forkOfHref,
  forkOfOwnerHandle,
  canonical,
  canonicalHref,
  canonicalOwnerHandle,
  staffModerationNote,
  staffVisibilityTag,
  isAutoHidden,
  isRemoved,
  nixPlugin,
  hasPluginBundle,
  configRequirements,
  cliHelp,
  tagEntries,
  versionById,
  tagName,
  onTagNameChange,
  tagVersionId,
  onTagVersionChange,
  onTagSubmit,
  onTagDelete,
  tagVersions,
  clawdis,
  osLabels,
}: SkillHeaderProps) {
  const { t } = useI18n();
  const convexSiteUrl = getRuntimeEnv("VITE_CONVEX_SITE_URL") ?? "https://clawhub.ai";
  const formattedStats = formatSkillStatsTriplet(skill.stats);
  const suppressScanResults =
    !isStaff &&
    Boolean(modInfo?.overrideActive) &&
    !modInfo?.isMalwareBlocked &&
    !modInfo?.isSuspicious;
  const overrideScanMessage = suppressScanResults ? t("skill.scanCleared") : null;

  return (
    <>
      {modInfo?.isPendingScan ? (
        <div className="pending-banner">
          <div className="pending-banner-content">
            <strong>{t("skill.pendingTitle")}</strong>
            <p>{t("skill.pendingBody")}</p>
          </div>
        </div>
      ) : modInfo?.isMalwareBlocked ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>{t("skill.blockedTitle")}</strong>
            <p>{t("skill.blockedBody")}</p>
          </div>
        </div>
      ) : modInfo?.isSuspicious ? (
        <div className="pending-banner pending-banner-warning">
          <div className="pending-banner-content">
            <strong>{t("skill.flaggedTitle")}</strong>
            <p>{t("skill.flaggedBody")}</p>
            {canManage ? (
              <p className="pending-banner-appeal">
                {t("skill.flaggedAppeal")}{" "}
                <a
                  href="https://github.com/openclaw/clawhub/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : modInfo?.isRemoved ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>{t("skill.removedTitle")}</strong>
            <p>{t("skill.removedBody")}</p>
          </div>
        </div>
      ) : modInfo?.isHiddenByMod ? (
        <div className="pending-banner pending-banner-blocked">
          <div className="pending-banner-content">
            <strong>{t("skill.hiddenTitle")}</strong>
            <p>{t("skill.hiddenBody")}</p>
          </div>
        </div>
      ) : null}

      <div className="card skill-hero">
        <div className={`skill-hero-top${hasPluginBundle ? " has-plugin" : ""}`}>
          <div className="skill-hero-header">
            <div className="skill-hero-title">
              <div className="skill-hero-title-row">
                <h1 className="section-title" style={{ margin: 0 }}>
                  {skill.displayName}
                </h1>
                {nixPlugin ? (
                  <span className="tag tag-accent">{t("skill.pluginBundle")}</span>
                ) : null}
              </div>
              <p className="section-subtitle">{skill.summary ?? t("skill.noSummary")}</p>

              {isStaff && staffModerationNote ? (
                <div className="skill-hero-note">{staffModerationNote}</div>
              ) : null}
              {nixPlugin ? (
                <div className="skill-hero-note">{t("skill.pluginBundleNote")}</div>
              ) : null}
              <div className="skill-hero-note">
                <strong>{PLATFORM_SKILL_LICENSE}</strong> · {PLATFORM_SKILL_LICENSE_SUMMARY}
              </div>
              <div className="stat">
                ⭐ {formattedStats.stars} · <Package size={14} aria-hidden="true" />{" "}
                {formattedStats.downloads} ·{" "}
                {t("skill.currentInstalls", {
                  count: formatCompactStat(skill.stats.installsCurrent ?? 0),
                })}{" "}
                · {t("skill.allTimeInstalls", { count: formattedStats.installsAllTime })}
              </div>
              <div className="stat">
                <UserBadge
                  user={owner}
                  fallbackHandle={ownerHandle}
                  prefix="by"
                  size="md"
                  showName
                />
              </div>
              {forkOf && forkOfHref ? (
                <div className="stat">
                  {forkOfLabel}{" "}
                  <a href={forkOfHref}>
                    {forkOfOwnerHandle ? `@${forkOfOwnerHandle}/` : ""}
                    {forkOf.skill.slug}
                  </a>
                  {forkOf.version ? ` ${t("skill.basedOn", { version: forkOf.version })}` : null}
                </div>
              ) : null}
              {canonicalHref ? (
                <div className="stat">
                  {t("skill.canonical")}:{" "}
                  <a href={canonicalHref}>
                    {canonicalOwnerHandle ? `@${canonicalOwnerHandle}/` : ""}
                    {canonical?.skill?.slug}
                  </a>
                </div>
              ) : null}
              {getSkillBadges(skill).map((badge) => (
                <div key={badge} className="tag">
                  {badge}
                </div>
              ))}
              <div className="tag tag-accent">{PLATFORM_SKILL_LICENSE}</div>
              {isStaff && staffVisibilityTag ? (
                <div className={`tag${isAutoHidden || isRemoved ? " tag-accent" : ""}`}>
                  {staffVisibilityTag}
                </div>
              ) : null}
              <div className="skill-actions">
                {isAuthenticated ? (
                  <button
                    className={`star-toggle${isStarred ? " is-active" : ""}`}
                    type="button"
                    onClick={onToggleStar}
                    aria-label={isStarred ? "Unstar skill" : "Star skill"}
                  >
                    <span aria-hidden="true">★</span>
                  </button>
                ) : null}
                {isAuthenticated ? (
                  <button className="btn btn-ghost" type="button" onClick={onOpenReport}>
                    {t("skill.report")}
                  </button>
                ) : null}
                {isStaff ? (
                  <Link className="btn" to="/management" search={{ skill: skill.slug }}>
                    {t("skill.manage")}
                  </Link>
                ) : null}
              </div>
              {suppressScanResults ? (
                <div className="skill-hero-note">{overrideScanMessage}</div>
              ) : latestVersion?.sha256hash ||
                latestVersion?.llmAnalysis ||
                (latestVersion?.staticScan?.findings?.length ?? 0) > 0 ? (
                <SecurityScanResults
                  sha256hash={latestVersion?.sha256hash}
                  vtAnalysis={latestVersion?.vtAnalysis}
                  llmAnalysis={latestVersion?.llmAnalysis as LlmAnalysis | undefined}
                  staticFindings={latestVersion?.staticScan?.findings}
                />
              ) : null}
              {!suppressScanResults &&
              (latestVersion?.sha256hash ||
                latestVersion?.llmAnalysis ||
                (latestVersion?.staticScan?.findings?.length ?? 0) > 0) ? (
                <p className="scan-disclaimer">{t("skill.scanDisclaimer")}</p>
              ) : null}
            </div>
            <div className="skill-hero-cta">
              <div className="skill-version-pill">
                <span className="skill-version-label">{t("skill.currentVersion")}</span>
                <strong>v{latestVersion?.version ?? "—"}</strong>
              </div>
              {!nixPlugin && !modInfo?.isMalwareBlocked && !modInfo?.isRemoved ? (
                <a
                  className="btn btn-primary"
                  href={`${convexSiteUrl}/api/v1/download?slug=${skill.slug}`}
                >
                  {t("skill.downloadZip")}
                </a>
              ) : null}
            </div>
          </div>
          {hasPluginBundle ? (
            <div className="skill-panel bundle-card">
              <div className="bundle-header">
                <div className="bundle-title">{t("skill.pluginBundle")}</div>
                <div className="bundle-subtitle">{t("skill.bundleSubtitle")}</div>
              </div>
              <div className="bundle-includes">
                <span>{t("skill.bundleSkillMd")}</span>
                <span>{t("skill.bundleCli")}</span>
                <span>{t("skill.bundleConfig")}</span>
              </div>
              {configRequirements ? (
                <div className="bundle-section">
                  <div className="bundle-section-title">{t("skill.configRequirements")}</div>
                  <div className="bundle-meta">
                    {configRequirements.requiredEnv?.length ? (
                      <div className="stat">
                        <strong>{t("skill.requiredEnv")}</strong>
                        <span>{configRequirements.requiredEnv.join(", ")}</span>
                      </div>
                    ) : null}
                    {configRequirements.stateDirs?.length ? (
                      <div className="stat">
                        <strong>{t("skill.stateDirs")}</strong>
                        <span>{configRequirements.stateDirs.join(", ")}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {cliHelp ? (
                <details className="bundle-section bundle-details">
                  <summary>{t("skill.cliHelp")}</summary>
                  <pre className="hero-install-code mono">{cliHelp}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="skill-tag-row">
          {tagEntries.length === 0 ? (
            <span className="section-subtitle" style={{ margin: 0 }}>
              {t("skill.noTags")}
            </span>
          ) : (
            tagEntries.map(([tag, versionId]) => (
              <span key={tag} className="tag">
                {tag}
                <span className="tag-meta">
                  v{versionById.get(versionId)?.version ?? versionId}
                </span>
                {canManage && tag !== "latest" ? (
                  <button
                    type="button"
                    className="tag-delete"
                    onClick={() => onTagDelete(tag)}
                    aria-label={t("skill.deleteTagLabel", { tag })}
                    title={t("skill.deleteTag", { tag })}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>

        {canManage ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onTagSubmit();
            }}
            className="tag-form"
          >
            <input
              className="search-input"
              value={tagName}
              onChange={(event) => onTagNameChange(event.target.value)}
              placeholder={t("detail.tagPlaceholder")}
            />
            <select
              className="search-input"
              value={tagVersionId ?? ""}
              onChange={(event) => {
                const nextValue = String(event.target.value) as Id<"skillVersions">;
                onTagVersionChange(nextValue);
              }}
            >
              {tagVersions.map((version) => (
                <option key={version._id} value={version._id}>
                  v{version.version}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              {t("skill.updateTag")}
            </button>
          </form>
        ) : null}

        <SkillInstallCard clawdis={clawdis} osLabels={osLabels} />
      </div>
    </>
  );
}
