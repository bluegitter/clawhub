import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../lib/i18n";
import {
  deleteLocalSkillVersion,
  fetchLocalSkillFile,
  fetchLocalVersionDetail,
  setLocalSkillVersionTags,
  type LocalSkillDetailData,
} from "../lib/localBackend";
import { getLocalBackendOrigin } from "../lib/runtimeEnv";
import { useAuthStatus } from "../lib/useAuthStatus";
import { LocalSkillDiffCard } from "./LocalSkillDiffCard";
import { formatBytes, stripFrontmatter } from "./skillDetailUtils";

type LocalSkillDetailTabsProps = {
  slug: string;
  data: LocalSkillDetailData;
};

type TabKey = "files" | "compare" | "versions";

export function LocalSkillDetailTabs({ slug, data }: LocalSkillDetailTabsProps) {
  const { t, formatDateTime } = useI18n();
  const { isAuthenticated } = useAuthStatus();
  const [activeTab, setActiveTab] = useState<TabKey>("files");
  const [versions, setVersions] = useState(data.versions);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null);
  const [editingTagsVersion, setEditingTagsVersion] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [updatingTagsVersion, setUpdatingTagsVersion] = useState<string | null>(null);
  const backendOrigin = getLocalBackendOrigin() ?? "";

  useEffect(() => {
    setVersions(data.versions);
  }, [data.versions]);

  const latestFiles = data.latestVersion?.files ?? [];
  const readmeContent = data.readme ? stripFrontmatter(data.readme) : null;
  const tagsByVersion = useMemo(() => {
    const map = new Map<string, string[]>();
    const tagEntries = Object.entries((data.skill?.tags ?? {}) as Record<string, string>);
    for (const [tag, version] of tagEntries) {
      const current = map.get(version) ?? [];
      current.push(tag);
      map.set(version, current);
    }
    return map;
  }, [data.skill?.tags]);

  useEffect(() => {
    setSelectedPath(null);
    setFileContent(null);
    setFileError(null);
  }, [data.latestVersion?.version]);

  async function handleDeleteVersion(version: string) {
    if (!isAuthenticated || deletingVersion) return;
    if (!window.confirm(`Delete version ${version}?`)) return;
    setDeletingVersion(version);
    try {
      await deleteLocalSkillVersion(slug, version);
      setVersions((current) => current.filter((entry) => entry.version !== version));
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to delete version.");
    } finally {
      setDeletingVersion(null);
    }
  }

  async function handleSetTags(version: string) {
    if (!isAuthenticated || updatingTagsVersion) return;
    const nextTags = tagDraft
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    setUpdatingTagsVersion(version);
    try {
      await setLocalSkillVersionTags(slug, version, nextTags);
      setEditingTagsVersion(null);
      setTagDraft("");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update tags.");
    } finally {
      setUpdatingTagsVersion(null);
    }
  }

  function startEditingTags(version: string, currentTags: string[]) {
    setEditingTagsVersion(version);
    setTagDraft(currentTags.join(", "));
  }

  function cancelEditingTags() {
    setEditingTagsVersion(null);
    setTagDraft("");
  }

  useEffect(() => {
    if (!selectedPath || !data.latestVersion?.version) return;
    let cancelled = false;
    setIsLoadingFile(true);
    setFileError(null);
    void fetchLocalSkillFile(slug, data.latestVersion.version, selectedPath)
      .then((text) => {
        if (!cancelled) setFileContent(text);
      })
      .catch((error) => {
        if (!cancelled) {
          setFileContent(null);
          setFileError(error instanceof Error ? error.message : "Failed to load file");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.latestVersion?.version, selectedPath, slug]);

  return (
    <div className="card tab-card" style={{ marginTop: 16 }}>
      <div className="tab-header">
        <button
          className={`tab-button${activeTab === "files" ? " is-active" : ""}`}
          type="button"
          onClick={() => setActiveTab("files")}
        >
          {t("detail.files")}
        </button>
        <button
          className={`tab-button${activeTab === "compare" ? " is-active" : ""}`}
          type="button"
          onClick={() => setActiveTab("compare")}
        >
          {t("detail.compare")}
        </button>
        <button
          className={`tab-button${activeTab === "versions" ? " is-active" : ""}`}
          type="button"
          onClick={() => setActiveTab("versions")}
        >
          {t("detail.versions")}
        </button>
      </div>

      {activeTab === "files" ? (
        <div className="tab-body">
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <h2 className="section-title" style={{ fontSize: "1.2rem", margin: 0 }}>
                SKILL.md
              </h2>
              <p className="section-subtitle" style={{ margin: 0 }}>
                {t("detail.browseLatest")}
              </p>
            </div>
            <div className="markdown">
              {readmeContent ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeContent}</ReactMarkdown>
              ) : (
                <div className="stat">{data.readmeError ?? t("detail.noSkillMd")}</div>
              )}
            </div>
          </div>
          <div className="file-browser">
            <div className="file-list">
              <div className="file-list-header">
                <h3 className="section-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  {t("detail.files")}
                </h3>
                <span className="section-subtitle" style={{ margin: 0 }}>
                  {latestFiles.length}
                </span>
              </div>
              <LocalVersionFileList
                slug={slug}
                version={data.latestVersion?.version ?? null}
                latestVersion={data.latestVersion?.version ?? null}
                latestFiles={latestFiles}
                selectedPath={selectedPath}
                onSelectPath={setSelectedPath}
              />
            </div>
            <div className="file-viewer">
              <div className="file-viewer-header">
                <div className="file-path">{selectedPath ?? t("common.selectFile")}</div>
              </div>
              <div className="file-viewer-body">
                {isLoadingFile ? (
                  <div className="stat">{t("common.loading")}</div>
                ) : fileError ? (
                  <div className="stat">{fileError}</div>
                ) : fileContent ? (
                  <pre className="file-viewer-code">{fileContent}</pre>
                ) : (
                  <div className="stat">{t("common.selectToPreview")}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "compare" ? (
        <div className="tab-body">
          <LocalSkillDiffCard
            slug={slug}
            versions={versions}
            tags={(data.skill?.tags ?? {}) as Record<string, string>}
          />
        </div>
      ) : null}

      {activeTab === "versions" ? (
        <div className="tab-body">
          <div>
            <h2 className="section-title" style={{ fontSize: "1.2rem", margin: 0 }}>
              {t("detail.versions")}
            </h2>
            <p className="section-subtitle" style={{ margin: 0 }}>
              {t("detail.downloadOlder")}
            </p>
          </div>
          <div className="version-scroll">
            <div className="version-list">
              {versions.map((version) => {
                const zipHref = backendOrigin
                  ? `${backendOrigin}/api/v1/download?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version.version)}`
                  : null;
                const tags = tagsByVersion.get(version.version) ?? [];
                return (
                  <div key={version.id} className="version-row">
                    <div className="version-info">
                      <div>
                        {`v${version.version} · ${formatDateTime(version.createdAt)}`}
                        {tags.length ? (
                          <span
                            style={{ color: "var(--ink-soft)" }}
                          >{` · ${tags.join(", ")}`}</span>
                        ) : null}
                      </div>
                      <div className="version-meta-inline">
                        <span>{t("detail.filesCount", { count: version.fileCount })}</span>
                        <span>{formatBytes(version.fileSize)}</span>
                        {version.version === data.latestVersion?.version ? (
                          <span>{t("common.latest")}</span>
                        ) : null}
                      </div>
                      <div style={{ color: "#5c554e", whiteSpace: "pre-wrap" }}>
                        {version.changelog || t("detail.noChangelog")}
                      </div>
                      {editingTagsVersion === version.version ? (
                        <div className="version-tag-editor">
                          <input
                            className="form-input"
                            value={tagDraft}
                            onChange={(event) => setTagDraft(event.target.value)}
                            placeholder={t("detail.tagPlaceholder")}
                          />
                          <div className="version-tag-editor-actions">
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void handleSetTags(version.version)}
                              disabled={updatingTagsVersion === version.version}
                            >
                              {updatingTagsVersion === version.version
                                ? t("detail.saving")
                                : t("detail.saveTags")}
                            </button>
                            <button type="button" className="btn" onClick={cancelEditingTags}>
                              {t("common.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {zipHref || isAuthenticated ? (
                      <div className="version-actions">
                        {zipHref ? (
                          <a className="btn version-zip" href={zipHref}>
                            {t("detail.zip")}
                          </a>
                        ) : null}
                        {isAuthenticated ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => startEditingTags(version.version, tags)}
                            disabled={updatingTagsVersion === version.version}
                          >
                            {editingTagsVersion === version.version
                              ? t("detail.editingTags")
                              : t("detail.setTags")}
                          </button>
                        ) : null}
                        {isAuthenticated ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void handleDeleteVersion(version.version)}
                            disabled={deletingVersion === version.version || versions.length <= 1}
                          >
                            {deletingVersion === version.version
                              ? t("detail.deleting")
                              : t("common.delete")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LocalVersionFileList({
  slug,
  version,
  latestVersion,
  latestFiles,
  selectedPath,
  onSelectPath,
}: {
  slug: string;
  version: string | null;
  latestVersion: string | null;
  latestFiles: Array<{
    path: string;
    size: number;
    sha256: string | null;
    contentType: string | null;
  }>;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
}) {
  const [files, setFiles] = useState(latestFiles);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!version || version === latestVersion) {
      setFiles(latestFiles);
      setError(null);
      return;
    }
    let cancelled = false;
    void fetchLocalVersionDetail(slug, version)
      .then((detail) => {
        if (!cancelled) {
          setFiles(detail?.files ?? []);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setFiles([]);
          setError(loadError instanceof Error ? loadError.message : "Failed to load file list.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [latestFiles, latestVersion, slug, version]);

  useEffect(() => {
    if (selectedPath && files.some((file) => file.path === selectedPath)) return;
    onSelectPath(files[0]?.path ?? null);
  }, [files, onSelectPath, selectedPath]);

  return (
    <div className="file-list-body">
      {error ? (
        <div className="stat">{error}</div>
      ) : files.length === 0 ? (
        <div className="stat">No files available.</div>
      ) : (
        files.map((file) => (
          <button
            key={file.path}
            className={`file-row file-row-button${selectedPath === file.path ? " is-active" : ""}`}
            type="button"
            onClick={() => onSelectPath(file.path)}
          >
            <span className="file-path">{file.path}</span>
            <span className="file-meta">{formatBytes(file.size)}</span>
          </button>
        ))
      )}
    </div>
  );
}
