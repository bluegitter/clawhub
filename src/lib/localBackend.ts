import type { Doc } from "../../convex/_generated/dataModel";
import type { PublicPublisher, PublicSkill } from "./publicUser";
import { getAppOrigin, getLocalBackendOrigin } from "./runtimeEnv";
import type { SkillVersionSummary } from "../routes/skills/-types";

const LOCAL_SESSION_STORAGE_KEY = "clawhub.local_session";

type LocalSkillListResponse = {
  items: Array<{
    slug: string;
    displayName: string;
    summary: string | null;
    tags: unknown;
    stats: unknown;
    createdAt: number;
    updatedAt: number;
    latestVersion?: {
      version: string;
      createdAt: number;
      changelog: string;
      license: "MIT-0" | null;
    };
  }>;
  nextCursor: string | null;
};

type LocalSkillResponse = {
  skill: {
    slug: string;
    displayName: string;
    summary: string | null;
    tags: unknown;
    stats: unknown;
    createdAt: number;
    updatedAt: number;
  } | null;
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
    license: "MIT-0" | null;
  } | null;
  owner: {
    handle: string | null;
    displayName: string | null;
    image: string | null;
  } | null;
};

type LocalVersionListResponse = {
  items: Array<{
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource: "auto" | "user" | null;
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
    slug?: string;
    displayName?: string;
    summary?: string | null;
    version?: string | null;
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

export type LocalAuthUser = Doc<"users">;

export type LocalSkillDetailData = {
  owner: string | null;
  displayName: string | null;
  summary: string | null;
  version: string | null;
  skill: PublicSkill | null;
  ownerProfile: PublicPublisher | null;
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource?: "auto" | "user" | null;
    files: Array<{
      path: string;
      size: number;
      sha256: string | null;
      contentType: string | null;
    }>;
  } | null;
  versions: Array<{
    version: string;
    createdAt: number;
    changelog: string;
    changelogSource?: "auto" | "user" | null;
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
}) {
  const backend = requireLocalBackendOrigin();
  if (params.query?.trim()) {
    const url = new URL("/api/v1/search", backend);
    url.searchParams.set("q", params.query.trim());
    url.searchParams.set("limit", String(params.limit ?? 25));
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Failed to search skills (${response.status})`);
    const data = (await response.json()) as LocalSearchResponse;
    return {
      items: data.results.map((entry, index) =>
        toLocalListEntry({
          slug: entry.slug ?? `unknown-${index}`,
          displayName: entry.displayName ?? entry.slug ?? "Unknown skill",
          summary: entry.summary ?? null,
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
    };
  }

  const url = new URL("/api/v1/skills", backend);
  url.searchParams.set("limit", String(params.limit ?? 25));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Failed to load skills (${response.status})`);
  const data = (await response.json()) as LocalSkillListResponse;
  return {
    items: data.items.map((entry) => toLocalListEntry(entry)),
    nextCursor: data.nextCursor,
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
          version: latest.version.version,
          createdAt: latest.version.createdAt,
          changelog: latest.version.changelog,
          changelogSource: latest.version.changelogSource,
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
    slug: detail.skill.slug,
    displayName: detail.skill.displayName,
    summary: detail.skill.summary,
    createdAt: detail.skill.createdAt,
    updatedAt: detail.skill.updatedAt,
    latestVersion: detail.latestVersion?.version,
    ownerHandle: detail.owner?.handle ?? null,
  });

  const ownerProfile = detail.owner
    ? toPublicPublisher({
        handle: detail.owner.handle,
        displayName: detail.owner.displayName,
        image: detail.owner.image,
      })
    : null;

  return {
    owner: detail.owner?.handle ?? detail.owner?.displayName ?? null,
    displayName: detail.skill.displayName,
    summary: detail.skill.summary,
    version: detail.latestVersion?.version ?? null,
    skill,
    ownerProfile,
    latestVersion,
    versions: versions.items.map((entry) => ({
      version: entry.version,
      createdAt: entry.createdAt,
      changelog: entry.changelog,
      changelogSource: entry.changelogSource,
    })),
    readme,
    readmeError,
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
      slug: entry.slug,
      displayName: entry.displayName,
      summary: entry.summary,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      latestVersion: entry.latestVersion?.version,
      ownerHandle: null,
    }),
    latestVersion: entry.latestVersion
      ? {
          version: entry.latestVersion.version,
          createdAt: entry.latestVersion.createdAt,
          changelog: entry.latestVersion.changelog,
          changelogSource: null,
        }
      : null,
    ownerHandle: null,
    owner: null,
    searchScore,
  };
}

function toPublicSkill(params: {
  slug: string;
  displayName: string;
  summary: string | null;
  createdAt: number;
  updatedAt: number;
  latestVersion?: string | null;
  ownerHandle?: string | null;
}): PublicSkill {
  return {
    _id: `local-skill:${params.slug}`,
    _creationTime: params.createdAt,
    slug: params.slug,
    displayName: params.displayName,
    summary: params.summary,
    ownerUserId: params.ownerHandle ?? "local-user",
    ownerPublisherId: undefined,
    canonicalSkillId: undefined,
    forkOf: undefined,
    latestVersionId: params.latestVersion ? `local-version:${params.slug}:${params.latestVersion}` : undefined,
    tags: {},
    badges: {},
    stats: {
      stars: 0,
      downloads: 0,
      installsCurrent: 0,
      installsAllTime: 0,
    },
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  } as PublicSkill;
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
