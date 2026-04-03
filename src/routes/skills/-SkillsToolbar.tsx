import type { RefObject } from "react";
import { useI18n } from "../../lib/i18n";
import { type SortDir, type SortKey } from "./-params";

type SkillsToolbarProps = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  hasQuery: boolean;
  sort: SortKey;
  dir: SortDir;
  view: "cards" | "list";
  highlightedOnly: boolean;
  nonSuspiciousOnly: boolean;
  onQueryChange: (next: string) => void;
  onToggleHighlighted: () => void;
  onToggleNonSuspicious: () => void;
  onSortChange: (value: string) => void;
  onToggleDir: () => void;
  onToggleView: () => void;
};

export function SkillsToolbar({
  searchInputRef,
  query,
  hasQuery,
  sort,
  dir,
  view,
  highlightedOnly,
  nonSuspiciousOnly,
  onQueryChange,
  onToggleHighlighted,
  onToggleNonSuspicious,
  onSortChange,
  onToggleDir,
  onToggleView,
}: SkillsToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="skills-toolbar">
      <div className="skills-search">
        <input
          ref={searchInputRef}
          className="skills-search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("skills.searchPlaceholder")}
        />
      </div>
      <div className="skills-toolbar-row">
        <button
          className={`search-filter-button${highlightedOnly ? " is-active" : ""}`}
          type="button"
          aria-pressed={highlightedOnly}
          onClick={onToggleHighlighted}
        >
          {t("skills.highlighted")}
        </button>
        <button
          className={`search-filter-button${nonSuspiciousOnly ? " is-active" : ""}`}
          type="button"
          aria-pressed={nonSuspiciousOnly}
          onClick={onToggleNonSuspicious}
        >
          {t("skills.hideSuspicious")}
        </button>
        <select
          className="skills-sort"
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
          aria-label={t("skills.sortLabel")}
        >
          {hasQuery ? <option value="relevance">{t("skills.relevance")}</option> : null}
          <option value="newest">{t("skills.newest")}</option>
          <option value="updated">{t("skills.updated")}</option>
          <option value="downloads">{t("skills.downloads")}</option>
          <option value="installs">{t("skills.installs")}</option>
          <option value="stars">{t("skills.stars")}</option>
          <option value="name">{t("skills.name")}</option>
        </select>
        <button
          className="skills-dir"
          type="button"
          aria-label={t("skills.sortDir", { dir })}
          onClick={onToggleDir}
        >
          {dir === "asc" ? "↑" : "↓"}
        </button>
        <button
          className={`skills-view${view === "cards" ? " is-active" : ""}`}
          type="button"
          onClick={onToggleView}
        >
          {view === "cards" ? t("skills.viewList") : t("skills.viewCards")}
        </button>
      </div>
    </div>
  );
}
