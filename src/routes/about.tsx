import { createFileRoute, Link } from "@tanstack/react-router";
import { getPreferredLocale, useI18n } from "../lib/i18n";
import { getSiteMode, getSiteName, getSiteUrlForMode } from "../lib/site";

const prohibitedCategories = [
  {
    title: "Bypass and unauthorized access",
    examples:
      "Auth bypass, account takeover, CAPTCHA bypass, Cloudflare or anti-bot evasion, rate-limit bypass, reusable session theft, live call or agent takeover.",
  },
  {
    title: "Platform abuse and ban evasion",
    examples:
      "Stealth accounts after bans, account warming/farming, fake engagement, multi-account automation, spam posting, marketplace or social automation built to avoid detection.",
  },
  {
    title: "Fraud and deception",
    examples:
      "Fake certificates, fake invoices, deceptive payment flows, fake social proof, scam outreach, or synthetic-identity workflows built to create accounts for fraud.",
  },
  {
    title: "Privacy-invasive surveillance",
    examples:
      "Mass contact scraping for spam, doxxing, stalking, covert monitoring, biometric / face-matching workflows without clear consent, or buying, publishing, downloading, or operationalizing leaked data or breach dumps.",
  },
  {
    title: "Non-consensual impersonation",
    examples:
      "Face swap, digital twins, cloned influencers, fake personas, or other identity manipulation used to impersonate or mislead.",
  },
  {
    title: "Explicit sexual content",
    examples:
      "NSFW image, video, or text generation, especially wrappers around third-party APIs with safety checks disabled.",
  },
  {
    title: "Hidden or misleading execution",
    examples:
      "Obfuscated install commands, `curl | sh`, undeclared secret requirements, undeclared private-key use, or remote `npx @latest` execution without reviewability.",
  },
];

const recentPatterns = [
  "Create stealth seller accounts after marketplace bans.",
  "Modify Telegram pairing so unapproved users automatically receive pairing codes.",
  "Cultivate Reddit or Twitter accounts with undetectable automation.",
  "Generate professional certificates or invoices for arbitrary use.",
  "Generate NSFW content with safety checks disabled.",
  "Scrape leads, enrich contacts, and launch cold outreach at scale.",
  "Buy, publish, or download leaked data or breach dumps.",
  "Bulk-create email or social accounts with synthetic identities or CAPTCHA solving.",
];

export const Route = createFileRoute("/about")({
  head: () => {
    const mode = getSiteMode();
    const locale = getPreferredLocale();
    const siteName = getSiteName(mode);
    const siteUrl = getSiteUrlForMode(mode);
    const title = `About · ${siteName}`;
    const description =
      locale === "zh"
        ? "ClawHub 允许什么、不托管什么，以及会导致下架或封禁的滥用模式。"
        : "What ClawHub allows, what we do not host, and the abuse patterns that lead to removal or account bans.";

    return {
      links: [
        {
          rel: "canonical",
          href: `${siteUrl}/about`,
        },
      ],
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${siteUrl}/about` },
      ],
    };
  },
  component: AboutPage,
});

function AboutPage() {
  const { locale } = useI18n();
  const copy =
    locale === "zh"
      ? {
          about: "关于",
          policy: "政策",
          title: "ClawHub 不会托管什么",
          subtitle:
            "ClawHub 服务于有用的智能体工具，而不是滥用工作流。如果一个技能旨在绕过防护、滥用平台、诈骗、侵犯隐私或支持未经同意的行为，它就不属于这里。",
          moderation: "我们根据完整的滥用模式做审核，而不是只看孤立关键词。",
          recent: "近期我们明确不接受的模式",
          enforcement: "处置方式",
          enforcementItems: [
            "我们可能隐藏、移除或彻底删除违规技能。",
            "我们可能撤销令牌、软删除关联内容，并封禁重复或严重违规者。",
            "对于明显滥用行为，我们不保证先警告后处理。",
          ],
          browseSkills: "浏览技能",
          reviewerDoc: "审核文档",
        }
      : {
          about: "About",
          policy: "Policy",
          title: "What ClawHub Will Not Host",
          subtitle:
            "ClawHub is for useful agent tooling, not abuse workflows. If a skill is built to evade defenses, abuse platforms, scam people, invade privacy, or enable non-consensual behavior, it does not belong here.",
          moderation: "We moderate based on end-to-end abuse patterns, not just isolated keywords.",
          recent: "Recent patterns we are explicitly not okay with",
          enforcement: "Enforcement",
          enforcementItems: [
            "We may hide, remove, or hard-delete violating skills.",
            "We may revoke tokens, soft-delete associated content, and ban repeat or severe offenders.",
            "We do not guarantee warning-first enforcement for obvious abuse.",
          ],
          browseSkills: "Browse Skills",
          reviewerDoc: "Reviewer Doc",
        };

  return (
    <main className="section">
      <div className="skill-detail-stack">
        <section className="card">
          <div className="skill-card-tags" style={{ marginBottom: 12 }}>
            <span className="tag">{copy.about}</span>
            <span className="tag tag-accent">{copy.policy}</span>
          </div>
          <h1 className="section-title" style={{ marginBottom: 10 }}>
            {copy.title}
          </h1>
          <p className="section-subtitle" style={{ marginBottom: 14 }}>
            {copy.subtitle}
          </p>
          <div className="stat">{copy.moderation}</div>
        </section>

        <section className="grid" style={{ gap: 16 }}>
          {prohibitedCategories.map((category) => (
            <article key={category.title} className="card">
              <h2 className="dashboard-collection-title" style={{ marginBottom: 8 }}>
                {category.title}
              </h2>
              <p className="section-subtitle" style={{ margin: 0 }}>
                {category.examples}
              </p>
            </article>
          ))}
        </section>

        <section className="card">
          <h2 className="dashboard-collection-title" style={{ marginBottom: 10 }}>
            {copy.recent}
          </h2>
          <div className="management-sublist">
            {recentPatterns.map((pattern) => (
              <div key={pattern} className="management-subitem">
                {pattern}
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="dashboard-collection-title" style={{ marginBottom: 10 }}>
            {copy.enforcement}
          </h2>
          <div className="management-sublist">
            {copy.enforcementItems.map((item) => (
              <div key={item} className="management-subitem">
                {item}
              </div>
            ))}
          </div>
          <div className="skill-card-tags" style={{ marginTop: 16 }}>
            <Link className="btn btn-primary" to="/skills">
              {copy.browseSkills}
            </Link>
            <a
              className="btn"
              href="https://github.com/openclaw/clawhub/blob/main/docs/acceptable-usage.md"
              target="_blank"
              rel="noreferrer"
            >
              {copy.reviewerDoc}
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
