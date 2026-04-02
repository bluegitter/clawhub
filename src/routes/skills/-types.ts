import type { PublicPublisher, PublicSkill } from "../../lib/publicUser";

export type SkillVersionSummary = {
  version: string;
  createdAt: number;
  changelog: string;
  changelogSource?: "auto" | "user" | null;
  parsed?: {
    clawdis?: {
      os?: string[];
      nix?: {
        plugin?: boolean;
        systems?: string[];
      };
    };
  };
};

export type SkillListEntry = {
  skill: PublicSkill;
  latestVersion: SkillVersionSummary | null;
  ownerHandle?: string | null;
  owner?: PublicPublisher | null;
  searchScore?: number;
};

export type SkillSearchEntry = {
  skill: PublicSkill;
  version: SkillVersionSummary | null;
  score: number;
  ownerHandle?: string | null;
  owner?: PublicPublisher | null;
};

export function buildSkillHref(skill: PublicSkill, ownerHandle?: string | null) {
  const owner = ownerHandle?.trim() || String(skill.ownerPublisherId ?? skill.ownerUserId);
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(skill.slug)}`;
}
