import { useCallback, useEffect, useMemo, useState } from "react";
import { listLocalStarredSkills, shouldUseLocalBackend, toggleLocalStar } from "./localBackend";
import { useAuthStatus } from "./useAuthStatus";

export function useLocalStars() {
  const { isAuthenticated } = useAuthStatus();
  const [starredSlugs, setStarredSlugs] = useState<string[]>([]);
  const starredSet = useMemo(() => new Set(starredSlugs), [starredSlugs]);

  useEffect(() => {
    if (!shouldUseLocalBackend() || !isAuthenticated) {
      setStarredSlugs([]);
      return;
    }

    let cancelled = false;
    void listLocalStarredSkills()
      .then((items) => {
        if (!cancelled) setStarredSlugs(items.map((entry) => entry.skill.slug));
      })
      .catch(() => {
        if (!cancelled) setStarredSlugs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const toggle = useCallback(async (slug: string) => {
    const result = await toggleLocalStar(slug);
    setStarredSlugs((current) => {
      const next = new Set(current);
      if (result.starred) next.add(slug);
      else next.delete(slug);
      return Array.from(next);
    });
    return result;
  }, []);

  return {
    isAuthenticated,
    starredSet,
    toggle,
  };
}
