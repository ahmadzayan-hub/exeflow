import type { Lang } from "../i18n";
import { bi } from "../i18n";
import { INBOX_ID, attentionBuckets, attentionProjects, daysBetween, formatDate, parseDate } from "../metrics";
import type { AttentionItem, Portfolio, Project } from "../types";
import { tr } from "../ui/tr";

export interface ItemHandlers {
  onDone: (projectId: string, itemId: string) => void;
  onSnooze: (projectId: string, itemId: string, days: number) => void;
}

interface Props extends ItemHandlers {
  portfolio: Portfolio;
  today: Date;
  lang: Lang;
  onSelect: (id: string) => void;
}

interface Row {
  key: string;
  project: Project;
  itemId?: string;
  title: string;
  owner?: string;
  reference?: string;
  due?: string | null;
  days?: number;
  derived?: boolean;
  tbc?: boolean;
  captured?: boolean;
  urgent?: boolean;
}

/** Three columns built from the same buckets the tiles count, so the numbers always agree. */
export function AttentionPanel({ portfolio, today, lang, onSelect, onDone, onSnooze }: Props) {
  const x = tr(lang);
  const decisions: Row[] = [];
  const waiting: Row[] = [];
  const overdue: Row[] = [];

  for (const p of attentionProjects(portfolio)) {
    const b = attentionBuckets(p, today);
    for (const a of b.decisions) decisions.push(toRow(p, a, lang, today, "until"));
    for (const a of b.waiting) waiting.push(toRow(p, a, lang, today, "until"));
    for (const a of b.overdueItems) overdue.push(toRow(p, a, lang, today, "past"));
    if (b.contractExpiry) {
      const f = b.contractExpiry;
      decisions.push({ key: `${p.id}-${f.id}`, project: p, title: lang === "ar" ? f.title.ar : f.title.en, reference: f.reference, days: f.days, derived: true });
    }
    for (const f of b.flags) {
      if (f.kind !== "milestone-overdue") continue;
      overdue.push({ key: `${p.id}-${f.id}`, project: p, title: lang === "ar" ? f.title.ar : f.title.en, days: f.days, derived: true });
    }
  }
  overdue.sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  const soonest = (a: Row, b: Row) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER);
  decisions.sort(soonest);
  waiting.sort(soonest);
  const cols = { onSelect, onDone, onSnooze, lang };

  return (
    <section className="attention" aria-label={x("Director attention", "ما يحتاج تدخل المدير")}>
      <h2>{x("Director attention", "ما يحتاج تدخل المدير")}</h2>
      <div className="attention-cols">
        <Column {...cols} title={x("Needs my decision", "بانتظار قراري")} tone="decision" rows={decisions} kind="decision" />
        <Column {...cols} title={x("Overdue", "متأخر")} tone="overdue" rows={overdue} kind="overdue" />
        <Column {...cols} title={x("Waiting for others", "بانتظار الآخرين")} tone="waiting" rows={waiting} kind="waiting" />
      </div>
    </section>
  );
}

function toRow(p: Project, a: AttentionItem, lang: Lang, today: Date, mode: "until" | "past"): Row {
  const due = parseDate(a.due);
  const past = due ? daysBetween(due, today) : undefined;
  return {
    key: `${p.id}-${a.id}`,
    project: p,
    itemId: a.id,
    title: bi(a.title, lang),
    owner: a.owner,
    reference: a.reference,
    due: a.due,
    days: past == null ? undefined : mode === "past" ? past : -past,
    tbc: a.confidence === "tbc",
    captured: !!a.capturedFrom,
    urgent: a.priority === "high",
  };
}

function Column({ title, tone, rows, lang, onSelect, onDone, onSnooze, kind }: { title: string; tone: string; rows: Row[]; kind: "decision" | "overdue" | "waiting"; lang: Lang; onSelect: (id: string) => void } & ItemHandlers) {
  const x = tr(lang);
  return (
    <div className={`att-col att-${tone}`}>
      <h3>
        {title} <span className="att-count">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="empty">{x("Nothing open", "لا توجد بنود مفتوحة")}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.key} className="att-row">
              <button type="button" className="att-item" onClick={() => r.project.id !== INBOX_ID && onSelect(r.project.id)} disabled={r.project.id === INBOX_ID}>
                <span className="att-project">{r.project.id === INBOX_ID ? x("Director inbox", "وارد المدير") : bi(r.project.name, lang)}</span>
                <span className="att-title">
                  {r.urgent && <span className="tag tag-overdue">{x("Urgent", "عاجل")}</span>} {r.title}
                </span>
                <span className="att-meta">
                  {r.owner && (
                    <span>
                      {x("Owner", "المسؤول")}: {r.owner}
                    </span>
                  )}
                  {r.reference && <span>{r.reference}</span>}
                  {kind === "overdue" && r.days != null && (
                    <span className="att-days">
                      {r.days} {x("days overdue", "يوم تأخير")}
                    </span>
                  )}
                  {kind === "decision" && r.derived && r.days != null && (
                    <span className="att-days">
                      {r.days} {x("days left", "يوم متبقٍ")}
                    </span>
                  )}
                  {kind !== "overdue" && r.due && (
                    <span>
                      {x("Due", "الاستحقاق")}: {formatDate(r.due, lang)}
                    </span>
                  )}
                  {r.derived && <span className="tag tag-derived">{x("Derived from dates on file", "مشتق من التواريخ المسجلة")}</span>}
                  {r.tbc && <span className="tag tag-tbc">{x("To be confirmed", "بحاجة إلى تأكيد")}</span>}
                  {r.captured && <span className="tag">{x("Captured", "مسجّل")}</span>}
                </span>
              </button>
              {r.itemId && (
                <span className="row-actions no-print">
                  <button type="button" className="mini" onClick={() => onDone(r.project.id, r.itemId!)} title={x("Mark as done", "تحديد كمنجز")}>
                    {x("Done", "تم")}
                  </button>
                  <button type="button" className="mini" onClick={() => onSnooze(r.project.id, r.itemId!, 7)} title={x("Move the due date by 7 days", "تأجيل الاستحقاق 7 أيام")}>
                    +7d
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
