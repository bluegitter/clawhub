import { Package } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { formatSkillStatsTriplet, type SkillStatsTriplet } from "../lib/numberFormat";

type SkillMetricsStats = SkillStatsTriplet & {
  versions: number;
};

export function SkillStatsTripletLine({ stats }: { stats: SkillStatsTriplet }) {
  const { formatCompactNumber } = useI18n();
  const formatted = formatSkillStatsTriplet(stats, formatCompactNumber);
  return (
    <>
      ⭐ {formatted.stars} · <Package size={13} aria-hidden="true" /> {formatted.downloads}
    </>
  );
}

export function SkillMetricsRow({ stats }: { stats: SkillMetricsStats }) {
  const { formatCompactNumber } = useI18n();
  const formatted = formatSkillStatsTriplet(stats, formatCompactNumber);
  return (
    <>
      <span>
        <Package size={13} aria-hidden="true" /> {formatted.downloads}
      </span>
      <span>★ {formatted.stars}</span>
      <span>{stats.versions} v</span>
    </>
  );
}
