import { describe, expect, it } from "vitest";
import { repoToGitHubUrl } from "./github";

describe("repoToGitHubUrl", () => {
  it("owner/name 形式からGitHub URLを生成する", () => {
    expect(repoToGitHubUrl("facebook/react")).toBe(
      "https://github.com/facebook/react",
    );
  });

  it("大文字混在でもそのまま使う", () => {
    expect(repoToGitHubUrl("Microsoft/TypeScript")).toBe(
      "https://github.com/Microsoft/TypeScript",
    );
  });

  it("スラッシュが含まれない場合もそのまま組み立てる", () => {
    expect(repoToGitHubUrl("someproject")).toBe(
      "https://github.com/someproject",
    );
  });
});
