import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { InstallSwitcher } from "./InstallSwitcher";
import { useI18n } from "../lib/i18n";
import {
  getLocalStarStatus,
  renameLocalSkill,
  shouldUseLocalBackend,
  toggleLocalStar,
  type LocalSkillDetailData,
} from "../lib/localBackend";
import { getLocalBackendOrigin } from "../lib/runtimeEnv";
import { useAuthStatus } from "../lib/useAuthStatus";
import { LocalSkillDetailTabs } from "./LocalSkillDetailTabs";
import { buildSkillHref } from "./skillDetailUtils";
import { UserBadge } from "./UserBadge";

type LocalSkillDetailPageProps = {
  slug: string;
  canonicalOwner?: string;
  data: LocalSkillDetailData | null;
};

export function LocalSkillDetailPage({ slug, canonicalOwner, data }: LocalSkillDetailPageProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, me } = useAuthStatus();
  const [isStarred, setIsStarred] = useState(false);
  const [isUpdatingStar, setIsUpdatingStar] = useState(false);
  const [renameSlug, setRenameSlug] = useState(data?.resolvedSlug ?? slug);
  const [isRenaming, setIsRenaming] = useState(false);
  const backendOrigin = getLocalBackendOrigin() ?? "";

  const latestVersion = data?.latestVersion?.version ?? null;
  const downloadHref =
    latestVersion && backendOrigin
      ? `${backendOrigin}/api/v1/download?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(latestVersion)}`
      : null;

  const ownerLabel = canonicalOwner ?? data?.ownerProfile?.handle ?? data?.owner ?? null;
  const ownerProfile = useMemo(() => data?.ownerProfile ?? null, [data?.ownerProfile]);
  const [starCount, setStarCount] = useState(data?.skill?.stats.stars ?? 0);
  const isOwner = Boolean(
    isAuthenticated &&
    me?.handle &&
    ownerProfile?.handle &&
    me.handle.trim().toLowerCase() === ownerProfile.handle.trim().toLowerCase(),
  );

  useEffect(() => {
    setStarCount(data?.skill?.stats.stars ?? 0);
  }, [data?.skill?.stats.stars]);

  useEffect(() => {
    setRenameSlug(data?.resolvedSlug ?? slug);
  }, [data?.resolvedSlug, slug]);

  useEffect(() => {
    if (!shouldUseLocalBackend() || !isAuthenticated || !data?.skill) {
      setIsStarred(false);
      return;
    }

    let cancelled = false;
    void getLocalStarStatus(data.skill.slug)
      .then((result) => {
        if (!cancelled) setIsStarred(result.starred);
      })
      .catch(() => {
        if (!cancelled) setIsStarred(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data?.skill, isAuthenticated]);

  if (!data?.skill) {
    return (
      <main className="section">
        <div className="card">
          <h1 className="section-title" style={{ marginTop: 0 }}>
            {t("localSkill.notFound")}
          </h1>
          <p className="section-subtitle">{t("localSkill.notFoundSubtitle")}</p>
          <Link to="/skills" className="btn" style={{ marginTop: 16 }}>
            {t("localSkill.backToSkills")}
          </Link>
        </div>
      </main>
    );
  }

  const handleToggleStar = async () => {
    if (!data?.skill || !isAuthenticated || isUpdatingStar) return;
    setIsUpdatingStar(true);
    try {
      const result = await toggleLocalStar(data.skill.slug);
      setIsStarred(result.starred);
      setStarCount((current: number) => Math.max(0, current + (result.starred ? 1 : -1)));
    } finally {
      setIsUpdatingStar(false);
    }
  };

  const handleRename = async () => {
    if (!data?.skill || !isOwner || isRenaming) return;
    const nextSlug = renameSlug.trim().toLowerCase();
    if (!nextSlug || nextSlug === data.skill.slug) return;
    if (!window.confirm(t("localSkill.renameConfirm", { from: data.skill.slug, to: nextSlug })))
      return;
    setIsRenaming(true);
    try {
      const result = await renameLocalSkill(data.skill.slug, nextSlug);
      await navigate({
        to: "/$owner/$slug",
        params: {
          owner: ownerProfile?.handle ?? ownerLabel ?? "unknown",
          slug: result.slug,
        },
        replace: true,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to rename skill.");
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <main className="section">
      <div className="card skill-hero">
        <div className="skill-hero-top">
          <div className="skill-hero-header">
            <div className="skill-hero-title">
              <div className="skill-hero-title-row">
                <h1 className="section-title" style={{ margin: 0 }}>
                  {data.skill.displayName}
                </h1>
              </div>
              <p className="section-subtitle">{data.skill.summary ?? t("skill.noSummary")}</p>
              <div className="stat">
                <UserBadge
                  user={ownerProfile}
                  fallbackHandle={ownerLabel}
                  prefix={t("common.by")}
                  link={false}
                  showName
                />
              </div>
              <div className="stat">
                ★ {starCount} · ↓ {data.skill.stats.downloads}
              </div>
            </div>
            <div className="skill-hero-actions">
              {downloadHref ? (
                <a className="btn btn-primary" href={downloadHref}>
                  {t("localSkill.downloadLatest")}
                </a>
              ) : null}
              {isAuthenticated ? (
                <button
                  className={`star-toggle${isStarred ? " is-active" : ""}`}
                  type="button"
                  onClick={() => void handleToggleStar()}
                  aria-label={isStarred ? "Unstar skill" : "Star skill"}
                  disabled={isUpdatingStar}
                >
                  <span aria-hidden="true">★</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="hero-install">
          <InstallSwitcher
            exampleSlug={data.skill.slug}
            registry={backendOrigin || null}
            title={t("localSkill.installCommand")}
            showCopy
          />
        </div>
      </div>
      {isOwner ? (
        <div className="card skill-owner-tools" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            {t("localSkill.ownerTools")}
          </h2>
          <p className="section-subtitle">{t("localSkill.ownerToolsSubtitle")}</p>
          <div className="skill-owner-tools-grid">
            <label className="management-control management-control-stack">
              <span className="mono">{t("localSkill.renameSlug")}</span>
              <input
                className="management-field"
                value={renameSlug}
                onChange={(event) => setRenameSlug(event.target.value)}
                placeholder={t("localSkill.renamePlaceholder")}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="section-subtitle">
                {t("localSkill.currentPage")}:{" "}
                {buildSkillHref(ownerProfile?.handle ?? ownerLabel ?? null, null, data.skill.slug)}
              </span>
            </label>
            <div className="management-control management-control-stack">
              <span className="mono">{t("localSkill.renameAction")}</span>
              <button
                className="btn management-action-btn"
                type="button"
                onClick={() => void handleRename()}
                disabled={isRenaming || renameSlug.trim().toLowerCase() === data.skill.slug}
              >
                {isRenaming ? t("localSkill.renaming") : t("localSkill.renameAndRedirect")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <LocalSkillDetailTabs slug={slug} data={data} />
    </main>
  );
}
