import { afterEach, describe, expect, it, vi } from "vitest";
import type { StarBatch } from "./build-star-batches";
import { fetchBatch } from "./daily-stars";

const dummyBatch: StarBatch = {
  batchIndex: 0,
  query:
    '{ r0: repository(owner: "facebook", name: "react") { nameWithOwner stargazerCount } }',
  repoMap: { r0: "facebook/react" },
};

const successResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchBatch retry", () => {
  it("5xx → 200 で retry が効いて成功する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }))
      .mockResolvedValueOnce(
        successResponse({
          data: {
            r0: { nameWithOwner: "facebook/react", stargazerCount: 100 },
          },
        }),
      );

    const result = await fetchBatch(dummyBatch, "TOKEN");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.stars).toEqual([{ repo: "facebook/react", stars: 100 }]);
    expect(result.renames).toEqual([]);
  });

  it("MAX_ATTEMPTS まで 5xx が続けば (after N attempts) で throw", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("server error", { status: 502 }));

    await expect(fetchBatch(dummyBatch, "TOKEN")).rejects.toThrow(
      /GitHub GraphQL HTTP 502 batch=0 \(after 3 attempts\)/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("4xx は retry せず即 throw", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));

    await expect(fetchBatch(dummyBatch, "TOKEN")).rejects.toThrow(
      /GitHub GraphQL HTTP 401 batch=0 \(after 1 attempts\)/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
