import { beforeEach, describe, expect, it } from "vitest";
import { vulnerabilities } from "../../db/schema";
import { createTestDbWithTables } from "../../db/test-helper";
import { getVulnerabilityCveIds } from "./ingest-vulns-read";

type TestDb = ReturnType<typeof createTestDbWithTables>["db"];
let db: TestDb;

const makeVuln = (cveId: string) => ({
  cveId,
  title: `脆弱性: ${cveId}`,
  cvssScore: 9.0,
  publishedAt: "2026-03-15",
});

beforeEach(() => {
  const t = createTestDbWithTables();
  db = t.db;
});

describe("getVulnerabilityCveIds", () => {
  it("空DBで空配列を返す", async () => {
    const ids = await getVulnerabilityCveIds(db);
    expect(ids).toEqual([]);
  });

  it("既存CVE-IDの一覧を返す", async () => {
    await db
      .insert(vulnerabilities)
      .values([makeVuln("CVE-2026-0001"), makeVuln("CVE-2026-0002")]);
    const ids = await getVulnerabilityCveIds(db);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("CVE-2026-0001");
    expect(ids).toContain("CVE-2026-0002");
  });
});
