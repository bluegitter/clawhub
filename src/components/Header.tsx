import { Link } from "@tanstack/react-router";
import { Menu, Monitor, Moon, Sun } from "lucide-react";
import { useMemo, useRef } from "react";
import { gravatarUrl } from "../lib/gravatar";
import { useI18n } from "../lib/i18n";
import { getLocalAuthLoginUrl, getLocalAuthLogoutUrl } from "../lib/localBackend";
import { isModerator } from "../lib/roles";
import { getClawHubSiteUrl, getSiteMode, getSiteName } from "../lib/site";
import { applyTheme, useThemeMode } from "../lib/theme";
import { startThemeTransition } from "../lib/theme-transition";
import { useAuthError } from "../lib/useAuthError";
import { useAuthStatus } from "../lib/useAuthStatus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export default function Header() {
  const { isAuthenticated, isLoading, me } = useAuthStatus();
  const { mode, setMode } = useThemeMode();
  const { locale, setLocale, t } = useI18n();
  const toggleRef = useRef<HTMLDivElement | null>(null);
  const siteMode = getSiteMode();
  const siteName = useMemo(() => getSiteName(siteMode), [siteMode]);
  const isSoulMode = siteMode === "souls";
  const clawHubUrl = getClawHubSiteUrl();

  const avatar = me?.image ?? (me?.email ? gravatarUrl(me.email) : undefined);
  const profileName = me?.displayName ?? me?.name ?? "User";
  const initial = profileName.charAt(0).toUpperCase();
  const isStaff = isModerator(me);
  const { error: authError, clear: clearAuthError } = useAuthError();
  const localLoginHref = getLocalAuthLoginUrl("/");
  const localLogoutHref =
    typeof window !== "undefined" ? getLocalAuthLogoutUrl(`${window.location.origin}/`) : null;

  const setTheme = (next: "system" | "light" | "dark") => {
    startThemeTransition({
      nextTheme: next,
      currentTheme: mode,
      setTheme: (value) => {
        const nextMode = value as "system" | "light" | "dark";
        applyTheme(nextMode);
        setMode(nextMode);
      },
      context: { element: toggleRef.current },
    });
  };

  const handleSignOut = () => {
    if (localLogoutHref) {
      window.location.assign(localLogoutHref);
    }
  };

  const primaryBrowseLink = isSoulMode ? "/souls" : "/skills";
  const primaryBrowseSearch = isSoulMode
    ? {
        q: undefined,
        sort: undefined,
        dir: undefined,
        view: undefined,
        focus: undefined,
      }
    : {
        q: undefined,
        sort: undefined,
        dir: undefined,
        highlighted: undefined,
        nonSuspicious: undefined,
        view: undefined,
        focus: undefined,
      };
  const searchLinkSearch = isSoulMode
    ? {
        q: undefined,
        sort: undefined,
        dir: undefined,
        view: undefined,
        focus: "search" as const,
      }
    : {
        q: undefined,
        sort: undefined,
        dir: undefined,
        highlighted: undefined,
        nonSuspicious: undefined,
        view: undefined,
        focus: "search" as const,
      };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link
          to="/"
          search={{ q: undefined, highlighted: undefined, search: undefined }}
          className="brand"
        >
          <span className="brand-mark">
            <img src="/clawd-logo.png" alt="" aria-hidden="true" />
          </span>
          <span className="brand-name">{siteName}</span>
        </Link>
        <nav className="nav-links">
          {isSoulMode ? <a href={clawHubUrl}>{t("nav.clawhub")}</a> : null}
          <Link to={primaryBrowseLink} search={primaryBrowseSearch}>
            {isSoulMode ? t("nav.souls") : t("nav.skills")}
          </Link>
          {isSoulMode ? null : <Link to="/plugins">{t("nav.plugins")}</Link>}
          <Link to={primaryBrowseLink} search={searchLinkSearch}>
            {t("nav.search")}
          </Link>
          {isSoulMode ? null : <Link to="/about">{t("nav.about")}</Link>}
          {me ? <Link to="/stars">{t("nav.stars")}</Link> : null}
          {isStaff ? (
            <Link to="/management" search={{ skill: undefined }}>
              {t("nav.management")}
            </Link>
          ) : null}
        </nav>
        <div className="nav-actions">
          <div className="nav-mobile">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="nav-mobile-trigger" type="button" aria-label={t("nav.openMenu")}>
                  <Menu className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isSoulMode ? (
                  <DropdownMenuItem asChild>
                    <a href={clawHubUrl}>{t("nav.clawhub")}</a>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link to={primaryBrowseLink} search={primaryBrowseSearch}>
                    {isSoulMode ? t("nav.souls") : t("nav.skills")}
                  </Link>
                </DropdownMenuItem>
                {isSoulMode ? null : (
                  <DropdownMenuItem asChild>
                    <Link to="/plugins">{t("nav.plugins")}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to={primaryBrowseLink} search={searchLinkSearch}>
                    {t("nav.search")}
                  </Link>
                </DropdownMenuItem>
                {isSoulMode ? null : (
                  <DropdownMenuItem asChild>
                    <Link to="/about">{t("nav.about")}</Link>
                  </DropdownMenuItem>
                )}
                {me ? (
                  <DropdownMenuItem asChild>
                    <Link to="/stars">{t("nav.stars")}</Link>
                  </DropdownMenuItem>
                ) : null}
                {isStaff ? (
                  <DropdownMenuItem asChild>
                    <Link to="/management" search={{ skill: undefined }}>
                      {t("nav.management")}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocale("en")}>
                  {t("common.english")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale("zh")}>
                  {t("common.chinese")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  {t("common.system")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  {t("common.light")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  <Moon className="h-4 w-4" aria-hidden="true" />
                  {t("common.dark")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="theme-toggle">
            <ToggleGroup
              type="single"
              value={locale}
              onValueChange={(value) => {
                if (!value) return;
                setLocale(value as "en" | "zh");
              }}
              aria-label={t("common.language")}
            >
              <ToggleGroupItem value="en" aria-label={t("common.english")}>
                EN
              </ToggleGroupItem>
              <ToggleGroupItem value="zh" aria-label={t("common.chinese")}>
                中
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="theme-toggle" ref={toggleRef}>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => {
                if (!value) return;
                setTheme(value as "system" | "light" | "dark");
              }}
              aria-label={t("nav.themeMode")}
            >
              <ToggleGroupItem value="system" aria-label={t("nav.systemTheme")}>
                <Monitor className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("common.system")}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="light" aria-label={t("nav.lightTheme")}>
                <Sun className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("common.light")}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label={t("nav.darkTheme")}>
                <Moon className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("common.dark")}</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {isAuthenticated && me ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="user-trigger" type="button">
                  {avatar ? (
                    <img src={avatar} alt={me.displayName ?? me.name ?? "User avatar"} />
                  ) : (
                    <span className="user-menu-fallback">{initial}</span>
                  )}
                  <span className="mono">{profileName}</span>
                  <span className="user-menu-chevron">▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">{t("nav.dashboard")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">{t("nav.settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>{t("nav.signOut")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              {authError ? (
                <div className="error" role="alert" style={{ fontSize: "0.85rem", marginRight: 8 }}>
                  {authError}{" "}
                  <button
                    type="button"
                    onClick={clearAuthError}
                    aria-label={t("common.dismiss")}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "inherit",
                      padding: "0 2px",
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : null}
              <a
                className={`btn btn-primary${isLoading ? " is-disabled" : ""}`}
                href={localLoginHref}
                onClick={() => clearAuthError()}
              >
                <span className="sign-in-label">{t("nav.signIn")}</span>
                <span className="sign-in-provider">{t("nav.signInWithSso")}</span>
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
