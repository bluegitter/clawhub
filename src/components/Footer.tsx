import { useI18n } from "../lib/i18n";
import { getSiteName } from "../lib/site";

export function Footer() {
  const siteName = getSiteName();
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-divider" aria-hidden="true" />
        <div className="site-footer-row">
          <div className="site-footer-copy">
            {t("footer.prefix", { siteName })}
            <a href="https://openclaw.ai" target="_blank" rel="noreferrer">
              OpenClaw
            </a>{" "}
            {t("footer.project")}
            {t("footer.deployed")}
            <a href="https://vercel.com" target="_blank" rel="noreferrer">
              Vercel
            </a>{" "}
            {t("footer.powered")}
            <a href="https://www.convex.dev" target="_blank" rel="noreferrer">
              Convex
            </a>{" "}
            {t("footer.opensource")} ·{" "}
            <a href="https://github.com/openclaw/clawhub" target="_blank" rel="noreferrer">
              GitHub
            </a>{" "}
            ·{" "}
            <a href="https://steipete.me" target="_blank" rel="noreferrer">
              Peter Steinberger
            </a>
            .
          </div>
        </div>
      </div>
    </footer>
  );
}
