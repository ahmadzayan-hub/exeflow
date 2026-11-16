import type { Lang } from "../i18n";
import { t } from "../i18n";
import type { Finding, RunResult } from "./api";
import { Chart } from "./Charts";
import { Markdown } from "./Markdown";
import type { ReactNode } from "react";

export function RunView({ result, lang, showRejected, onToggleRejected, onDownload, reportMd, reportBadge, reportActions }: { result: RunResult; lang: Lang; showRejected: boolean; onToggleRejected: () => void; onDownload: () => void; reportMd?: string; reportBadge?: ReactNode; reportActions?: ReactNode }) {
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
            {reportActions}
            <button type="button" className="btn" onClick={onDownload}>
              {t("downloadReport", lang)}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              {t("print", lang)}
            </button>
          </div>
        </div>
        {reportBadge}
        <Markdown text={reportMd ?? result.report_md} />
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
