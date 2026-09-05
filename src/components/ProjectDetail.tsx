import { useEffect } from "react";
import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { derivedFlags, formatAed, formatDate, isAttentionOverdue, isMilestoneOverdue, scheduleRag, timeElapsedPct } from "../metrics";
import type { Project } from "../types";

interface Props {
  project: Project;
  today: Date;
  lang: Lang;
  onClose: () => void;
}

export function ProjectDetail({ project: p, today, lang, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rag = scheduleRag(p, today);
  const elapsed = timeElapsedPct(p, today);
  const flags = derivedFlags(p, today);

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
          <Fact
            label={`${t("progressPlanned", lang)} / ${t("progressActual", lang)}`}
            value={
              p.progress.planned != null && p.progress.actual != null
                ? `${p.progress.planned}% / ${p.progress.actual}%${p.progress.asOf ? ` (${formatDate(p.progress.asOf, lang)})` : ""}`
                : t("noProgress", lang)
            }
          />
        </dl>

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
            <table className="table">
              <thead>
                <tr>
                  <th>{t("milestones", lang)}</th>
                  <th>{t("planned", lang)}</th>
                  <th>{t("actual", lang)}</th>
                  <th>{t("status", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {p.milestones.map((m) => {
                  const late = isMilestoneOverdue(m, today);
                  return (
                    <tr key={m.id} className={late ? "row-late" : ""}>
                      <td>
                        {bi(m.title, lang)}
                        {m.note && <div className="muted small">{m.note}</div>}
                      </td>
                      <td>{formatDate(m.planned, lang)}</td>
                      <td>{formatDate(m.actual, lang)}</td>
                      <td>
                        <span className={`status status-${late ? "late" : m.status}`}>{late ? t("overdue", lang) : t(m.status, lang)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                    <span className={`tag tag-${late ? "overdue" : a.type}`}>{late ? t("overdue", lang) : t(a.type, lang)}</span>{" "}
                    {bi(a.title, lang)}
                    <div className="muted small">
                      {a.owner && <span>{t("owner", lang)}: {a.owner} · </span>}
                      {a.due && <span>{t("due", lang)}: {formatDate(a.due, lang)} · </span>}
                      {a.reference && <span>{a.reference} · </span>}
                      {a.status === "closed" && a.closedOn && <span>{t("closed", lang)}: {formatDate(a.closedOn, lang)} · </span>}
                      {a.confidence && <span>{t(a.confidence, lang)}</span>}
                      {a.note && <div>{a.note}</div>}
                    </div>
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
