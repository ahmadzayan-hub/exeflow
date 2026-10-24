import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { derivedFlags, formatAed, formatDate, isAttentionOverdue, isMilestoneOverdue, scheduleRag, scheduleVariance, timeElapsedPct } from "../metrics";
import type { Project, Stage } from "../types";
import { tr } from "../ui/tr";

export interface DetailHandlers {
  onProgress: (projectId: string, planned: number | null, actual: number | null) => void;
  onMilestone: (projectId: string, milestoneId: string, done: boolean) => void;
  onStage: (projectId: string, stage: Stage) => void;
  onDone: (projectId: string, itemId: string) => void;
  onReopen: (projectId: string, itemId: string) => void;
  onSnooze: (projectId: string, itemId: string, days: number) => void;
  onRemove: (projectId: string, itemId: string) => void;
}

interface Props extends DetailHandlers {
  project: Project;
  today: Date;
  lang: Lang;
  onClose: () => void;
}

const STAGES: Stage[] = ["planning", "procurement", "mobilisation", "execution", "commissioning", "dlp", "closing", "closed"];

const parsePct = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function ProjectDetail({ project: p, today, lang, onClose, onProgress, onMilestone, onStage, onDone, onReopen, onSnooze, onRemove }: Props) {
  const x = tr(lang);
  const [planned, setPlanned] = useState(p.progress.planned?.toString() ?? "");
  const [actual, setActual] = useState(p.progress.actual?.toString() ?? "");
  useEffect(() => {
    setPlanned(p.progress.planned?.toString() ?? "");
    setActual(p.progress.actual?.toString() ?? "");
  }, [p.id, p.progress.planned, p.progress.actual]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rag = scheduleRag(p, today);
  const elapsed = timeElapsedPct(p, today);
  const flags = derivedFlags(p, today);
  const variance = scheduleVariance({ ...p, progress: { planned: parsePct(planned), actual: parsePct(actual) } });
  const dirty = parsePct(planned) !== p.progress.planned || parsePct(actual) !== p.progress.actual;

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <div className="badges">
              <span className={`badge badge-${p.asset}`}>{t(p.asset, lang)}</span>
              <span className="badge">{t(p.category, lang)}</span>
              <span className="badge badge-stage">{t(p.stage, lang)}</span>
              <span className={`rag-pill rag-${rag}`}>{t(rag, lang)}</span>
              <span className={`tag tag-${p.confidence}`}>{t(p.confidence, lang)}</span>
            </div>
            <h2 id="drawer-title">{bi(p.name, lang)}</h2>
            <p className="card-code">{p.code ?? t("tbcShort", lang)}</p>
          </div>
          <button type="button" className="btn no-print" onClick={onClose}>
            {t("close", lang)}
          </button>
        </header>

        <dl className="facts-grid">
          <Fact label={t("contractor", lang)} value={p.contractor ?? t("tbcShort", lang)} />
          <Fact label={t("consultant", lang)} value={p.consultant ?? t("tbcShort", lang)} />
          <Fact label={t("value", lang)} value={formatAed(p.valueAed, lang)} />
          <Fact label={t("spent", lang)} value={formatAed(p.spentAed, lang)} />
          <Fact label={t("ntp", lang)} value={formatDate(p.ntp, lang)} />
          <Fact label={t("completion", lang)} value={formatDate(p.completion, lang)} />
          <Fact label={t("dlpEnd", lang)} value={formatDate(p.dlpEnd, lang)} />
          <Fact label={t("timeElapsed", lang)} value={elapsed != null ? `${elapsed}%` : t("tbcShort", lang)} />
        </dl>

        <section className="update no-print">
          <h3>{x("Monthly update", "التحديث الشهري")}</h3>
          <div className="update-grid">
            <label>
              <span>{x("Planned progress %", "الإنجاز المخطط %")}</span>
              <input type="number" min={0} max={100} step="0.5" inputMode="decimal" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </label>
            <label>
              <span>{x("Actual progress %", "الإنجاز الفعلي %")}</span>
              <input type="number" min={0} max={100} step="0.5" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
            <label>
              <span>{x("Stage", "المرحلة")}</span>
              <select value={p.stage} onChange={(e) => onStage(p.id, e.target.value as Stage)}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(s, lang)}
                  </option>
                ))}
              </select>
            </label>
            <div className="update-result">
              <span className="muted small">{x("Variance", "الانحراف")}</span>
              <strong className={variance == null ? "" : variance >= -2 ? "text-green" : variance >= -10 ? "text-amber" : "text-red"}>{variance == null ? "—" : `${variance > 0 ? "+" : ""}${variance} pp`}</strong>
            </div>
            <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => onProgress(p.id, parsePct(planned), parsePct(actual))}>
              {x("Save progress", "حفظ الإنجاز")}
            </button>
          </div>
        </section>

        {flags.length > 0 && (
          <section>
            <h3>{t("derived", lang)}</h3>
            <ul className="list">
              {flags.map((f) => (
                <li key={f.id} className={f.kind === "completion-approaching" ? "" : "flag"}>
                  {lang === "ar" ? f.title.ar : f.title.en}
                  {" · "}
                  <strong>
                    {f.days} {f.kind === "contract-expiry" || f.kind === "completion-approaching" ? t("daysLeft", lang) : t("daysOverdue", lang)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.workPackages && p.workPackages.length > 0 && (
          <section>
            <h3>{t("workPackages", lang)}</h3>
            <table className="table">
              <tbody>
                {p.workPackages.map((wp) => (
                  <tr key={wp.code}>
                    <th scope="row">{wp.code}</th>
                    <td>{bi(wp.title, lang)}</td>
                    <td className="num">{formatAed(wp.valueAed, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h3>{t("milestones", lang)}</h3>
          {p.milestones.length === 0 ? (
            <p className="muted">{t("noMilestone", lang)}</p>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("milestones", lang)}</th>
                    <th>{t("planned", lang)}</th>
                    <th>{t("actual", lang)}</th>
                    <th>{t("status", lang)}</th>
                    <th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {p.milestones.map((m) => {
                    const late = isMilestoneOverdue(m, today);
                    return (
                      <tr key={m.id} className={late ? "row-late" : ""}>
                        <td>{bi(m.title, lang)}</td>
                        <td>{formatDate(m.planned, lang)}</td>
                        <td>{formatDate(m.actual, lang)}</td>
                        <td>
                          <span className={`status status-${late ? "late" : m.status}`}>{late ? t("overdue", lang) : t(m.status, lang)}</span>
                        </td>
                        <td className="no-print">
                          <button type="button" className="mini" onClick={() => onMilestone(p.id, m.id, m.status !== "done")}>
                            {m.status === "done" ? x("Reopen", "إعادة فتح") : x("Mark done", "تحديد كمنجز")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3>{t("attention", lang)}</h3>
          {p.attention.length === 0 ? (
            <p className="muted">{t("nothingOpen", lang)}</p>
          ) : (
            <ul className="list">
              {p.attention.map((a) => {
                const late = isAttentionOverdue(a, today);
                return (
                  <li key={a.id} className={`att-line att-line-${a.type} ${a.status === "closed" ? "closed" : ""}`}>
                    <div>
                      <span className={`tag tag-${late ? "overdue" : a.type}`}>{late ? t("overdue", lang) : t(a.type, lang)}</span> {bi(a.title, lang)}
                      <div className="muted small">
                        {a.owner && <span>{t("owner", lang)}: {a.owner} · </span>}
                        {a.due && <span>{t("due", lang)}: {formatDate(a.due, lang)} · </span>}
                        {a.reference && <span>{a.reference} · </span>}
                        {a.status === "closed" && a.closedOn && <span>{t("closed", lang)}: {formatDate(a.closedOn, lang)} · </span>}
                        {a.confidence && <span>{t(a.confidence, lang)}</span>}
                        {a.capturedFrom && <div dir="auto">“{a.capturedFrom}”</div>}
                        {a.note && <div>{a.note}</div>}
                      </div>
                    </div>
                    <span className="row-actions no-print">
                      {a.status === "open" ? (
                        <>
                          <button type="button" className="mini" onClick={() => onDone(p.id, a.id)}>{x("Done", "تم")}</button>
                          <button type="button" className="mini" onClick={() => onSnooze(p.id, a.id, 7)}>+7d</button>
                        </>
                      ) : (
                        <button type="button" className="mini" onClick={() => onReopen(p.id, a.id)}>{x("Reopen", "إعادة فتح")}</button>
                      )}
                      {a.capturedFrom && (
                        <button type="button" className="mini" onClick={() => onRemove(p.id, a.id)}>{x("Remove", "حذف")}</button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3>{t("risks", lang)}</h3>
          {p.risks.length === 0 ? (
            <p className="muted">{t("nothingOpen", lang)}</p>
          ) : (
            <ul className="list">
              {p.risks.map((r) => (
                <li key={r.id}>
                  <span className={`tag tag-risk-${r.rating}`}>{t(r.rating, lang)}</span> {bi(r.title, lang)}
                  {(r.owner || r.mitigation) && (
                    <div className="muted small">
                      {r.owner && <span>{t("owner", lang)}: {r.owner}. </span>}
                      {r.mitigation}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {p.notes && (
          <section>
            <h3>{t("notes", lang)}</h3>
            <p>{p.notes}</p>
          </section>
        )}

        <section>
          <h3>{t("sources", lang)}</h3>
          <ul className="list small">
            {p.sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
