import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Plug,
  Plus,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { formatCompactStat } from "../lib/numberFormat";
import { familyLabel } from "../lib/packageLabels";
import type { PublicSkill } from "../lib/publicUser";

type DashboardSkill = PublicSkill & { pendingReview?: boolean };

type DashboardPackage = {
  _id: string;
  name: string;
  displayName: string;
  family: "skill" | "code-plugin" | "bundle-plugin";
  channel: "official" | "community" | "private";
  isOfficial: boolean;
  runtimeId?: string | null;
  summary?: string | null;
  latestVersion?: string | null;
  stats: {
    downloads: number;
    installs: number;
    stars: number;
    versions: number;
  };
  verification?: {
    tier?: "structural" | "source-linked" | "provenance-verified" | "rebuild-verified";
  } | null;
  scanStatus?: "clean" | "suspicious" | "malicious" | "pending" | "not-run";
  pendingReview?: boolean;
  latestRelease: {
    version: string;
    createdAt: number;
    vtStatus: string | null;
    llmStatus: string | null;
    staticScanStatus: "clean" | "suspicious" | "malicious" | null;
  } | null;
};

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const me = useQuery(api.users.me) as Doc<"users"> | null | undefined;
  const publishers = useQuery(api.publishers.listMine) as
    | Array<{
        publisher: {
          _id: string;
          handle: string;
          displayName: string;
          kind: "user" | "org";
        };
        role: "owner" | "admin" | "publisher";
      }>
    | undefined;
  const [selectedPublisherId, setSelectedPublisherId] = useState<string>("");
  const selectedPublisher =
    publishers?.find((entry) => entry.publisher._id === selectedPublisherId) ?? null;

  const mySkills = useQuery(
    api.skills.list,
    selectedPublisher?.publisher.kind === "user" && me?._id
      ? { ownerUserId: me._id, limit: 100 }
      : selectedPublisherId
        ? { ownerPublisherId: selectedPublisherId as Doc<"publishers">["_id"], limit: 100 }
        : me?._id
          ? { ownerUserId: me._id, limit: 100 }
          : "skip",
  ) as DashboardSkill[] | undefined;
  const myPackages = useQuery(
    api.packages.list,
    selectedPublisherId
      ? { ownerPublisherId: selectedPublisherId as Doc<"publishers">["_id"], limit: 100 }
      : me?._id
        ? { ownerUserId: me._id, limit: 100 }
        : "skip",
  ) as DashboardPackage[] | undefined;

  useEffect(() => {
    if (selectedPublisherId) return;
    const personal = publishers?.find((entry) => entry.publisher.kind === "user") ?? publishers?.[0];
    if (personal?.publisher._id) {
      setSelectedPublisherId(personal.publisher._id);
    }
  }, [publishers, selectedPublisherId]);

  if (!me) {
    return (
      <main className="section">
        <div className="card">Sign in to access your dashboard.</div>
      </main>
    );
  }

  const skills = mySkills ?? [];
  const packages = myPackages ?? [];
  const ownerHandle =
    selectedPublisher?.publisher.handle ?? me.handle ?? me.name ?? me.displayName ?? me._id;

  return (
    <main className="section">
      <div className="dashboard-header">
        <div style={{ display: "grid", gap: "6px" }}>
          <h1 className="section-title" style={{ margin: 0 }}>
            Publisher Dashboard
          </h1>
          <p className="section-subtitle" style={{ margin: 0 }}>
            Owner-only view for skills and plugins, including security scans and verification.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {publishers && publishers.length > 0 ? (
            <select
              className="input"
              value={selectedPublisherId}
              onChange={(event) => setSelectedPublisherId(event.target.value)}
            >
              {publishers.map((entry) => (
                <option key={entry.publisher._id} value={entry.publisher._id}>
                  @{entry.publisher.handle} · {entry.role}
                </option>
              ))}
            </select>
          ) : null}
          <Link to="/upload" search={{ updateSlug: undefined }} className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Upload Skill
          </Link>
          <Link to="/plugins/new" className="btn">
            <Plug className="h-4 w-4" aria-hidden="true" />
            Publish Plugin
          </Link>
        </div>
      </div>

      <div className="dashboard-sections">
        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Publisher Skills
              </h2>
              <p className="section-subtitle" style={{ margin: "6px 0 0" }}>
                Hidden skill versions remain visible here while checks are pending.
              </p>
            </div>
          </div>
          {skills.length === 0 ? (
            <div className="card dashboard-empty">
              <Package className="dashboard-empty-icon" aria-hidden="true" />
              <h2>No skills yet</h2>
              <p>Upload your first skill to share it with the community.</p>
              <Link to="/upload" search={{ updateSlug: undefined }} className="btn btn-primary">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload a Skill
              </Link>
            </div>
          ) : (
            <div className="dashboard-grid">
              {skills.map((skill) => (
                <SkillCard key={skill._id} skill={skill} ownerHandle={ownerHandle} />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>
                Publisher Plugins
              </h2>
              <p className="section-subtitle" style={{ margin: "6px 0 0" }}>
                Owner-only package view with VirusTotal, static scan, and verification state.
              </p>
            </div>
          </div>
          {packages.length === 0 ? (
            <div className="card dashboard-empty">
              <Plug className="dashboard-empty-icon" aria-hidden="true" />
              <h2>No plugins yet</h2>
              <p>Publish your first plugin release to validate and distribute it.</p>
              <Link to="/plugins/new" className="btn btn-primary">
                <Plug className="h-4 w-4" aria-hidden="true" />
                Publish a Plugin
              </Link>
            </div>
          ) : (
            <div className="dashboard-grid">
              {packages.map((pkg) => (
                <PackageCard key={pkg._id} pkg={pkg} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SkillCard({ skill, ownerHandle }: { skill: DashboardSkill; ownerHandle: string | null }) {
  return (
    <div className="dashboard-skill-card">
      <div className="dashboard-skill-info">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Link
            to="/$owner/$slug"
            params={{ owner: ownerHandle ?? "unknown", slug: skill.slug }}
            className="dashboard-skill-name"
          >
            {skill.displayName}
          </Link>
          <span className="dashboard-skill-slug">/{skill.slug}</span>
          {skill.pendingReview ? (
            <span className="tag tag-pending">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Pending checks
            </span>
          ) : null}
        </div>
        {skill.summary && <p className="dashboard-skill-description">{skill.summary}</p>}
        {skill.pendingReview ? (
          <p className="dashboard-skill-description">
            Hidden until VirusTotal and verification checks finish.
          </p>
        ) : null}
        <div className="dashboard-skill-stats">
          <span>
            <Package size={13} aria-hidden="true" /> {formatCompactStat(skill.stats.downloads)}
          </span>
          <span>★ {formatCompactStat(skill.stats.stars)}</span>
          <span>{skill.stats.versions} v</span>
        </div>
      </div>
      <div className="dashboard-skill-actions">
        <Link to="/upload" search={{ updateSlug: skill.slug }} className="btn btn-sm">
          <Upload className="h-3 w-3" aria-hidden="true" />
          New Version
        </Link>
        <Link
          to="/$owner/$slug"
          params={{ owner: ownerHandle ?? "unknown", slug: skill.slug }}
          className="btn btn-ghost btn-sm"
        >
          View
        </Link>
      </div>
    </div>
  );
}

function scanStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "Pending scan";
    case "clean":
      return "Scan clean";
    case "suspicious":
      return "Suspicious";
    case "malicious":
      return "Blocked";
    case "not-run":
      return "Scan not run";
    default:
      return null;
  }
}

function releaseStatusLabel(
  label: string,
  status: string | null | undefined,
  emptyLabel = "not started",
) {
  return `${label}: ${status?.trim() ? status : emptyLabel}`;
}

function PackageStatusTag({
  label,
  tone,
}: {
  label: string;
  tone: "default" | "pending" | "warning" | "danger" | "success";
}) {
  const className =
    tone === "pending"
      ? "tag tag-pending"
      : tone === "warning"
        ? "tag dashboard-tag-warning"
        : tone === "danger"
          ? "tag dashboard-tag-danger"
          : tone === "success"
            ? "tag dashboard-tag-success"
            : "tag";
  return <span className={className}>{label}</span>;
}

function PackageCard({ pkg }: { pkg: DashboardPackage }) {
  const scanLabel = scanStatusLabel(pkg.scanStatus);
  const scanTone =
    pkg.scanStatus === "pending"
      ? "pending"
      : pkg.scanStatus === "suspicious"
        ? "warning"
        : pkg.scanStatus === "malicious"
          ? "danger"
          : pkg.scanStatus === "clean"
            ? "success"
            : "default";
  const staticTone =
    pkg.latestRelease?.staticScanStatus === "suspicious"
      ? "warning"
      : pkg.latestRelease?.staticScanStatus === "malicious"
        ? "danger"
        : pkg.latestRelease?.staticScanStatus === "clean"
          ? "success"
          : "default";

  return (
    <div className="dashboard-skill-card">
      <div className="dashboard-skill-info">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Link to="/plugins/$name" params={{ name: pkg.name }} className="dashboard-skill-name">
            {pkg.displayName}
          </Link>
          <span className="dashboard-skill-slug">{pkg.name}</span>
          <PackageStatusTag label={familyLabel(pkg.family)} tone="default" />
          <PackageStatusTag label={pkg.channel} tone="default" />
          {scanLabel ? <PackageStatusTag label={scanLabel} tone={scanTone} /> : null}
          {pkg.verification?.tier ? (
            <PackageStatusTag label={pkg.verification.tier} tone="default" />
          ) : null}
          {pkg.latestRelease?.staticScanStatus ? (
            <PackageStatusTag
              label={`Static ${pkg.latestRelease.staticScanStatus}`}
              tone={staticTone}
            />
          ) : null}
        </div>
        {pkg.summary ? <p className="dashboard-skill-description">{pkg.summary}</p> : null}
        <div className="dashboard-package-status">
          <span>
            <ShieldCheck size={13} aria-hidden="true" />{" "}
            {releaseStatusLabel(
              "VT",
              pkg.latestRelease?.vtStatus,
              pkg.scanStatus === "pending" ? "pending" : "unknown",
            )}
          </span>
          <span>
            <CheckCircle2 size={13} aria-hidden="true" />{" "}
            {releaseStatusLabel("LLM", pkg.latestRelease?.llmStatus)}
          </span>
          <span>
            <AlertTriangle size={13} aria-hidden="true" />{" "}
            {releaseStatusLabel("Static", pkg.latestRelease?.staticScanStatus)}
          </span>
        </div>
        <div className="dashboard-skill-stats">
          <span>
            <Package size={13} aria-hidden="true" /> {formatCompactStat(pkg.stats.downloads)}
          </span>
          <span>★ {formatCompactStat(pkg.stats.stars)}</span>
          <span>{pkg.stats.versions} v</span>
          <span>{pkg.latestVersion ? `latest ${pkg.latestVersion}` : "no latest tag"}</span>
          {pkg.runtimeId ? <span>runtime {pkg.runtimeId}</span> : null}
        </div>
      </div>
      <div className="dashboard-skill-actions">
        <Link to="/plugins/new" className="btn btn-sm">
          <Upload className="h-3 w-3" aria-hidden="true" />
          Publish
        </Link>
        <Link to="/plugins/$name" params={{ name: pkg.name }} className="btn btn-ghost btn-sm">
          View
        </Link>
      </div>
    </div>
  );
}
