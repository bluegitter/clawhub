import { useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";

type PackageManager = "npm" | "pnpm" | "bun";

type InstallSwitcherProps = {
  exampleSlug?: string;
  registry?: string | null;
  title?: string;
  showCopy?: boolean;
};

const PACKAGE_MANAGERS: Array<{ id: PackageManager; label: string }> = [
  { id: "npm", label: "npm" },
  { id: "pnpm", label: "pnpm" },
  { id: "bun", label: "bun" },
];

export function InstallSwitcher({
  exampleSlug = "sonoscli",
  registry,
  title,
  showCopy = false,
}: InstallSwitcherProps) {
  const [pm, setPm] = useState<PackageManager>("npm");
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const command = useMemo(() => {
    const registryPrefix = registry ? `CLAWHUB_REGISTRY=${registry} ` : "";
    switch (pm) {
      case "npm":
        return `${registryPrefix}npx clawhub@latest install ${exampleSlug}`;
      case "pnpm":
        return `${registryPrefix}pnpm dlx clawhub@latest install ${exampleSlug}`;
      case "bun":
        return `${registryPrefix}bunx clawhub@latest install ${exampleSlug}`;
    }
  }, [exampleSlug, pm, registry]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="install-switcher">
      <div className="install-switcher-row">
        <div className="stat">{title ?? t("home.install.oneShot")}</div>
        <div
          className="install-switcher-toggle"
          role="tablist"
          aria-label={t("home.install.command")}
        >
          {PACKAGE_MANAGERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={
                pm === entry.id ? "install-switcher-pill is-active" : "install-switcher-pill"
              }
              role="tab"
              aria-selected={pm === entry.id}
              onClick={() => setPm(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className="install-switcher-command">
        <div className="hero-install-code mono">{command}</div>
        {showCopy ? (
          <button type="button" className="btn install-switcher-copy" onClick={() => void copyCommand()}>
            {copied ? t("common.copied") : t("common.copy")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
