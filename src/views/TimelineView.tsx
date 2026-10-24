import { useMemo } from "react";
import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { formatDate } from "../metrics";
import { buildTimeline } from "../timeline";
import type { Project } from "../types";
import { tr } from "../ui/tr";

const W = 1120;
const ROW = 40;
const TOP = 46;
const LABEL_W = 270;

export function TimelineView({ projects, today, lang, onSelect }: { projects: Project[]; today: Date; lang: Lang; onSelect: (id: string) => void }) {
  const x = tr(lang);
  const rtl = lang === "ar";
  const model = useMemo(() => buildTimeline(projects, today), [projects, today]);
  const height = TOP + model.rows.length * ROW + 24;
  const px0 = rtl ? 16 : LABEL_W;
  const px1 = rtl ? W - LABEL_W : W - 16;
  const span = model.max - model.min;
  const X = (at: number) => {
    const f = (at - model.min) / span;
    return rtl ? px1 - f * (px1 - px0) : px0 + f * (px1 - px0);
  };

  // Month ticks: pick a step so there are at most about 10 labels.
  const months = Math.max(1, Math.round(span / (30.44 * 86_400_000)));
  const step = [1, 2, 3, 6, 12].find((s) => months / s <= 10) ?? 12;
  const ticks: number[] = [];
  const first = new Date(model.min);
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  while (cursor.getTime() < model.max) {
    if (cursor.getUTCMonth() % step === 0) ticks.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const tickLabel = new Intl.DateTimeFormat(rtl ? "ar-AE" : "en-GB", step >= 12 ? { year: "numeric", timeZone: "UTC", calendar: "gregory" } : { month: "short", year: "numeric", timeZone: "UTC", calendar: "gregory" });

  return (
    <section className="timeline">
      <div className="rep-head">
        <div>
          <h2>{x("Programme timeline", "الجدول الزمني للبرنامج")}</h2>
          <p className="muted">{x("Start to completion for every project and contract with dates on file. The filled part of each bar is actual progress; the tick is where the plan says it should be. Diamonds are milestones.", "من البدء إلى الإنجاز لكل مشروع وعقد له تواريخ مسجلة. الجزء المعبأ من الشريط هو الإنجاز الفعلي، والعلامة هي موضع الخطة. المعيّنات هي المعالم.")}</p>
        </div>
        <ul className="legend">
          <li><span className="dot dot-green" /> {t("green", lang)}</li>
          <li><span className="dot dot-amber" /> {t("amber", lang)}</li>
          <li><span className="dot dot-red" /> {t("red", lang)}</li>
          <li><span className="dot dot-grey" /> {t("grey", lang)}</li>
        </ul>
      </div>

      {model.rows.length === 0 ? (
        <p className="empty">{x("No project has both a start and a completion date yet.", "لا يوجد مشروع له تاريخ بدء وإنجاز بعد.")}</p>
      ) : (
        <div className="scroll-x panel">
          <svg viewBox={`0 0 ${W} ${height}`} className="gantt" role="img" aria-label={x("Programme timeline", "الجدول الزمني للبرنامج")} style={{ minWidth: 760 }}>
            {ticks.map((tk) => (
              <g key={tk}>
                <line x1={X(tk)} x2={X(tk)} y1={TOP - 10} y2={height - 10} className="g-grid" />
                <text x={X(tk)} y={TOP - 16} textAnchor="middle" className="g-tick">
                  {tickLabel.format(new Date(tk))}
                </text>
              </g>
            ))}
            {model.rows.map((r, i) => {
              const y = TOP + i * ROW;
              const x1 = Math.min(X(r.start), X(r.end));
              const x2 = Math.max(X(r.start), X(r.end));
              const w = x2 - x1;
              const p = r.project.progress;
              const filled = p.actual != null ? (w * p.actual) / 100 : 0;
              const planTick = p.planned != null ? (rtl ? x2 - (w * p.planned) / 100 : x1 + (w * p.planned) / 100) : null;
              const name = bi(r.project.name, lang);
              return (
                <g key={r.id} role="button" tabIndex={0} className="g-row" onClick={() => onSelect(r.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(r.id)} aria-label={`${name}, ${formatDate(r.project.ntp, lang)} - ${formatDate(r.project.completion, lang)}`}>
                  <rect x={0} y={y - 6} width={W} height={ROW} className="g-hit" />
                  <text x={rtl ? W - 10 : 10} y={y + 11} textAnchor="start" className="g-label">
                    {name.length > 38 ? `${name.slice(0, 37)}…` : name}
                  </text>
                  {r.dlpEnd && <line x1={rtl ? Math.min(X(r.dlpEnd), x1) : x2} x2={rtl ? x1 : X(r.dlpEnd)} y1={y + 8} y2={y + 8} className="g-dlp" />}
                  <rect x={x1} y={y} width={w} height={16} rx={4} className={`g-bar g-${r.rag}`} />
                  {filled > 0 && <rect x={rtl ? x2 - filled : x1} y={y} width={filled} height={16} rx={4} className={`g-fill g-fill-${r.rag}`} />}
                  {planTick != null && <line x1={planTick} x2={planTick} y1={y - 3} y2={y + 19} className="g-plan" />}
                  {r.milestones.map((m) => (
                    <rect key={m.id} x={X(m.at) - 4} y={y + 4} width={8} height={8} transform={`rotate(45 ${X(m.at)} ${y + 8})`} className={m.done ? "g-ms g-ms-done" : m.late ? "g-ms g-ms-late" : "g-ms"} />
                  ))}
                </g>
              );
            })}
            <g>
              <line x1={X(model.today)} x2={X(model.today)} y1={TOP - 12} y2={height - 10} className="g-today" />
              <text x={X(model.today)} y={TOP - 34} textAnchor="middle" className="g-today-label">
                {x("Today", "اليوم")}
              </text>
            </g>
          </svg>
        </div>
      )}

      {model.undated.length > 0 && (
        <div className="panel">
          <h3>{x("Dates still to be confirmed", "تواريخ بانتظار التأكيد")}</h3>
          <ul className="chips">
            {model.undated.map((p) => (
              <li key={p.id}>
                <button type="button" className="chip" onClick={() => onSelect(p.id)}>
                  {bi(p.name, lang)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
