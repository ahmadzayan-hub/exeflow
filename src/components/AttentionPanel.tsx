import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { attentionBuckets, daysBetween, formatDate, parseDate } from "../metrics";
import type { AttentionItem, Portfolio, Project } from "../types";

interface Props {
  portfolio: Portfolio;
  today: Date;
  lang: Lang;
  onSelect: (id: string) => void;
}

interface Row {
  key: string;
  project: Project;
  title: string;
  owner?: string;
  reference?: string;
  due?: string | null;
  /** days past due (overdue column) or days until due / expiry (other columns) */
  days?: number;
  derived?: boolean;
  tbc?: boolean;
}

/**
 * Three columns built from the same buckets the tiles count, so the numbers
 * on the tiles and on the column headers always match.
 */
export function AttentionPanel({ portfolio, today, lang, onSelect }: Props) {
  const decisions: Row[] = [];
  const waiting: Row[] = [];
  const overdue: Row[] = [];

  for (const p of portfolio.projects) {
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
  // most overdue first; soonest due first, undated last
  overdue.sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  const soonest = (a: Row, b: Row) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER);
  decisions.sort(soonest);
  waiting.sort(soonest);

  return (
    <section className="attention" aria-label={t("attentionTitle", lang)}>
      <h2>{t("attentionTitle", lang)}</h2>
      <div className="attention-cols">
        <Column title={t("needsDecision", lang)} tone="decision" rows={decisions} lang={lang} onSelect={onSelect} kind="decision" />
        <Column title={t("overdue", lang)} tone="overdue" rows={overdue} lang={lang} onSelect={onSelect} kind="overdue" />
        <Column title={t("waiting", lang)} tone="waiting" rows={waiting} lang={lang} onSelect={onSelect} kind="waiting" />
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
    title: bi(a.title, lang),
    owner: a.owner,
    reference: a.reference,
    due: a.due,
    days: past == null ? undefined : mode === "past" ? past : -past,
    tbc: a.confidence === "tbc",
  };
}

function Column({
  title,
  tone,
  rows,
  lang,
  onSelect,
  kind,
}: {
  title: string;
  tone: string;
  rows: Row[];
  lang: Lang;
  onSelect: (id: string) => void;
  kind: "decision" | "overdue" | "waiting";
}) {
  return (
    <div className={`att-col att-${tone}`}>
      <h3>
        {title} <span className="att-count">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="empty">{t("nothingOpen", lang)}</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.key}>
              <button type="button" className="att-item" onClick={() => onSelect(r.project.id)}>
                <span className="att-project">{bi(r.project.name, lang)}</span>
                <span className="att-title">{r.title}</span>
                <span className="att-meta">
                  {r.owner && (
                    <span>
                      {t("owner", lang)}: {r.owner}
                    </span>
                  )}
                  {r.reference && <span>{r.reference}</span>}
                  {kind === "overdue" && r.days != null && (
                    <span className="att-days">
                      {r.days} {t("daysOverdue", lang)}
                    </span>
                  )}
                  {kind === "decision" && r.derived && r.days != null && (
                    <span className="att-days">
                      {r.days} {t("daysLeft", lang)}
                    </span>
                  )}
                  {kind !== "overdue" && r.due && (
                    <span>
                      {t("due", lang)}: {formatDate(r.due, lang)}
                    </span>
                  )}
                  {r.derived && <span className="tag tag-derived">{t("derived", lang)}</span>}
                  {r.tbc && <span className="tag tag-tbc">{t("tbc", lang)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
