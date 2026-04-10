const DOWNLOAD_COUNT_SESSION_KEY = "clawhub.download_count.v1";
const HOUR_IN_MS = 60 * 60 * 1000;

type DownloadCountStore = Record<string, number>;

function getCurrentHourBucket(now: number) {
  return Math.floor(now / HOUR_IN_MS);
}

function readStore(): DownloadCountStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DOWNLOAD_COUNT_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as DownloadCountStore;
  } catch {
    return {};
  }
}

function writeStore(store: DownloadCountStore) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DOWNLOAD_COUNT_SESSION_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage failures so downloads still work normally.
  }
}

export function recordDownloadCountClick(slug: string, version?: string | null, now = Date.now()) {
  if (typeof window === "undefined") return true;

  const hourBucket = getCurrentHourBucket(now);
  const entryKey = `${slug}:${version ?? "latest"}`;
  const store = readStore();

  for (const [key, bucket] of Object.entries(store)) {
    if (bucket !== hourBucket) delete store[key];
  }

  if (store[entryKey] === hourBucket) {
    writeStore(store);
    return false;
  }

  store[entryKey] = hourBucket;
  writeStore(store);
  return true;
}
