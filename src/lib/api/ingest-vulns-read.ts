// 脆弱性読み出しロジック（GET用）
import type { AppDatabase } from "../../db/client";
import { vulnerabilities } from "../../db/schema";

/** 既存CVE-ID一覧を取得 */
export async function getVulnerabilityCveIds(
  db: AppDatabase,
): Promise<string[]> {
  const rows = await db
    .select({ cveId: vulnerabilities.cveId })
    .from(vulnerabilities);
  return rows.map((r) => r.cveId);
}
