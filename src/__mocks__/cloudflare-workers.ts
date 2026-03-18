// テスト用 cloudflare:workers モック
export const env = {
  INGEST_API_KEY: "test-key",
  DB: {},
  KV: {
    get: async () => null,
    put: async () => {},
  },
};
