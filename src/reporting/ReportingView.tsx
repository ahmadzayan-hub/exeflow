import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { t } from "../i18n";
import { api, type DatasetMeta, type Finding, type Health, type MemoryItem, type RunResult } from "./api";
import { Chart } from "./Charts";
import { Markdown } from "./Markdown";

export function ReportingView({ lang }: { lang: Lang }) {
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [reportLang, setReportLang] = useState<"en" | "ar">(lang);
  const [busy, setBusy] = useState<"upload" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runs, setRuns] = useState<{ id: string; question: string | null; lang: string; created_at: string; status: string }[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [memText, setMemText] = useState("");
  const [memKind, setMemKind] = useState("definition");
  const [showRejected, setShowRejected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
      const d = await api.datasets();
      setDatasets(d.datasets);
      setMemory((await api.memory()).items);
      setSelected((cur) => cur ?? d.datasets[0]?.id ?? null);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    api.runs(selected).then((r) => setRuns(r.runs)).catch(() => setRuns([]));
  }, [selected, result]);

  async function onUpload(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const r = await api.upload(file);
      await refresh();
      setSelected(r.dataset.id);
      setResult(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onRun() {
    if (!selected) return;
    setBusy("run");
    setError(null);
    try {
      setResult(await api.analyse(selected, question, reportLang));
      setMemory((await api.memory()).items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openRun(id: string) {
    try {
      setResult((await api.run(id)).result);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addMemory() {
    if (!memText.trim()) return;
    try {
      await api.remember(memKind, memText.trim());
      setMemText("");
      setMemory((await api.memory()).items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function forget(id: string) {
    await api.forget(id).catch(() => undefined);
    setMemory((await api.memory()).items);
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.report_md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execflow-report-${result.run_id}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const ds = datasets.find((d) => d.id === selected) ?? null;

  return (
    <section className="reporting">
      <div className="rep-head">
        <div>
          <h2>{t("reportingTitle", lang)}</h2>
          <p className="muted">{t("reportingIntro", lang)}</p>
        </div>
        {health && (
          <div className={`provider ${health.routing.mock ? "provider-mock" : ""}`}>
            <span className="tile-label">{t("models", lang)}</span>
            {Object.entries(health.routing.roles)
              .filter(([r]) => r !== "orchestrator")
              .map(([r, m]) => (
                <span key={r} className="small">
                  {r}: <code>{m}</code>
                </span>
              ))}
          </div>
        )}
      </div>

      {health === null && <div className="banner banner-error">{t("backendOffline", lang)}</div>}
      {health?.routing.mock && <div className="banner banner-demo">{t("mockWarning", lang)}</div>}
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="rep-grid">
        <aside className="rep-side">
          <div className="panel">
            <h3>{t("datasets", lang)}</h3>
            <button type="button" className="btn btn-primary" disabled={!health || busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === "upload" ? `${t("uploading", lang)}…` : t("upload", lang)}
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".xlsx,.xlsm,.xls,.csv,.tsv,.pdf,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            {datasets.length === 0 ? (
              <p className="muted small">{t("noDatasets", lang)}</p>
            ) : (
              <ul className="ds-list">
                {datasets.map((d) => (
                  <li key={d.id}>
                    <button type="button" className={`ds-item ${d.id === selected ? "active" : ""}`} onClick={() => setSelected(d.id)}>
                      <span className="ds-name">{d.name}</span>
                      <span className="muted small">
                        {d.kind.toUpperCase()} · {d.tables.length} {t("tables", lang)} · {d.tables.reduce((a, x) => a + x.row_count, 0)} {t("rows", lang)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3>{t("memory", lang)}</h3>
            <p className="muted small">{t("memoryHint", lang)}</p>
            <div className="mem-add">
              <select value={memKind} onChange={(e) => setMemKind(e.target.value)} aria-label="kind">
                {["definition", "baseline", "preference", "note"].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input value={memText} onChange={(e) => setMemText(e.target.value)} placeholder={t("memoryPlaceholder", lang)} onKeyDown={(e) => e.key === "Enter" && addMemory()} />
              <button type="button" className="btn" onClick={addMemory} disabled={!health}>
                {t("addMemory", lang)}
              </button>
            </div>
            <ul className="mem-list">
              {memory.map((m) => (
                <li key={m.id}>
                  <span className={`tag tag-${m.kind}`}>{m.kind}</span> {m.text}
                  <button type="button" className="btn-link small" onClick={() => forget(m.id)} aria-label="remove">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="rep-main">
          <div className="panel ask">
            <label className="field">
              <span>{t("question", lang)}</span>
              <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("questionPlaceholder", lang)} />
            </label>
            <div className="ask-row">
              <label className="select">
                <span>{t("reportLang", lang)}</span>
                <select value={reportLang} onChange={(e) => setReportLang(e.target.value as "en" | "ar")}>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
              <span className="muted small">{ds ? `${ds.filename}` : ""}</span>
              <button type="button" className="btn btn-primary" disabled={!ds || busy !== null} onClick={onRun}>
                {busy === "run" ? `${t("running", lang)}…` : t("run", lang)}
              </button>
            </div>
            {runs.length > 0 && (
              <details className="runs">
                <summary>
                  {t("runs", lang)} ({runs.length})
                </summary>
                <ul>
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="btn-link" onClick={() => openRun(r.id)}>
                        {r.created_at.slice(0, 16).replace("T", " ")} · {r.lang.toUpperCase()} · {r.question ?? "—"}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {result && <RunView result={result} lang={lang} showRejected={showRejected} onToggleRejected={() => setShowRejected((v) => !v)} onDownload={download} />}
        </div>
      </div>
    </section>
  );
}

function RunView({ result, lang, showRejected, onToggleRejected, onDownload }: { result: RunResult; lang: Lang; showRejected: boolean; onToggleRejected: () => void; onDownload: () => void }) {
  return (
    <div className="run" dir={result.lang === "ar" ? "rtl" : "ltr"}>
      {result.warnings.map((w) => (
        <div key={w} className="banner banner-demo small">
          {w}
        </div>
      ))}
      {result.kpis.length > 0 && (
        <div className="tiles kpis">
          {result.kpis.map((k, i) => (
            <div key={i} className="tile">
              <span className="tile-label">{k.label}</span>
              <span className="tile-value tile-value-sm">
                {typeof k.value === "number" ? k.value.toLocaleString() : k.value} <small>{k.unit}</small>
              </span>
              <span className="tile-sub">
                {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : ""} {k.evidence}
              </span>
            </div>
          ))}
        </div>
      )}

      {result.charts.length > 0 && (
        <div className="charts">
          {result.charts.map((c) => (
            <Chart key={c.evidence + c.title} spec={c} />
          ))}
        </div>
      )}

      <div className="panel">
        <h3>
          {t("findings", lang)} <span className="att-count">{result.findings.length}</span>
        </h3>
        {result.findings.length === 0 && <p className="muted">{t("nothingOpen", lang)}</p>}
        <ul className="list">
          {result.findings.map((f, i) => (
            <FindingRow key={i} f={f} lang={lang} />
          ))}
        </ul>
        {result.rejected.length > 0 && (
          <>
            <button type="button" className="btn-link" onClick={onToggleRejected}>
              {t("rejectedFindings", lang)} ({result.rejected.length})
            </button>
            {showRejected && (
              <ul className="list rejected">
                {result.rejected.map((f, i) => (
                  <li key={i}>
                    <strong>{f.title}</strong> <span className="muted small">{f.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="panel report">
        <div className="panel-head">
          <h3>{t("report", lang)}</h3>
          <div className="toolbar no-print">
            <button type="button" className="btn" onClick={onDownload}>
              {t("downloadReport", lang)}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              {t("print", lang)}
            </button>
          </div>
        </div>
        <Markdown text={result.report_md} />
        <p className="muted small meta">
          {t("models", lang)}: {Object.entries(result.models).map(([r, m]) => `${r}=${m}`).join(" · ")} · {t("timing", lang)}: {result.timings.total_s}s · {t("evidence", lang)}: {Object.keys(result.evidence).length}
          {result.memory_used.length > 0 && (
            <>
              {" · "}
              {t("memoryUsed", lang)}: {result.memory_used.length}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function FindingRow({ f, lang }: { f: Finding; lang: Lang }) {
  return (
    <li className="finding">
      <div>
        <span className={`tag tag-risk-${f.severity}`}>{t(f.severity, lang)}</span> <strong>{f.title}</strong>
      </div>
      <p>{f.detail}</p>
      {f.recommendation && (
        <p className="small">
          <span className="muted">{t("recommendationLabel", lang)}:</span> {f.recommendation}
        </p>
      )}
      <p className="muted small">
        {t("evidence", lang)}: {f.evidence.join(", ")}
        {f.review ? ` · ${f.review}` : ""}
      </p>
    </li>
  );
}
