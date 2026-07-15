/// <reference path="../.astro/types.d.ts" />

type D1Database = import("@cloudflare/workers-types").D1Database;
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type ExecutionContext = import("@cloudflare/workers-types").ExecutionContext;

// Astro v7 / @astrojs/cloudflare v14: bindings は Cloudflare.Env interface に定義し、
// cloudflare:workers の env をその型で公開する。
// （旧 v6 の inline な `const env: {...}` は cf14 の workers-types が宣言する
//  `export const env: Cloudflare.Env` と型が食い違い Env が空扱いになるため、
//  Cloudflare.Env 方式に統一する。）
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    KV: KVNamespace;
    INGEST_API_KEY: string;
    SENTRY_DSN?: string;
    SENTRY_RELEASE?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
