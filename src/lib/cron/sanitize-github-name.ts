/** GitHub owner/name のサニタイズ（許可文字のみ残す） */
export function sanitizeGitHubName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}
