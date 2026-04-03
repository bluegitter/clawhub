import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/import")({
  component: ImportGitHub,
});

export function ImportGitHub() {
  return (
    <main className="section upload-shell">
      <div className="upload-header">
        <div>
          <div className="upload-kicker">GitHub import</div>
          <h1 className="upload-title">Import from GitHub</h1>
          <p className="upload-subtitle">
            The old GitHub import flow depended on removed Convex actions and has not been migrated to
            the local backend yet.
          </p>
        </div>
        <div className="upload-badge">
          <div>Not migrated</div>
          <div className="upload-badge-sub">Use local publish for now</div>
        </div>
      </div>

      <div className="upload-card">
        <p className="section-subtitle" style={{ marginTop: 0 }}>
          For now, clone the GitHub repository locally, prepare the skill files, and publish from the
          local folder instead.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/publish-skill" search={{ updateSlug: undefined }} className="btn btn-primary">
            Open Publish Skill
          </Link>
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: "downloads",
              dir: undefined,
              highlighted: undefined,
              nonSuspicious: true,
              view: undefined,
              focus: undefined,
            }}
            className="btn"
          >
            Browse skills
          </Link>
        </div>
      </div>
    </main>
  );
}
