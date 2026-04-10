import type { Doc } from "../../convex/_generated/dataModel";
import type { PublicPublisher, PublicSkill } from "./publicUser";
import { getAppOrigin, getLocalBackendOrigin } from "./runtimeEnv";
import type { SkillVersionSummary } from "../routes/skills/-types";

const LOCAL_SESSION_STORAGE_KEY = "clawhub.local_session";

type LocalSkillListResponse = {
  items: Array<{
    id?: string;
    slug: string;
    displayName: string;
    summary: string | null;
    tags: unknown;
    labels?: unknown;
    stats?: unknown;
    createdAt: number;
    updatedAt: number;
    owner?: {
      handle: string | null;
      displayName: string | null;
      image: string | null;
    } | null;
    latestVersion?: {
      version: string;
      createdAt: number;
      changelog: string;
      license: "MIT-0" | null;
    };
  }>;
  nextCursor: string | null;
  totalCount?: number;
};

type LocalSkillResponse = {
  skill: {
    id?: string;
    slug: string;
    displayName: string;
    summary: string | null;
    tags: unknown;
    labels?: unknown;
    stats?: unknown;
    createdAt: number;
    updatedAt: number;
  } | null;
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
    license: "MIT-0" | null;
    fileCount?: number;
    fileSize?: number;
  } | null;
  owner: {
    handle: string | null;
    displayName: string | null;
    image: string | null;
  } | null;
  requestedSlug?: string | null;
  resolvedSlug?: string | null;
};

type LocalVersionListResponse = {
  items: Array<{
    id?: string;
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource: "auto" | "user" | null;
    fileCount?: number;
    fileSize?: number;
  }>;
  nextCursor: string | null;
};

type LocalVersionDetailResponse = {
  version: {
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource: "auto" | "user" | null;
    license: "MIT-0" | null;
    fileCount?: number;
    fileSize?: number;
    files?: Array<{
      path: string;
      size: number;
      sha256: string | null;
      contentType: string | null;
    }>;
  } | null;
  skill: {
    slug: string;
    displayName: string;
  } | null;
};

type LocalSearchResponse = {
  results: Array<{
    id?: string;
    slug?: string;
    displayName?: string;
    summary?: string | null;
    version?: string | null;
    tags?: unknown;
    labels?: unknown;
    stats?: unknown;
    owner?: {
      handle: string | null;
      displayName: string | null;
      image: string | null;
    } | null;
    score: number;
    updatedAt?: number;
  }>;
};

export type LocalSkillListEntry = {
  skill: PublicSkill;
  latestVersion: SkillVersionSummary | null;
  ownerHandle?: string | null;
  owner?: PublicPublisher | null;
  searchScore?: number;
};

type LocalWhoAmIResponse = {
  user: {
    id: string;
    username: string;
    realName: string | null;
    email: string | null;
    phone: string | null;
    image: string | null;
  };
};

export type LocalApiTokenSummary = {
  id: string;
  label: string;
  prefix: string;
  createdAt: number;
};

type LocalApiTokensResponse = {
  tokens: LocalApiTokenSummary[];
};

export type LocalApiTokenCreateResponse = {
  token: string;
  meta: LocalApiTokenSummary;
};

export type LocalStarredSkillEntry = {
  starredAt: number;
  skill: PublicSkill;
  owner: PublicPublisher | null;
  ownerHandle: string | null;
};

type LocalStarsResponse = {
  items: Array<{
    starredAt: number;
    skill: {
      id: string;
      slug: string;
      displayName: string;
      summary: string | null;
      latestVersion: string | null;
      tags: unknown;
      labels?: unknown;
      stats?: unknown;
      updatedAt: number;
    };
    owner: {
      id: string;
      handle: string | null;
      displayName: string | null;
      image: string | null;
    } | null;
  }>;
};

export type LocalAuthUser = Doc<"users">;

export type LocalSkillDetailData = {
  requestedSlug: string | null;
  resolvedSlug: string | null;
  owner: string | null;
  displayName: string | null;
  summary: string | null;
  version: string | null;
  skill: PublicSkill | null;
  ownerProfile: PublicPublisher | null;
  latestVersion: {
    id: string;
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource?: "auto" | "user" | null;
    fileCount: number;
    fileSize: number;
    files: Array<{
      path: string;
      size: number;
      sha256: string | null;
      contentType: string | null;
    }>;
  } | null;
  versions: Array<{
    id: string;
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource?: "auto" | "user" | null;
    fileCount: number;
    fileSize: number;
  }>;
  readme: string | null;
  readmeError: string | null;
};

export function shouldUseLocalBackend() {
  return Boolean(getLocalBackendOrigin());
}

export async function fetchLocalSkillsList(params: {
  cursor?: string | null;
  limit?: number;
  query?: string;
  label?: string;
  sort?: "newest" | "downloads" | "installs" | "stars" | "name" | "updated";
  dir?: "asc" | "desc";
}) {
  const backend = requireLocalBackendOrigin();
  if (params.query?.trim()) {
    const url = new URL("/api/v1/search", backend);
    url.searchParams.set("q", params.query.trim());
    url.searchParams.set("limit", String(params.limit ?? 25));
    if (params.label?.trim()) url.searchParams.set("label", params.label.trim().toLowerCase());
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Failed to search skills (${response.status})`);
    const data = (await response.json()) as LocalSearchResponse;
    return {
      items: data.results.map((entry, index) =>
        toLocalListEntry({
          id: entry.id,
          slug: entry.slug ?? `unknown-${index}`,
          displayName: entry.displayName ?? entry.slug ?? "Unknown skill",
          summary: entry.summary ?? null,
          tags: entry.tags,
          labels: entry.labels,
          stats: entry.stats,
          owner: entry.owner ?? null,
          ownerHandle: entry.owner?.handle ?? null,
          createdAt: entry.updatedAt ?? Date.now(),
          updatedAt: entry.updatedAt ?? Date.now(),
          latestVersion: entry.version
            ? {
                version: entry.version,
                createdAt: entry.updatedAt ?? Date.now(),
                changelog: "",
                license: null,
              }
            : undefined,
        }, entry.score),
      ),
      nextCursor: null,
      totalCount: data.results.length,
    };
  }

  const url = new URL("/api/v1/skills", backend);
  url.searchParams.set("limit", String(params.limit ?? 25));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  if (params.label?.trim()) url.searchParams.set("label", params.label.trim().toLowerCase());
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.dir) url.searchParams.set("dir", params.dir);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Failed to load skills (${response.status})`);
  const data = (await response.json()) as LocalSkillListResponse;
  return {
    items: data.items.map((entry) => toLocalListEntry(entry)),
    nextCursor: data.nextCursor,
    totalCount: data.totalCount ?? data.items.length,
  };
}

export async function fetchLocalSkillDetail(slug: string): Promise<LocalSkillDetailData | null> {
  const backend = requireLocalBackendOrigin();
  const detailUrl = new URL(`/api/v1/skills/${encodeURIComponent(slug)}`, backend);
  const detailResponse = await fetch(detailUrl.toString());
  if (detailResponse.status === 404) return null;
  if (!detailResponse.ok) throw new Error(`Failed to load skill (${detailResponse.status})`);
  const detail = (await detailResponse.json()) as LocalSkillResponse;
  if (!detail.skill) return null;

  const versionsUrl = new URL(`/api/v1/skills/${encodeURIComponent(slug)}/versions`, backend);
  versionsUrl.searchParams.set("limit", "100");
  const versionsResponse = await fetch(versionsUrl.toString());
  if (!versionsResponse.ok) throw new Error(`Failed to load versions (${versionsResponse.status})`);
  const versions = (await versionsResponse.json()) as LocalVersionListResponse;

  const latestVersionValue = detail.latestVersion?.version ?? versions.items[0]?.version ?? null;
  let latestVersion: LocalSkillDetailData["latestVersion"] = null;
  let readme: string | null = null;
  let readmeError: string | null = null;

  if (latestVersionValue) {
    const latestVersionUrl = new URL(
      `/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(latestVersionValue)}`,
      backend,
    );
    const latestVersionResponse = await fetch(latestVersionUrl.toString());
    if (latestVersionResponse.ok) {
      const latest = (await latestVersionResponse.json()) as LocalVersionDetailResponse;
      if (latest.version) {
        latestVersion = {
          id: `${slug}:${latest.version.version}`,
          version: latest.version.version,
          createdAt: latest.version.createdAt,
          changelog: latest.version.changelog,
          changelogSource: latest.version.changelogSource,
          fileCount: latest.version.fileCount ?? latest.version.files?.length ?? 0,
          fileSize: latest.version.fileSize ?? 0,
          files: latest.version.files ?? [],
        };
      }
    }

    const readmeCandidates = ["SKILL.md", "skills.md"];
    for (const candidate of readmeCandidates) {
    const readmeUrl = new URL(`/api/v1/skills/${encodeURIComponent(slug)}/file`, backend);
      readmeUrl.searchParams.set("path", candidate);
      readmeUrl.searchParams.set("version", latestVersionValue);
      const readmeResponse = await fetch(readmeUrl.toString());
      if (readmeResponse.ok) {
        readme = await readmeResponse.text();
        readmeError = null;
        break;
      }
      readmeError = `Failed to load ${candidate}`;
    }
  }

  const skill = toPublicSkill({
    id: detail.skill.id,
    slug: detail.skill.slug,
    displayName: detail.skill.displayName,
    summary: detail.skill.summary,
    createdAt: detail.skill.createdAt,
    updatedAt: detail.skill.updatedAt,
    latestVersion: detail.latestVersion?.version,
    ownerHandle: detail.owner?.handle ?? null,
    versionTags: normalizeTagMap(detail.skill.tags),
    labels: normalizeStringArray(detail.skill.labels),
    stats: normalizeStats(detail.skill.stats),
  });

  const ownerProfile = detail.owner
    ? toPublicPublisher({
        handle: detail.owner.handle,
        displayName: detail.owner.displayName,
        image: detail.owner.image,
      })
    : null;

  return {
    requestedSlug: detail.requestedSlug ?? slug,
    resolvedSlug: detail.resolvedSlug ?? detail.skill.slug,
    owner: detail.owner?.handle ?? detail.owner?.displayName ?? null,
    displayName: detail.skill.displayName,
    summary: detail.skill.summary,
    version: detail.latestVersion?.version ?? null,
    skill,
    ownerProfile,
    latestVersion,
    versions: versions.items.map((entry) => ({
      id: entry.id ?? `${slug}:${entry.version}`,
      version: entry.version,
      createdAt: entry.createdAt,
      changelog: entry.changelog,
      changelogSource: entry.changelogSource,
      fileCount: entry.fileCount ?? 0,
      fileSize: entry.fileSize ?? 0,
    })),
    readme,
    readmeError,
  };
}

export async function fetchLocalVersionDetail(slug: string, version: string) {
  const backend = requireLocalBackendOrigin();
  const url = new URL(
    `/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`,
    backend,
  );
  const response = await fetch(url.toString());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load version (${response.status})`);
  const detail = (await response.json()) as LocalVersionDetailResponse;
  if (!detail.version) return null;
  return {
    id: `${slug}:${detail.version.version}`,
    version: detail.version.version,
    createdAt: detail.version.createdAt,
    changelog: detail.version.changelog,
    changelogSource: detail.version.changelogSource,
    fileCount: detail.version.fileCount ?? detail.version.files?.length ?? 0,
    fileSize: detail.version.fileSize ?? 0,
    files: detail.version.files ?? [],
  };
}

export async function fetchLocalSkillFile(slug: string, version: string, path: string) {
  const backend = requireLocalBackendOrigin();
  const url = new URL(`/api/v1/skills/${encodeURIComponent(slug)}/file`, backend);
  url.searchParams.set("path", path);
  url.searchParams.set("version", version);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Failed to load file (${response.status})`);
  return response.text();
}

export async function fetchLocalWhoAmI(): Promise<LocalAuthUser | null> {
  const backend = requireLocalBackendOrigin();
  const headers = buildLocalAuthHeaders();
  const response = await fetch(new URL("/auth/me", backend).toString(), {
    credentials: "include",
    headers,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Failed to load current user (${response.status})`);
  const data = (await response.json()) as LocalWhoAmIResponse;
  return {
    _id: data.user.id,
    _creationTime: Date.now(),
    handle: data.user.username,
    name: data.user.realName ?? undefined,
    displayName: data.user.realName ?? undefined,
    email: data.user.email ?? undefined,
    image: data.user.image ?? undefined,
    role: "user",
  } as Doc<"users">;
}

export async function listLocalApiTokens(): Promise<LocalApiTokenSummary[]> {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL("/auth/tokens", backend).toString(), {
    credentials: "include",
    headers: buildLocalAuthHeaders(),
  });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`Failed to load API tokens (${response.status})`);
  const data = (await response.json()) as LocalApiTokensResponse;
  return data.tokens;
}

export async function createLocalApiToken(label: string): Promise<LocalApiTokenCreateResponse> {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL("/auth/tokens", backend).toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(buildLocalAuthHeaders() ?? {}),
    },
    body: JSON.stringify({ label }),
  });
  if (!response.ok) throw new Error(`Failed to create API token (${response.status})`);
  return (await response.json()) as LocalApiTokenCreateResponse;
}

export async function revokeLocalApiToken(id: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL(`/auth/tokens/${encodeURIComponent(id)}`, backend).toString(), {
    method: "DELETE",
    credentials: "include",
    headers: buildLocalAuthHeaders(),
  });
  if (!response.ok) throw new Error(`Failed to revoke API token (${response.status})`);
}

export async function listLocalStarredSkills(): Promise<LocalStarredSkillEntry[]> {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL("/api/v1/stars", backend).toString(), {
    credentials: "include",
    headers: buildLocalAuthHeaders(),
  });
  if (response.status === 401) return [];
  if (!response.ok) throw new Error(`Failed to load starred skills (${response.status})`);
  const data = (await response.json()) as LocalStarsResponse;
  return data.items.map((entry) => ({
    starredAt: entry.starredAt,
    skill: toPublicSkill({
      id: entry.skill.id,
      slug: entry.skill.slug,
      displayName: entry.skill.displayName,
      summary: entry.skill.summary,
      createdAt: entry.starredAt,
      updatedAt: entry.skill.updatedAt,
      latestVersion: entry.skill.latestVersion,
      ownerHandle: entry.owner?.handle ?? null,
      versionTags: normalizeTagMap(entry.skill.tags),
      labels: normalizeStringArray(entry.skill.labels),
      stats: normalizeStats(entry.skill.stats),
    }),
    owner: entry.owner
      ? toPublicPublisher({
          handle: entry.owner.handle,
          displayName: entry.owner.displayName,
          image: entry.owner.image,
        })
      : null,
    ownerHandle: entry.owner?.handle ?? null,
  }));
}

export async function toggleLocalStar(slug: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(
    new URL(`/api/v1/stars/${encodeURIComponent(slug)}/toggle`, backend).toString(),
    {
      method: "POST",
      credentials: "include",
      headers: buildLocalAuthHeaders(),
    },
  );
  if (!response.ok) throw new Error(`Failed to update star state (${response.status})`);
  return (await response.json()) as { starred: boolean };
}

export async function getLocalStarStatus(slug: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(
    new URL(`/api/v1/stars/${encodeURIComponent(slug)}/status`, backend).toString(),
    {
      credentials: "include",
      headers: buildLocalAuthHeaders(),
    },
  );
  if (response.status === 401) return { starred: false };
  if (!response.ok) throw new Error(`Failed to load star state (${response.status})`);
  return (await response.json()) as { starred: boolean };
}

export async function logoutLocalUser() {
  const backend = requireLocalBackendOrigin();
  await fetch(new URL("/auth/logout", backend).toString(), {
    method: "POST",
    credentials: "include",
    headers: buildLocalAuthHeaders(),
  });
  clearLocalSessionToken();
}

export function getLocalAuthLoginUrl(redirectUri?: string) {
  const backend = requireLocalBackendOrigin();
  const url = new URL("/auth/login", backend);
  url.searchParams.set("redirect_uri", redirectUri ?? `${getAppOrigin()}/`);
  return url.toString();
}

export function getLocalAuthLogoutUrl(redirectUri?: string) {
  const backend = requireLocalBackendOrigin();
  const url = new URL("/auth/logout", backend);
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function checkLocalSlugAvailability(slug: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(
    new URL(`/api/v1/skills/${encodeURIComponent(slug)}/availability`, backend).toString(),
    { credentials: "include", headers: buildLocalAuthHeaders() },
  );
  if (!response.ok) throw new Error(`Failed to check slug (${response.status})`);
  const data = (await response.json()) as { available: boolean };
  return {
    available: data.available,
    reason: data.available ? "available" : "taken",
    message: data.available ? null : "This slug is already taken.",
    url: null,
  } as const;
}

export async function publishLocalSkill(params: {
  slug: string;
  displayName: string;
  version: string;
  changelog: string;
  tags: string[];
  labels: string[];
  files: Array<{ path: string; file: File }>;
}) {
  const backend = requireLocalBackendOrigin();
  const formData = new FormData();
  formData.append(
    "payload",
    JSON.stringify({
      slug: params.slug,
      displayName: params.displayName,
      version: params.version,
      changelog: params.changelog,
      tags: params.tags,
      labels: params.labels,
    }),
  );
  params.files.forEach((entry, index) => {
    formData.append(`files[${index}]`, entry.file, entry.path);
  });

  const response = await fetch(new URL("/api/v1/skills", backend).toString(), {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: buildLocalAuthHeaders(),
  });

  if (!response.ok) {
    try {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || `Publish failed (${response.status})`);
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error(`Publish failed (${response.status})`);
    }
  }

  return (await response.json()) as { ok: true; skillId: string; versionId: string };
}

export async function deleteLocalSkill(slug: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL(`/api/v1/skills/${encodeURIComponent(slug)}`, backend).toString(), {
    method: "DELETE",
    credentials: "include",
    headers: buildLocalAuthHeaders(),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Delete failed (${response.status})`);
  }
}

export async function deleteLocalSkillVersion(slug: string, version: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(
    new URL(`/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`, backend).toString(),
    {
      method: "DELETE",
      credentials: "include",
      headers: buildLocalAuthHeaders(),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Delete failed (${response.status})`);
  }
}

export async function setLocalSkillVersionTags(slug: string, version: string, tags: string[]) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(
    new URL(`/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/tags`, backend).toString(),
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...buildLocalAuthHeaders(),
      },
      body: JSON.stringify({ tags }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Update tags failed (${response.status})`);
  }
  return (await response.json()) as { ok: true; tags: Record<string, string> };
}

export async function fetchLocalSkillLabels() {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL("/api/v1/skills/labels", backend).toString());
  if (!response.ok) throw new Error(`Failed to load skill labels (${response.status})`);
  const data = (await response.json()) as { items: Array<{ label: string; count: number }> };
  return data.items;
}

export async function setLocalSkillLabels(slug: string, labels: string[]) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(new URL(`/api/v1/skills/${encodeURIComponent(slug)}/labels`, backend).toString(), {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(buildLocalAuthHeaders() ?? {}),
    },
    body: JSON.stringify({ labels }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Update labels failed (${response.status})`);
  }
  return (await response.json()) as { ok: true; labels: string[] };
}

export async function renameLocalSkill(slug: string, newSlug: string) {
  const backend = requireLocalBackendOrigin();
  const response = await fetch(
    new URL(`/api/v1/skills/${encodeURIComponent(slug)}/rename`, backend).toString(),
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...buildLocalAuthHeaders(),
      },
      body: JSON.stringify({ newSlug }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Rename failed (${response.status})`);
  }
  return (await response.json()) as { ok: true; previousSlug: string; slug: string };
}

function requireLocalBackendOrigin() {
  const backend = getLocalBackendOrigin();
  if (!backend) throw new Error("Local backend is not configured");
  return backend;
}

export function getLocalSessionToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLocalSessionToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, token);
    window.dispatchEvent(new CustomEvent("clawhub:local-session-changed"));
  } catch {
    // ignore storage errors
  }
}

export function clearLocalSessionToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("clawhub:local-session-changed"));
  } catch {
    // ignore storage errors
  }
}

function buildLocalAuthHeaders() {
  const token = getLocalSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function toLocalListEntry(
  entry: {
    slug: string;
    displayName: string;
    summary: string | null;
    tags?: unknown;
    labels?: unknown;
    stats?: unknown;
    id?: string;
    ownerHandle?: string | null;
    owner?: {
      handle: string | null;
      displayName: string | null;
      image: string | null;
    } | null;
    createdAt: number;
    updatedAt: number;
    latestVersion?: {
      version: string;
      createdAt: number;
      changelog: string;
      license: "MIT-0" | null;
    };
  },
  searchScore?: number,
): LocalSkillListEntry {
  return {
    skill: toPublicSkill({
      id: entry.id,
      slug: entry.slug,
      displayName: entry.displayName,
      summary: entry.summary,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      latestVersion: entry.latestVersion?.version,
      ownerHandle: entry.ownerHandle ?? entry.owner?.handle ?? null,
      versionTags: normalizeTagMap(entry.tags),
      labels: normalizeStringArray(entry.labels),
      stats: normalizeStats(entry.stats),
    }),
    latestVersion: entry.latestVersion
      ? {
          version: entry.latestVersion.version,
          createdAt: entry.latestVersion.createdAt,
          changelog: entry.latestVersion.changelog,
          changelogSource: null,
        }
      : null,
    ownerHandle: entry.ownerHandle ?? entry.owner?.handle ?? null,
    owner: entry.owner
      ? toPublicPublisher({
          handle: entry.owner.handle,
          displayName: entry.owner.displayName,
          image: entry.owner.image,
        })
      : null,
    searchScore,
  };
}

function toPublicSkill(params: {
  id?: string;
  slug: string;
  displayName: string;
  summary: string | null;
  createdAt: number;
  updatedAt: number;
  latestVersion?: string | null;
  ownerHandle?: string | null;
  versionTags?: Record<string, string>;
  labels?: string[];
  stats?: {
    stars: number;
    downloads: number;
    installsCurrent: number;
    installsAllTime: number;
    versions?: number;
  };
}): PublicSkill {
  return {
    _id: params.id ?? `local-skill:${params.slug}`,
    _creationTime: params.createdAt,
    slug: params.slug,
    displayName: params.displayName,
    summary: params.summary,
    ownerUserId: params.ownerHandle ?? "local-user",
    ownerPublisherId: undefined,
    canonicalSkillId: undefined,
    forkOf: undefined,
    latestVersionId: params.latestVersion ? `local-version:${params.slug}:${params.latestVersion}` : undefined,
    tags: params.versionTags ?? {},
    labels: params.labels ?? [],
    badges: {},
    stats: {
      stars: params.stats?.stars ?? 0,
      downloads: params.stats?.downloads ?? 0,
      installsCurrent: params.stats?.installsCurrent ?? 0,
      installsAllTime: params.stats?.installsAllTime ?? 0,
      versions: params.stats?.versions ?? 0,
    },
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  } as PublicSkill;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeTagMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

function normalizeStats(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    stars: typeof source.stars === "number" ? source.stars : 0,
    downloads: typeof source.downloads === "number" ? source.downloads : 0,
    installsCurrent: typeof source.installsCurrent === "number" ? source.installsCurrent : 0,
    installsAllTime: typeof source.installsAllTime === "number" ? source.installsAllTime : 0,
    versions: typeof source.versions === "number" ? source.versions : 0,
  };
}

function toPublicPublisher(params: {
  handle: string | null;
  displayName: string | null;
  image: string | null;
}): PublicPublisher {
  return {
    _id: `local-publisher:${params.handle ?? "unknown"}`,
    _creationTime: Date.now(),
    kind: "user",
    handle: params.handle,
    displayName: params.displayName,
    image: params.image,
    bio: undefined,
    linkedUserId: undefined,
  } as unknown as PublicPublisher;
}
