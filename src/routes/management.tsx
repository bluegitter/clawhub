import { createFileRoute } from "@tanstack/react-router";
import { isModerator } from "../lib/roles";
import { useAuthStatus } from "../lib/useAuthStatus";

export const Route = createFileRoute("/management")({
  validateSearch: (search) => ({
    skill: typeof search.skill === "string" && search.skill.trim() ? search.skill : undefined,
  }),
  component: Management,
});

function Management() {
  const { me, isLoading } = useAuthStatus();
  const staff = isModerator(me);

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">Loading management console…</div>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="section">
        <div className="card">Management only.</div>
      </main>
    );
  }

  return (
    <main className="section">
      <h1 className="section-title">Management console</h1>
      <p className="section-subtitle">
        Staff moderation, ownership transfer, reports, and curation tools have not been migrated to
        the local backend yet.
      </p>
      <div className="card">
        <div className="stat">Not yet available in local deployment:</div>
        <div className="stat">Reported skills review</div>
        <div className="stat">Duplicate/canonical management</div>
        <div className="stat">Owner transfer and moderation overrides</div>
        <div className="stat">User role and ban management</div>
      </div>
    </main>
  );
}
