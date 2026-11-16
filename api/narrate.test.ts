// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, validate } from "./narrate";

const good = {
  lang: "en",
  question: null,
  dataset: { name: "kpi.xlsx", tables: [{ name: "KPI_Data", row_count: 15 }] },
  findings: [{ title: "Signalling has the highest Failures", detail: "sum of Failures for Signalling is 61", severity: "medium", recommendation: "Review the drivers" }],
  kpis: [{ label: "Top system", value: "Signalling", unit: "" }],
  gaps: [],
};
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/narrate", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

describe("api/narrate", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test_secret");
    vi.stubEnv("EXECFLOW_ACCESS_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports whether it is enabled", async () => {
    expect(await GET().json()).toEqual({ enabled: true, requiresKey: false });
    vi.stubEnv("GROQ_API_KEY", "");
    expect((await GET().json()).enabled).toBe(false);
  });

  it("answers 501 when no model key is configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    expect((await POST(req(good, { "x-forwarded-for": "1.1.1.1" }))).status).toBe(501);
  });

  it("requires the access key when one is set", async () => {
    vi.stubEnv("EXECFLOW_ACCESS_KEY", "letmein");
    expect((await POST(req(good, { "x-forwarded-for": "2.2.2.2" }))).status).toBe(401);
    expect((await POST(req(good, { "x-forwarded-for": "2.2.2.2", "x-execflow-key": "wrong" }))).status).toBe(401);
  });

  it("rejects malformed, oversized and prompt-stuffed payloads", async () => {
    expect((await POST(req("not json", { "x-forwarded-for": "3.3.3.3" }))).status).toBe(400);
    expect((await POST(req({ ...good, findings: [] }, { "x-forwarded-for": "3.3.3.3" }))).status).toBe(400);
    expect((await POST(req({ ...good, lang: "fr" }, { "x-forwarded-for": "3.3.3.3" }))).status).toBe(400);
    expect((await POST(req({ ...good, dataset: { name: "x".repeat(200), tables: [] } }, { "x-forwarded-for": "3.3.3.3" }))).status).toBe(400);
    expect((await POST(req("x".repeat(30_000), { "x-forwarded-for": "3.3.3.3" }))).status).toBe(413);
    expect(validate(good)).not.toBeNull();
  });

  it("forwards only the aggregates, with the key in the header, and returns the report", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "# Executive summary\nSignalling leads with 61 failures." } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req(good, { "x-forwarded-for": "4.4.4.4" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report_md).toContain("61");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gsk_test_secret");
    expect(String(init.body)).toContain("Signalling has the highest Failures");
    expect(JSON.stringify(body)).not.toContain("gsk_test_secret");
  });

  it("hides upstream details when the provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret upstream text", { status: 500 })));
    const res = await POST(req(good, { "x-forwarded-for": "5.5.5.5" }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret upstream text");
  });

  it("rate limits a single caller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })));
    let last = 200;
    for (let i = 0; i < 14; i++) last = (await POST(req(good, { "x-forwarded-for": "6.6.6.6" }))).status;
    expect(last).toBe(429);
  });
});
