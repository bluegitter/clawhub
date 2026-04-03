import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { gravatarUrl } from "../lib/gravatar";
import { useI18n } from "../lib/i18n";
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
  const { t, formatDateTime } = useI18n();
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
        <div className="card">{t("settings.loading")}</div>
      </main>
    );
  }

  if (!isAuthenticated || !me) {
    return (
      <main className="section">
        <div className="card">{t("settings.signIn")}</div>
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
      <h1 className="section-title">{t("settings.title")}</h1>

      <div className="card settings-profile">
        <div className="settings-avatar">
          {avatar ? (
            <img src={avatar} alt={identityName} />
          ) : (
            <span>{identityName[0]?.toUpperCase() ?? "U"}</span>
          )}
        </div>
        <div className="settings-profile-body">
          <div className="settings-name">{identityName}</div>
          {handle ? <div className="settings-handle">@{handle}</div> : null}
          {me.email ? <div className="settings-email">{me.email}</div> : null}
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          {t("settings.localAccount")}
        </h2>
        <p className="section-subtitle">{t("settings.localAccountSubtitle")}</p>
        <div className="stat">
          {t("settings.displayName")}: {me.displayName ?? t("settings.notSet")}
        </div>
        <div className="stat">
          {t("settings.realName")}: {me.name ?? t("settings.notSet")}
        </div>
        <div className="stat">
          {t("settings.handle")}: {me.handle ?? t("settings.notSet")}
        </div>
        <div className="stat">
          {t("settings.email")}: {me.email ?? t("settings.notSet")}
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          {t("settings.apiTokens")}
        </h2>
        <p className="section-subtitle">{t("settings.apiTokensSubtitle")}</p>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <input
            value={tokenLabel}
            onChange={(event) => setTokenLabel(event.target.value)}
            placeholder={t("settings.tokenLabel")}
            className="input"
            style={{ minWidth: 240 }}
          />
          <button type="button" className="btn btn-primary" onClick={() => void onCreateToken()}>
            {t("settings.createToken")}
          </button>
        </div>
        {newToken ? (
          <div className="stat" style={{ overflowWrap: "anywhere" }}>
            {t("settings.newToken")}: <code>{newToken}</code>
          </div>
        ) : null}
        {tokenError ? <div className="stat">{tokenError}</div> : null}
        {tokensLoading ? (
          <div className="stat">{t("settings.loadingTokens")}</div>
        ) : tokens.length === 0 ? (
          <div className="stat">{t("settings.noTokens")}</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tokens.map((token) => (
              <div
                key={token.id}
                className="stat"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <strong>{token.label}</strong>
                  <span>
                    Prefix: <code>{token.prefix}</code>
                  </span>
                  <span>
                    {t("settings.created")}: {formatDateTime(token.createdAt)}
                  </span>
                </div>
                <button type="button" className="btn" onClick={() => void onRevokeToken(token.id)}>
                  {t("settings.revoke")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card settings-card">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          {t("settings.notMigrated")}
        </h2>
        <p className="section-subtitle" style={{ marginBottom: 0 }}>
          {t("settings.notMigratedSubtitle")}
        </p>
        <div className="stat">{t("settings.profileEditing")}</div>
        <div className="stat">{t("settings.orgManagement")}</div>
        <div className="stat">{t("settings.accountDeletion")}</div>
      </div>
    </main>
  );
}
