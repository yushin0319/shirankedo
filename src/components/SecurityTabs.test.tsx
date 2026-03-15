import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { RepoInfo } from "../lib/security";
import { SecurityTabs } from "./SecurityTabs";

afterEach(cleanup);

function makeVulns(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    cveId: `CVE-2026-${1000 + i}`,
    title: `Vulnerability ${i}`,
    cvssScore: 9.8 - i * 0.1,
    publishedAt: "2026-03-14",
    createdAt: "2026-03-14",
    updatedAt: null,
  }));
}

function makeReleases(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    repo: `org/repo-${i}`,
    tag: `v${i + 1}.0.0`,
    version: `${i + 1}.0.0`,
    type: i % 3 === 0 ? "major" : "minor",
    publishedAt: "2026-03-14",
    createdAt: "2026-03-14",
    updatedAt: null,
  }));
}

const repoMap: Record<string, RepoInfo> = {
  "org/repo-0": { displayName: "Repo Zero", description: "A test repo" },
  "org/repo-3": { displayName: "Repo Three", description: null },
};

const defaultProps = {
  vulns: makeVulns(12),
  rels: makeReleases(12),
  repoMap,
  dailyComment: "今日のセキュリティコメント",
};

describe("SecurityTabs", () => {
  describe("タブ切り替え", () => {
    it("初期表示で「日次サマリー」タブがアクティブ", () => {
      render(<SecurityTabs {...defaultProps} />);
      const tab = screen.getByRole("button", { name: "日次サマリー" });
      expect(tab).toHaveClass("active");
      const panel = document.getElementById("tab-summary");
      expect(panel).not.toHaveClass("hidden");
    });

    it("「脆弱性」クリックでパネル切り替え", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "脆弱性" }));

      expect(document.getElementById("tab-vulns")).not.toHaveClass("hidden");
      expect(document.getElementById("tab-summary")).toHaveClass("hidden");
    });

    it("「アップデート」クリックでパネル切り替え", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "アップデート" }));

      expect(document.getElementById("tab-updates")).not.toHaveClass("hidden");
      expect(document.getElementById("tab-summary")).toHaveClass("hidden");
    });
  });

  describe("もっと見る・段階追加（脆弱性）", () => {
    it("11件目以降が非表示", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} vulns={makeVulns(25)} />);

      await user.click(screen.getByRole("button", { name: "脆弱性" }));

      const panel = document.getElementById("tab-vulns");
      const hidden = panel?.querySelectorAll(".vuln-hidden") ?? [];
      expect(hidden.length).toBe(15); // 25件中15件非表示
    });

    it("「もっと見る」クリックで10件ずつ追加", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} vulns={makeVulns(25)} />);

      await user.click(screen.getByRole("button", { name: "脆弱性" }));

      const moreBtn = document.getElementById("vuln-more");
      await user.click(moreBtn!);

      // 1回クリック: 20件表示、5件非表示
      const panel = document.getElementById("tab-vulns");
      const hidden = panel?.querySelectorAll(".vuln-hidden") ?? [];
      expect(hidden.length).toBe(5);
    });

    it("全件表示でボタンが消える", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} vulns={makeVulns(25)} />);

      await user.click(screen.getByRole("button", { name: "脆弱性" }));

      // 2回クリックで全件表示
      await user.click(document.getElementById("vuln-more")!);
      await user.click(document.getElementById("vuln-more")!);

      const panel = document.getElementById("tab-vulns");
      const hidden = panel?.querySelectorAll(".vuln-hidden") ?? [];
      expect(hidden.length).toBe(0);

      // ボタンが消えている
      expect(document.getElementById("vuln-more")).toBeNull();
    });
  });

  describe("もっと見る・段階追加（アップデート）", () => {
    it("独立して動作し10件ずつ追加", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} rels={makeReleases(25)} />);

      await user.click(screen.getByRole("button", { name: "アップデート" }));

      const panel = document.getElementById("tab-updates");
      const hidden = panel?.querySelectorAll(".update-hidden") ?? [];
      expect(hidden.length).toBe(15);

      await user.click(document.getElementById("update-more")!);

      const hiddenAfter = panel?.querySelectorAll(".update-hidden") ?? [];
      expect(hiddenAfter.length).toBe(5);
    });

    it("全件表示でボタンが消える", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} rels={makeReleases(25)} />);

      await user.click(screen.getByRole("button", { name: "アップデート" }));

      await user.click(document.getElementById("update-more")!);
      await user.click(document.getElementById("update-more")!);

      const panel = document.getElementById("tab-updates");
      const hidden = panel?.querySelectorAll(".update-hidden") ?? [];
      expect(hidden.length).toBe(0);

      expect(document.getElementById("update-more")).toBeNull();
    });
  });

  describe("日次サマリー", () => {
    it("脆弱性TOP5が表示される", () => {
      render(<SecurityTabs {...defaultProps} />);
      const panel = document.getElementById("tab-summary");
      // 最初の5件のCVEが表示される
      expect(panel?.textContent).toContain("CVE-2026-1000");
      expect(panel?.textContent).toContain("CVE-2026-1004");
      // 6件目は表示されない
      expect(panel?.textContent).not.toContain("CVE-2026-1005");
    });

    it("リリースTOP5が表示される", () => {
      render(<SecurityTabs {...defaultProps} />);
      const panel = document.getElementById("tab-summary");
      // repoMapにある名前が使われる
      expect(panel?.textContent).toContain("Repo Zero");
    });
  });

  describe("付箋", () => {
    it("dailyComment があるとき表示される", () => {
      render(<SecurityTabs {...defaultProps} />);
      expect(
        screen.getByText("今日のセキュリティコメント"),
      ).toBeInTheDocument();
    });

    it("dailyComment null のとき非表示", () => {
      render(<SecurityTabs {...defaultProps} dailyComment={null} />);
      expect(
        screen.queryByText("今日のセキュリティコメント"),
      ).not.toBeInTheDocument();
    });
  });

  describe("リリース表示", () => {
    it("type===major で MAJOR バッジ表示", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "アップデート" }));

      const panel = document.getElementById("tab-updates");
      expect(panel?.textContent).toContain("MAJOR");
    });

    it("repoMapのdisplayNameが使われる", async () => {
      const user = userEvent.setup();
      render(<SecurityTabs {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "アップデート" }));

      const panel = document.getElementById("tab-updates");
      expect(panel?.textContent).toContain("Repo Zero");
    });
  });
});
