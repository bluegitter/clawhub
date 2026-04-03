import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orgs/$handle")({
  component: OrgProfile,
});

function OrgProfile() {
  const { handle } = Route.useParams();

  return (
    <main className="section">
      <div className="card settings-profile" style={{ marginBottom: 22 }}>
        <div className="settings-avatar" aria-hidden="true">
          <span>{handle.charAt(0).toUpperCase()}</span>
        </div>
        <div className="settings-profile-body">
          <div className="settings-name">@{handle}</div>
          <div className="settings-handle">Organization profile</div>
        </div>
      </div>

      <div className="card">
        Organization publishers and member directories have not been migrated to the local backend yet.
      </div>
    </main>
  );
}
