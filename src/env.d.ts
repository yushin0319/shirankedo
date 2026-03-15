/// <reference path="../.astro/types.d.ts" />

type D1Database = import("@cloudflare/workers-types").D1Database;
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;

// Astro v6: cloudflare:workers の env 型定義
declare module "cloudflare:workers" {
  const env: {
    DB: D1Database;
    KV: KVNamespace;
    INGEST_API_KEY: string;
  };
}
