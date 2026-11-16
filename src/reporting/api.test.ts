import { afterEach, expect, it, vi } from "vitest";
import { api, setApiToken } from "./api";

afterEach(() => { setApiToken(""); vi.unstubAllGlobals(); });
it("sends the runtime token on reads and writes without persisting it", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  setApiToken("test-only-value");
  await api.health(); await api.datasets(); await api.memory(); await api.runs();
  await api.run("x"); await api.remember("preference", "x"); await api.forget("x");
  await api.analyse("x", "q", "en"); await api.upload(new File(["x"], "x.csv"));
  for (const [, options] of fetcher.mock.calls) {
    expect(options.headers.get("Authorization")).toBe("Bearer test-only-value");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
  }
  expect(fetcher.mock.calls[5][1].headers.get("Content-Type")).toBe("application/json");
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  setApiToken("");
  await api.health();
  expect(fetcher.mock.lastCall?.[1].headers.has("Authorization")).toBe(false);
});
