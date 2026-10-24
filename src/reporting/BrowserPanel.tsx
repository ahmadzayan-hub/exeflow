import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyse, buildNarratePayload, loadBuffer, loadFile, narrate, profileDataset, type LocalDataset } from "../engine";
import type { Lang } from "../i18n";
import { tr } from "../ui/tr";
import type { RunResult } from "./api";
import { RunView } from "./RunView";
import { SAMPLE_NAME, sampleCsv } from "./sample";

interface NarrationStatus {
  enabled: boolean;
  requiresKey: boolean;
}

const KEY_STORE = "exeflow.narrate.key";

async function readNarrationStatus(): Promise<NarrationStatus> {
  try {
    const res = await fetch("/api/narrate", { headers: { Accept: "application/json" } });
    if (!res.ok) return { enabled: false, requiresKey: false };
    const body = (await res.json()) as Partial<NarrationStatus>;
    return { enabled: body.enabled === true, requiresKey: body.requiresKey === true };
  } catch {
    return { enabled: false, requiresKey: false };
  }
}

function sessionKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

export function BrowserPanel({ lang }: { lang: Lang }) {
  const x = tr(lang);
  const [dataset, setDataset] = useState<LocalDataset | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [question, setQuestion] = useState("");
  const [reportLang, setReportLang] = useState<Lang>(lang);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [narration, setNarration] = useState<NarrationStatus>({ enabled: false, requiresKey: false });
  const [accessKey, setAccessKey] = useState(sessionKey);
  const [ai, setAi] = useState<{ md: string; model: string } | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = useCallback((ds: LocalDataset, q: string, l: Lang) => {
    try {
      setResult(analyse(ds, { question: q, lang: l }));
      setAi(null);
      setAiNote(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const useSample = useCallback(async () => {
    setBusy(true);
    try {
      const ds = await loadBuffer(SAMPLE_NAME, new TextEncoder().encode(sampleCsv()));
      setDataset(ds);
      setIsSample(true);
      run(ds, "", reportLang);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [reportLang, run]);

  // Open with a working example so the first look shows what the screen does.
  useEffect(() => {
    void useSample();
    void readNarrationStatus().then(setNarration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ds = await loadFile(file);
      setDataset(ds);
      setIsSample(false);
      setQuestion("");
      run(ds, "", reportLang);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function polish() {
    if (!result) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const out = await narrate(buildNarratePayload(result), { accessKey: accessKey || undefined });
      if (out.ok) {
        setAi({ md: out.report_md, model: out.model });
        setAiNote(null);
      } else {
        setAiNote(x(`The AI draft was discarded because it contained a number that is not in your data (${out.reason}). The verified report is unchanged.`, `تم تجاهل مسودة الذكاء الاصطناعي لأنها تحتوي على رقم غير موجود في بياناتك (${out.reason}). التقرير الموثق لم يتغير.`));
      }
    } catch (e) {
      setAiNote((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([ai?.md ?? result.report_md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execflow-report-${(dataset?.name ?? "data").replace(/[^\w-]+/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const profile = useMemo(() => (dataset ? profileDataset(dataset) : null), [dataset]);

  return (
    <div className="browser-panel">
      <div
        className={`dropzone ${dragging ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <div>
          <strong>{x("Drop a CSV or Excel file here", "أفلت ملف CSV أو Excel هنا")}</strong>
          <p className="muted small">{x("It is read on this device. Nothing is uploaded.", "يُقرأ الملف على هذا الجهاز. لا يُرفع أي شيء.")}</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {x("Choose file", "اختيار ملف")}
          </button>
          <button type="button" className="btn" onClick={() => void useSample()} disabled={busy}>
            {x("Use sample data", "استخدام بيانات عيّنة")}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".csv,.tsv,.xlsx,.xlsm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {dataset && (
        <div className="panel">
          <div className="panel-head">
            <h3>
              {dataset.filename}
              {isSample && <span className="tag tag-illustrative">{x("sample", "عيّنة")}</span>}
            </h3>
            <span className="muted small">
              {dataset.tables.length} {x("tables", "جداول")} · {dataset.tables.reduce((a, t) => a + t.rows.length, 0).toLocaleString("en-US")} {x("rows", "صف")}
            </span>
          </div>
          <label className="field">
            <span>{x("Question for the analyst (optional)", "سؤال للمحلل (اختياري)")}</span>
            <textarea rows={2} value={question} dir="auto" onChange={(e) => setQuestion(e.target.value)} placeholder={x("e.g. Which system drives failures, and is it getting worse?", "مثال: أي نظام يقود الأعطال، وهل يتفاقم؟")} />
          </label>
          <div className="ask-row">
            <label className="select">
              <span>{x("Report language", "لغة التقرير")}</span>
              <select
                value={reportLang}
                onChange={(e) => {
                  const l = e.target.value as Lang;
                  setReportLang(l);
                  run(dataset, question, l);
                }}
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={() => run(dataset, question, reportLang)}>
              {x("Run analysis", "تشغيل التحليل")}
            </button>
          </div>
          {profile && (
            <details className="runs">
              <summary>{x("Data profile: what the engine saw", "ملف البيانات: ما رآه المحرك")}</summary>
              {profile.tables.map((t) => (
                <div key={t.name} className="scroll-x">
                  <p className="small">
                    <strong>{t.name}</strong> · {t.row_count} {x("rows", "صف")}
                  </p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{x("Column", "العمود")}</th>
                        <th>{x("Kind", "النوع")}</th>
                        <th>{x("Missing", "الناقص")}</th>
                        <th>{x("Distinct", "المتميز")}</th>
                        <th>{x("Range or top values", "النطاق أو أعلى القيم")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.columns.map((c) => (
                        <tr key={c.name}>
                          <td dir="auto">{c.name}</td>
                          <td>{c.kind}</td>
                          <td>{c.null_pct}%</td>
                          <td>{c.distinct}</td>
                          <td className="small" dir="auto">
                            {c.top ? c.top.map((v) => `${v.value} (${v.count})`).join(", ") : c.min != null ? `${c.min} to ${c.max}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {result && (
        <RunView
          result={result}
          lang={lang}
          showRejected={showRejected}
          onToggleRejected={() => setShowRejected((v) => !v)}
          onDownload={download}
          reportMd={ai?.md}
          reportBadge={
            <p className={`provenance ${ai ? "ai" : ""}`}>
              {ai
                ? x(`AI wording by ${ai.model}. Every number was checked against your data before it replaced the verified text.`, `صياغة بواسطة ${ai.model}. تم التحقق من كل رقم مقابل بياناتك قبل أن تحل محل النص الموثق.`)
                : x("Verified report: every number is computed from your data and traceable to an evidence id.", "تقرير موثق: كل رقم محسوب من بياناتك وقابل للتتبع إلى معرّف دليل.")}
            </p>
          }
          reportActions={
            narration.enabled ? (
              <>
                {narration.requiresKey && !ai && (
                  <input
                    className="key-input"
                    type="password"
                    value={accessKey}
                    placeholder={x("Access key", "مفتاح الوصول")}
                    aria-label={x("Access key", "مفتاح الوصول")}
                    onChange={(e) => {
                      setAccessKey(e.target.value);
                      try {
                        sessionStorage.setItem(KEY_STORE, e.target.value);
                      } catch {
                        /* session only */
                      }
                    }}
                  />
                )}
                {ai ? (
                  <button type="button" className="btn" onClick={() => setAi(null)}>
                    {x("Back to verified text", "العودة إلى النص الموثق")}
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => void polish()} disabled={aiBusy}>
                    {aiBusy ? x("Writing…", "جارٍ الكتابة…") : x("Polish with AI", "تحسين الصياغة بالذكاء الاصطناعي")}
                  </button>
                )}
              </>
            ) : null
          }
        />
      )}
      {aiNote && (
        <div className="banner banner-demo" role="status">
          {aiNote}
        </div>
      )}
    </div>
  );
}
