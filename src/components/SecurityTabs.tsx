import type { InferSelectModel } from "drizzle-orm";
import { useState } from "react";
import type { releases, vulnerabilities } from "../db/schema";
import {
  type RepoInfo,
  resolveReleaseDescription,
  resolveReleaseName,
} from "../lib/security";

type Vulnerability = InferSelectModel<typeof vulnerabilities>;
type Release = InferSelectModel<typeof releases>;

type SecurityTabsProps = {
  vulns: Vulnerability[];
  rels: Release[];
  repoMap: Record<string, RepoInfo>;
  dailyComment: string | null;
};

function formatDate(dateStr: string): string {
  return dateStr.slice(5).replace("-", "/");
}

type TabId = "summary" | "vulns" | "updates";

const STEP = 10;

export function SecurityTabs({
  vulns,
  rels,
  repoMap,
  dailyComment,
}: SecurityTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [vulnVisibleCount, setVulnVisibleCount] = useState(STEP);
  const [updateVisibleCount, setUpdateVisibleCount] = useState(STEP);
  const [searchQuery, setSearchQuery] = useState("");

  const vulnTop5 = vulns.slice(0, 5);
  const relTop5 = rels.slice(0, 5);

  const query = searchQuery.toLowerCase();
  const filteredVulns = query
    ? vulns.filter(
        (v) =>
          v.title.toLowerCase().includes(query) ||
          v.cveId.toLowerCase().includes(query),
      )
    : vulns;
  const filteredRels = query
    ? rels.filter((r) => {
        const name = resolveReleaseName(r.repo, repoMap);
        const desc = resolveReleaseDescription(r.repo, repoMap);
        return (
          name.toLowerCase().includes(query) ||
          (desc?.toLowerCase().includes(query) ?? false) ||
          r.version.toLowerCase().includes(query) ||
          r.repo.toLowerCase().includes(query)
        );
      })
    : rels;

  function handleSearch(value: string) {
    setSearchQuery(value);
    setVulnVisibleCount(STEP);
    setUpdateVisibleCount(STEP);
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "summary", label: "日次サマリー" },
    { id: "vulns", label: "脆弱性" },
    { id: "updates", label: "アップデート" },
  ];

  return (
    <>
      <main className="relative z-1 max-w-265 mx-auto px-10 pb-20 max-md:px-4 max-md:pb-15">
        {/* タブバー */}
        <div className="flex gap-0 border-b border-border mb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-btn text-[13px] font-medium bg-transparent border-none border-b-2 px-5 py-3 cursor-pointer transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "active text-ink border-b-ink"
                  : "text-muted border-b-transparent hover:text-ink"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* TAB 1: 日次サマリー */}
        <div
          id="tab-summary"
          className={`tab-content${activeTab !== "summary" ? " hidden" : ""}`}
        >
          {/* 脆弱性 TOP5 */}
          <div className="flex items-center gap-2.5 mb-4 mt-2">
            <h2 className="font-mono text-xs font-medium tracking-[.08em] text-ink whitespace-nowrap">
              脆弱性
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-muted tracking-[.06em] whitespace-nowrap">
              CVSS x recency
            </span>
          </div>

          {vulnTop5.map((v) => (
            <div
              key={v.id}
              className="relative bg-surface border border-border rounded-sm mb-2 p-3.5 px-6 shadow-[2px_2px_0_rgba(0,0,0,.06)] max-md:px-5"
            >
              <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-sm bg-critical" />
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-ink leading-normal">
                  {v.title}
                </div>
                <div className="font-mono text-[10px] text-muted mt-0.5">
                  {v.cveId}&nbsp;&middot;&nbsp;CVSS{" "}
                  {v.cvssScore?.toFixed(1) ?? "—"}&nbsp;&middot;&nbsp;
                  {formatDate(v.publishedAt)}
                </div>
              </div>
            </div>
          ))}

          {/* アップデート TOP5 */}
          <div className="flex items-center gap-2.5 mb-4 mt-7">
            <h2 className="font-mono text-xs font-medium tracking-[.08em] text-ink whitespace-nowrap">
              アップデート
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-muted tracking-[.06em] whitespace-nowrap">
              stars x recency
            </span>
          </div>

          {relTop5.map((r) => {
            const isMajor = r.type === "major";
            const name = resolveReleaseName(r.repo, repoMap);
            const desc = resolveReleaseDescription(r.repo, repoMap);
            return (
              <div
                key={r.id}
                className="relative bg-surface border border-border rounded-sm mb-2 p-3.5 px-6 flex items-center gap-3.5 shadow-[2px_2px_0_rgba(0,0,0,.06)] max-md:flex-col max-md:items-start max-md:gap-1.5 max-md:px-5"
              >
                {isMajor ? (
                  <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-sm bg-major" />
                ) : (
                  <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-sm bg-sec-green" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-ink leading-normal flex items-baseline gap-2">
                    {name}
                    {isMajor && (
                      <span className="font-mono text-[9px] tracking-[.08em] px-2 py-0.5 rounded-sm bg-major-bg text-major-text">
                        MAJOR
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted mt-0.5">
                    {desc && <>{desc}&nbsp;&middot;&nbsp;</>}
                    {formatDate(r.publishedAt)}
                  </div>
                </div>
                {isMajor ? (
                  <span className="font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-sm tracking-[.04em] shrink-0 whitespace-nowrap bg-major-bg text-major-text">
                    {r.version}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-sm tracking-[.04em] shrink-0 whitespace-nowrap bg-minor-bg text-minor-text">
                    {r.version}
                  </span>
                )}
              </div>
            );
          })}

          {/* 付箋コメント */}
          {dailyComment && (
            <div className="mt-7 flex justify-center">
              <div className="relative w-full max-w-150 p-5 pb-6.5 bg-sticky-5 shadow-[3px_5px_12px_rgba(0,0,0,.18),0_1px_3px_rgba(0,0,0,.08)] rotate-[-0.5deg] max-md:rotate-0 max-md:max-w-full">
                <div className="font-mono text-[10px] tracking-[.08em] text-sticky-ink opacity-50 mb-2">
                  TODAY'S SECURITY COMMENT
                </div>
                <div className="text-[12.5px] leading-[1.9] text-sticky-ink">
                  {dailyComment}
                </div>
                <div className="sticky-fold max-md:hidden" />
              </div>
            </div>
          )}
        </div>

        {/* TAB 2: 脆弱性 */}
        <div
          id="tab-vulns"
          className={`tab-content${activeTab !== "vulns" ? " hidden" : ""}`}
        >
          <div className="flex items-center gap-2.5 mb-4 mt-2">
            <h2 className="font-mono text-xs font-medium tracking-[.08em] text-ink whitespace-nowrap">
              CRITICAL 脆弱性
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-muted tracking-[.06em] whitespace-nowrap">
              NVD&nbsp;&middot;&nbsp;CRITICAL only
            </span>
          </div>

          <input
            type="text"
            aria-label="CVE ID やキーワードで脆弱性を検索"
            placeholder="CVE ID やキーワードで検索..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full mb-4 px-4 py-2.5 font-mono text-[12px] text-ink bg-surface border border-border rounded-sm tracking-[.02em] outline-none transition-all placeholder:text-muted/50 focus:border-ink"
          />

          {filteredVulns.map((v, i) => (
            <div
              key={v.id}
              className={`vuln-card relative bg-surface border border-border rounded-sm mb-2.5 p-4.5 px-6 shadow-[2px_2px_0_rgba(0,0,0,.06)] max-md:px-5${
                i >= vulnVisibleCount ? " vuln-hidden" : ""
              }`}
            >
              <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-sm bg-critical" />
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <span className="font-mono text-[11px] font-medium text-ink tracking-[.04em]">
                  {v.cveId}
                </span>
                {v.cvssScore && (
                  <span className="font-mono text-[10px] tracking-[.04em] text-critical">
                    CVSS {v.cvssScore.toFixed(1)}
                  </span>
                )}
                <span className="font-mono text-[10px] text-muted tracking-[.04em]">
                  {formatDate(v.publishedAt)}
                </span>
              </div>
              <div className="text-[14px] font-bold leading-[1.55] text-ink tracking-[-0.01em]">
                {v.title}
              </div>
            </div>
          ))}

          {filteredVulns.length === 0 && query && (
            <p className="text-center text-muted py-8 font-mono text-[11px]">
              該当する脆弱性が見つかりません
            </p>
          )}

          {vulnVisibleCount < filteredVulns.length && (
            <button
              type="button"
              className="block w-full py-3 mt-2 bg-transparent border border-dashed border-border rounded-sm font-mono text-[11px] text-muted tracking-[.06em] cursor-pointer transition-all hover:border-ink hover:text-ink"
              id="vuln-more"
              onClick={() =>
                setVulnVisibleCount((prev) =>
                  Math.min(prev + STEP, filteredVulns.length),
                )
              }
            >
              + もっと見る
            </button>
          )}
        </div>

        {/* TAB 3: アップデート */}
        <div
          id="tab-updates"
          className={`tab-content${activeTab !== "updates" ? " hidden" : ""}`}
        >
          <div className="flex items-center gap-2.5 mb-4 mt-2">
            <h2 className="font-mono text-xs font-medium tracking-[.08em] text-ink whitespace-nowrap">
              リリース
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-muted tracking-[.06em] whitespace-nowrap">
              stable&nbsp;&middot;&nbsp;major + minor
            </span>
          </div>

          <input
            type="text"
            aria-label="リポジトリ名やバージョンでリリースを検索"
            placeholder="リポジトリ名やバージョンで検索..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full mb-4 px-4 py-2.5 font-mono text-[12px] text-ink bg-surface border border-border rounded-sm tracking-[.02em] outline-none transition-all placeholder:text-muted/50 focus:border-ink"
          />

          {filteredRels.map((r, i) => {
            const isMajor = r.type === "major";
            const name = resolveReleaseName(r.repo, repoMap);
            const desc = resolveReleaseDescription(r.repo, repoMap);
            return (
              <div
                key={r.id}
                className={`update-card relative bg-surface border border-border rounded-sm mb-2.5 p-4.5 px-6 flex items-center gap-3.5 shadow-[2px_2px_0_rgba(0,0,0,.06)] max-md:flex-col max-md:items-start max-md:gap-1.5 max-md:px-5${
                  i >= updateVisibleCount ? " update-hidden" : ""
                }`}
              >
                {isMajor ? (
                  <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-sm bg-major" />
                ) : (
                  <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-sm bg-sec-green" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ink leading-[1.4] tracking-[-0.01em] flex items-baseline gap-2">
                    {name}
                    {isMajor && (
                      <span className="font-mono text-[9px] tracking-[.08em] px-2 py-0.5 rounded-sm bg-major-bg text-major-text">
                        MAJOR
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-muted font-normal">
                      {formatDate(r.publishedAt)}
                    </span>
                  </div>
                  {desc && (
                    <div className="text-[11px] text-muted mt-0.5">{desc}</div>
                  )}
                </div>
                {isMajor ? (
                  <span className="font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-sm tracking-[.04em] shrink-0 whitespace-nowrap bg-major-bg text-major-text">
                    {r.version}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-sm tracking-[.04em] shrink-0 whitespace-nowrap bg-minor-bg text-minor-text">
                    {r.version}
                  </span>
                )}
              </div>
            );
          })}

          {filteredRels.length === 0 && query && (
            <p className="text-center text-muted py-8 font-mono text-[11px]">
              該当するリリースが見つかりません
            </p>
          )}

          {updateVisibleCount < filteredRels.length && (
            <button
              type="button"
              className="block w-full py-3 mt-2 bg-transparent border border-dashed border-border rounded-sm font-mono text-[11px] text-muted tracking-[.06em] cursor-pointer transition-all hover:border-ink hover:text-ink"
              id="update-more"
              onClick={() =>
                setUpdateVisibleCount((prev) =>
                  Math.min(prev + STEP, filteredRels.length),
                )
              }
            >
              + もっと見る
            </button>
          )}
        </div>
      </main>
    </>
  );
}
