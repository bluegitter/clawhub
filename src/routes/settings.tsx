import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { gravatarUrl } from "../lib/gravatar";
import {
  createLocalApiToken,
  listLocalApiTokens,
  revokeLocalApiToken,
  type LocalApiTokenSummary,
} from "../lib/localBackend";
import { useAuthStatus } from "../lib/useAuthStatus";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

export function Settings() {
  const { me, isAuthenticated, isLoading } = useAuthStatus();
  const [tokens, setTokens] = useState<LocalApiTokenSummary[]>([]);
  const [tokenLabel, setTokenLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !me) {
      setTokens([]);
      setNewToken(null);
      return;
    }

    let cancelled = false;
    setTokensLoading(true);
    setTokenError(null);
    void listLocalApiTokens()
      .then((items) => {
        if (!cancelled) setTokens(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setTokenError(error instanceof Error ? error.message : "Failed to load API tokens.");
          setTokens([]);
        }
      })
      .finally(() => {
        if (!cancelled) setTokensLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, me?._id]);

  if (isLoading) {
    return (
      <main className="section">
        <div className="card">Loading settings…</div>
      </main>
    );
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="section">
        <div className="card">Sign in to access settings.</div>
      </main>
    );
  }

  const avatar = me.image ?? (me.email ? gravatarUrl(me.email, 160) : undefined);
  const identityName = me.displayName ?? me.name ?? me.handle ?? "Profile";
  const handle = me.handle ?? (me.email ? me.email.split("@")[0] : undefined);

  async function onCreateToken() {
    try {
      setTokenError(null);
      const created = await createLocalApiToken(tokenLabel.trim());
      setTokens((current) => [created.meta, ...current]);
      setNewToken(created.token);
      setTokenLabel("");
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Failed to create API token.");
    }
  }

  async function onRevokeToken(id: string) {
    try {
      setTokenError(null);
      await revokeLocalApiToken(id);
      setTokens((current) => current.filter((token) => token.id !== id));
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Failed to revoke API token.");
    }
  }

  return (
    <main className="section settings-shell">
      <h1 className="section-title">Settings</h1>

      <div className="card settings-profile">
        <div className="settings-avatar">
          {avatar ? <img src={avatar} alt={identityName} /> : <span>{identityName[0]?.toUpperCase() ?? "U"}</span>}
        </div>
        <div className="settings-profile-body">
          <div className="settings-name">{identityName}</div>
          {handle ? <div className="settings-handle">@{handle}</div> : null}
          {me.email ? <div className="settings-email">{me.email}</div> : null}
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Local Account
        </h2>
        <p className="section-subtitle">
          The local deployment currently exposes your synced identity and session, but profile editing,
          API tokens, and organization management have not been migrated yet.
        </p>
        <div className="stat">Display name: {me.displayName ?? "Not set"}</div>
        <div className="stat">Real name: {me.name ?? "Not set"}</div>
        <div className="stat">Handle: {me.handle ?? "Not set"}</div>
        <div className="stat">Email: {me.email ?? "Not set"}</div>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          API Tokens
        </h2>
        <p className="section-subtitle">
          Create local API tokens for CLI and scripted access. New token values are shown only once.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <input
            value={tokenLabel}
            onChange={(event) => setTokenLabel(event.target.value)}
            placeholder="Token label"
            className="input"
            style={{ minWidth: 240 }}
          />
          <button type="button" className="btn btn-primary" onClick={() => void onCreateToken()}>
            Create token
          </button>
        </div>
        {newToken ? (
          <div className="stat" style={{ overflowWrap: "anywhere" }}>
            New token: <code>{newToken}</code>
          </div>
        ) : null}
        {tokenError ? <div className="stat">{tokenError}</div> : null}
        {tokensLoading ? (
          <div className="stat">Loading API tokens…</div>
        ) : tokens.length === 0 ? (
          <div className="stat">No API tokens created yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tokens.map((token) => (
              <div
                key={token.id}
                className="stat"
                style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{token.label}</strong>
                  <span>
                    Prefix: <code>{token.prefix}</code>
                  </span>
                  <span>Created: {new Date(token.createdAt).toLocaleString()}</span>
                </div>
                <button type="button" className="btn" onClick={() => void onRevokeToken(token.id)}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Not Yet Migrated
        </h2>
        <p className="section-subtitle" style={{ marginBottom: 0 }}>
          These features still need local backend support before they can be enabled:
        </p>
        <div className="stat">Profile editing</div>
        <div className="stat">Organization publishers and member management</div>
        <div className="stat">Account deletion workflow</div>
      </div>
    </main>
  );
}
