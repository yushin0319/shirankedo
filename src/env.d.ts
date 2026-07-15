/// <reference path="../.astro/types.d.ts" />

type D1Database = import("@cloudflare/workers-types").D1Database;
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type ExecutionContext = import("@cloudflare/workers-types").ExecutionContext;

// Astro v7 / @astrojs/cloudflare v14: cloudflare:workers の env は Cloudflare.Env 型。
// bindings は Cloudflare.Env interface を augment して型付けする
// （旧 v6 の `declare module "cloudflare:workers" { const env }` は workers-types の
//  `export const env: Cloudflare.Env` と衝突し Env が空扱いになるため廃止）。
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    KV: KVNamespace;
    INGEST_API_KEY: string;
    SENTRY_DSN?: string;
    SENTRY_RELEASE?: string;
  }
}
