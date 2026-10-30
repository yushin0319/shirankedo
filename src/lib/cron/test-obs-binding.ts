import { vi } from "vitest";
import type { ServiceBinding } from "./cron-shared";

/**
 * observability-tail への Service binding (env.OBS) のテスト用の偽物。
 * 送られた本文を bodies に積み、observability-tail と同じく 200 を返す。
 */
export function fakeObsBinding(bodies: Record<string, unknown>[] = []) {
  const fetch = vi.fn(async (_input: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  });
  const binding: ServiceBinding = { fetch };
  return { binding, fetch, bodies };
}
