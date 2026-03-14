import { describe, expect, it } from "vitest";
import { resolveReleaseDescription, resolveReleaseName } from "./security";

describe("resolveReleaseName", () => {
  const repoMap = new Map([
    [
      "tensorflow/tensorflow",
      { displayName: "TensorFlow", description: "機械学習フレームワーク" },
    ],
    [
      "shadcn-ui/ui",
      { displayName: "shadcn/ui", description: "UIコンポーネントライブラリ" },
    ],
  ]);

  it("tracking_reposにマッチする場合、display_nameを返す", () => {
    expect(resolveReleaseName("tensorflow/tensorflow", repoMap)).toBe(
      "TensorFlow",
    );
    expect(resolveReleaseName("shadcn-ui/ui", repoMap)).toBe("shadcn/ui");
  });

  it("tracking_reposにマッチしない場合、repoスラッグをそのまま返す", () => {
    expect(resolveReleaseName("unknown/repo", repoMap)).toBe("unknown/repo");
  });
});

describe("resolveReleaseDescription", () => {
  const repoMap = new Map([
    [
      "tensorflow/tensorflow",
      { displayName: "TensorFlow", description: "機械学習フレームワーク" },
    ],
    [
      "rust-lang/rust",
      { displayName: "Rust", description: null as string | null },
    ],
  ]);

  it("tracking_reposにdescriptionがある場合、それを返す", () => {
    expect(resolveReleaseDescription("tensorflow/tensorflow", repoMap)).toBe(
      "機械学習フレームワーク",
    );
  });

  it("descriptionがnullの場合、nullを返す", () => {
    expect(resolveReleaseDescription("rust-lang/rust", repoMap)).toBeNull();
  });

  it("tracking_reposにマッチしない場合、nullを返す", () => {
    expect(resolveReleaseDescription("unknown/repo", repoMap)).toBeNull();
  });
});
