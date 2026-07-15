import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Astro7(rolldown-vite) の暫定回避: SSR/webworker ビルドでも platform が 'node' に
    // 既定化され `createRequire(import.meta.url)` を出力 → workerd で import.meta.url が
    // undefined になり worker が起動時クラッシュする (vite#21969, 修正済みだが astro7.0.9
    // 同梱の rolldown-vite 未取込)。platform を neutral にして createRequire 出力を回避。
    build: {
      rolldownOptions: {
        platform: "neutral",
      },
    },
  },
});
