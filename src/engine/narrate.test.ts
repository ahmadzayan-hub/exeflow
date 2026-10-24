// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { analyse } from "./insights";
import { buildNarratePayload, isNarrationAvailable, narrate, type NarratePayload } from "./narrate";
import { loadFixture } from "./testing";

let payload: NarratePayload;

beforeAll(async () => {
  const r = analyse(await loadFixture("kpi_q2_2026.csv"), { lang: "en", question: "delay", now: Date.UTC(2026, 9, 23) });
  payload = buildNarratePayload(r);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("buildNarratePayload", () => {
  it("has the contract fields", () => {
    expect(Object.keys(payload).sort()).toEqual(["dataset", "findings", "gaps", "kpis", "lang", "question"]);
    expect(payload.lang).toBe("en");
    expect(payload.question).toBe("delay");
    expect(payload.dataset).toEqual({ name: "kpi_q2_2026", tables: [{ name: "data", row_count: 15 }] });
    expect(payload.findings.length).toBeGreaterThan(0);
    expect(Object.keys(payload.findings[0]).sort()).toEqual(["detail", "recommendation", "severity", "title"]);
  });
});

describe("isNarrationAvailable", () => {
  it("is true when the endpoint says enabled", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse({ enabled: true }));
    expect(await isNarrationAvailable(fetchImpl)).toBe(true);
    expect(calls[0].url).toBe("/api/narrate");
    expect(calls[0].init?.method).toBe("GET");
  });

  it("is false when disabled, missing, broken or not JSON", async () => {
    expect(await isNarrationAvailable(mockFetch(() => jsonResponse({ enabled: false })).fetchImpl)).toBe(false);
    expect(await isNarrationAvailable(mockFetch(() => jsonResponse({}, 404)).fetchImpl)).toBe(false);
    expect(await isNarrationAvailable(mockFetch(() => new Response("<html>spa fallback</html>", { status: 200 })).fetchImpl)).toBe(false);
    expect(await isNarrationAvailable(mockFetch(() => Promise.reject(new Error("offline"))).fetchImpl)).toBe(false);
  });
});

describe("narrate", () => {
  const faithful = [
    "# Executive summary",
    "",
    "Total Delay Minutes fell 67.4% in 2026-07 compared with 2026-06. Rolling Stock recorded 1680 of 3550.",
    "",
    "## Recommended actions",
    "",
    "1. Check row 11 in the source file.",
    "2. Review the 15 rows again.",
  ].join("\n");

  it("returns a faithful narration and sends the contract", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse({ report_md: faithful, model: "test-model" }));
    const r = await narrate(payload, { fetchImpl, accessKey: "secret" });
    expect(r).toEqual({ ok: true, report_md: faithful, model: "test-model" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/narrate");
    expect(calls[0].init?.method).toBe("POST");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-execflow-key"]).toBe("secret");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(JSON.parse(JSON.stringify(payload)));
  });

  it("omits the key header when none is given", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse({ report_md: faithful, model: "m" }));
    await narrate(payload, { fetchImpl });
    expect((calls[0].init?.headers as Record<string, string>)["x-execflow-key"]).toBeUndefined();
  });

  it("accepts thousands separators and percentage signs on payload numbers", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse({ report_md: "Delay minutes total 3,550 and 51.3% sits with Signalling.", model: "m" }));
    expect(await narrate(payload, { fetchImpl })).toMatchObject({ ok: true });
  });

  it("rejects a response with an invented number and keeps no text", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse({ report_md: "Delay fell 67.4% and cost 987654 dirhams.", model: "m" }));
    const r = await narrate(payload, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("987654");
      expect(r.report_md).toBeUndefined();
    }
  });

  it("rejects a plausible but absent number", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse({ report_md: "Failures were 120 in total.", model: "m" }));
    expect((await narrate(payload, { fetchImpl })).ok).toBe(false);
  });

  it("throws on a non-2xx reply", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse({ detail: "bad key" }, 401));
    await expect(narrate(payload, { fetchImpl })).rejects.toThrow(/401.*bad key/);
    const boom = mockFetch(() => new Response("oops", { status: 500, statusText: "Server Error" }));
    await expect(narrate(payload, { fetchImpl: boom.fetchImpl })).rejects.toThrow(/500/);
  });

  it("throws when the reply has no report", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse({ model: "m" }));
    await expect(narrate(payload, { fetchImpl })).rejects.toThrow(/report_md/);
  });
});
