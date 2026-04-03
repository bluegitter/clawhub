import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchLocalSkillFile,
  getLocalStarStatus,
  shouldUseLocalBackend,
  toggleLocalStar,
  type LocalSkillDetailData,
} from "../lib/localBackend";
import { getLocalBackendOrigin } from "../lib/runtimeEnv";
import { useAuthStatus } from "../lib/useAuthStatus";
import { stripFrontmatter } from "./skillDetailUtils";
import { UserBadge } from "./UserBadge";

type LocalSkillDetailPageProps = {
  slug: string;
  canonicalOwner?: string;
  data: LocalSkillDetailData | null;
};

export function LocalSkillDetailPage({
  slug,
  canonicalOwner,
  data,
}: LocalSkillDetailPageProps) {
  const { isAuthenticated } = useAuthStatus();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [isUpdatingStar, setIsUpdatingStar] = useState(false);
  const backendOrigin = getLocalBackendOrigin() ?? "";

  const latestFiles = data?.latestVersion?.files ?? [];
  const latestVersion = data?.latestVersion?.version ?? null;
  const downloadHref =
    latestVersion && backendOrigin
      ? `${backendOrigin}/api/v1/download?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(latestVersion)}`
      : null;

  const ownerLabel = canonicalOwner ?? data?.ownerProfile?.handle ?? data?.owner ?? null;
  const ownerProfile = useMemo(() => data?.ownerProfile ?? null, [data?.ownerProfile]);
  const renderedReadme = useMemo(() => (data?.readme ? stripFrontmatter(data.readme) : null), [data?.readme]);
  const [starCount, setStarCount] = useState(data?.skill?.stats.stars ?? 0);

  useEffect(() => {
    setStarCount(data?.skill?.stats.stars ?? 0);
  }, [data?.skill?.stats.stars]);

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
            Skill not found
          </h1>
          <p className="section-subtitle">The requested skill is not available in the local registry.</p>
          <Link to="/skills" className="btn" style={{ marginTop: 16 }}>
            Back to skills
          </Link>
        </div>
      </main>
    );
  }

  const handleSelectFile = async (path: string) => {
    if (!latestVersion) return;
    setSelectedPath(path);
    setFileError(null);
    setIsLoadingFile(true);
    try {
      const text = await fetchLocalSkillFile(slug, latestVersion, path);
      setFileContent(text);
    } catch (error) {
      setFileContent(null);
      setFileError(error instanceof Error ? error.message : "Failed to load file");
    } finally {
      setIsLoadingFile(false);
    }
  };

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
              <p className="section-subtitle">{data.skill.summary ?? "No summary provided."}</p>
              <div className="stat">
                <UserBadge
                  user={ownerProfile}
                  fallbackHandle={ownerLabel}
                  prefix="by"
                  link={false}
                  showName
                />
              </div>
              <div className="stat">★ {starCount} · ↓ {data.skill.stats.downloads}</div>
            </div>
            <div className="skill-hero-actions">
              {downloadHref ? (
                <a className="btn btn-primary" href={downloadHref}>
                  Download latest
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

      <div className="card tab-card" style={{ marginTop: 16 }}>
        <div className="tab-body">
          <div>
            <h2 className="section-title" style={{ fontSize: "1.2rem", margin: 0 }}>
              SKILL.md
            </h2>
            <div className="markdown">
              {data.readme ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedReadme ?? data.readme}</ReactMarkdown>
              ) : data.readmeError ? (
                <div className="stat">{data.readmeError}</div>
              ) : (
                <div className="stat">No SKILL.md available.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card tab-card" style={{ marginTop: 16 }}>
        <div className="tab-body">
          <div className="file-browser">
            <div className="file-list">
              <div className="file-list-header">
                <h3 className="section-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  Files
                </h3>
                <span className="section-subtitle" style={{ margin: 0 }}>
                  {latestFiles.length} total
                </span>
              </div>
              <div className="file-list-body">
                {latestFiles.length === 0 ? (
                  <div className="stat">No files available.</div>
                ) : (
                  latestFiles.map((file) => (
                    <button
                      key={file.path}
                      className={`file-row file-row-button${selectedPath === file.path ? " is-active" : ""}`}
                      type="button"
                      onClick={() => void handleSelectFile(file.path)}
                    >
                      <span className="file-path">{file.path}</span>
                      <span className="file-meta">{file.size} B</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="file-viewer">
              <div className="file-viewer-header">
                <div className="file-path">{selectedPath ?? "Select a file"}</div>
              </div>
              <div className="file-viewer-body">
                {isLoadingFile ? (
                  <div className="stat">Loading…</div>
                ) : fileError ? (
                  <div className="stat">{fileError}</div>
                ) : fileContent ? (
                  <pre className="file-viewer-code">{fileContent}</pre>
                ) : (
                  <div className="stat">Select a file to preview.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card tab-card" style={{ marginTop: 16 }}>
        <div className="tab-body">
          <div>
            <h2 className="section-title" style={{ fontSize: "1.2rem", margin: 0 }}>
              Versions
            </h2>
            <p className="section-subtitle" style={{ margin: 0 }}>
              Download current or previous releases from the local registry.
            </p>
          </div>
          <div className="version-scroll">
            <div className="version-list">
              {data.versions.map((version) => {
                const zipHref = backendOrigin
                  ? `${backendOrigin}/api/v1/download?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version.version)}`
                  : null;
                return (
                  <div key={version.version} className="version-row">
                    <div className="version-info">
                      <div>v{version.version} · {new Date(version.createdAt).toLocaleString()}</div>
                      <div style={{ color: "#5c554e", whiteSpace: "pre-wrap" }}>{version.changelog}</div>
                    </div>
                    {zipHref ? (
                      <div className="version-actions">
                        <a className="btn version-zip" href={zipHref}>
                          Zip
                        </a>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
