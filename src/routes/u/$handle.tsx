import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SkillCard } from "../../components/SkillCard";
import { SkillStatsTripletLine } from "../../components/SkillStats";
import { getSkillBadges } from "../../lib/badges";
import { fetchLocalSkillsList, type LocalSkillListEntry } from "../../lib/localBackend";
import { useLocalStars } from "../../lib/useLocalStars";
import { useAuthStatus } from "../../lib/useAuthStatus";

export const Route = createFileRoute("/u/$handle")({
  component: UserProfile,
});

function UserProfile() {
  const { handle } = Route.useParams();
  const { me, isAuthenticated, isLoading } = useAuthStatus();
  const { starredSet, toggle } = useLocalStars();
  const [skills, setSkills] = useState<LocalSkillListEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLocalSkillsList({ limit: 500 })
      .then((result) => {
        if (cancelled) return;
        const normalizedHandle = handle.trim().toLowerCase();
        setSkills(
          result.items.filter(
            (entry) => (entry.ownerHandle ?? "").trim().toLowerCase() === normalizedHandle,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  const normalizedSelf = me?.handle?.trim().toLowerCase() ?? null;
  const isSelf = Boolean(isAuthenticated && normalizedSelf && normalizedSelf === handle.trim().toLowerCase());
  const displayName = isSelf ? me?.displayName ?? me?.name ?? handle : handle;
  const avatar = isSelf ? me?.image : undefined;
  const initial = displayName?.charAt(0).toUpperCase() ?? "U";

  if (isLoading || skills === null) {
    return (
      <main className="section">
        <div className="card">
          <div className="loading-indicator">Loading user…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="section">
      <div className="card settings-profile" style={{ marginBottom: 22 }}>
        <div className="settings-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
        </div>
        <div className="settings-profile-body">
          <div className="settings-name">{displayName}</div>
          <div className="settings-handle">@{handle}</div>
        </div>
      </div>

      <h2 className="section-title" style={{ fontSize: "1.3rem" }}>
        Published
      </h2>
      <p className="section-subtitle">Skills published by this user in the local registry.</p>

      {skills.length === 0 ? (
        <div className="card">No published skills found for this user.</div>
      ) : (
        <div className="grid" style={{ marginBottom: 18 }}>
          {skills.map((entry) => (
            <SkillCard
              key={entry.skill._id}
              skill={entry.skill}
              href={`/${encodeURIComponent(entry.ownerHandle ?? handle)}/${encodeURIComponent(entry.skill.slug)}`}
              badge={getSkillBadges(entry.skill)}
              summaryFallback="Agent-ready skill pack."
              meta={
                <div className="stat">
                  <SkillStatsTripletLine stats={entry.skill.stats} />
                </div>
              }
              extraActions={
                isAuthenticated ? (
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
          ))}
        </div>
      )}

      <h2 className="section-title" style={{ fontSize: "1.3rem" }}>
        Activity
      </h2>
      <div className="card">
        Install telemetry is not available yet in local mode.
      </div>
    </main>
  );
}
