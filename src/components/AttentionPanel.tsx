import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { derivedFlags, formatDate, isAttentionOverdue, parseDate, daysBetween } from "../metrics";
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
  days?: number;
  derived?: boolean;
  tbc?: boolean;
}

export function AttentionPanel({ portfolio, today, lang, onSelect }: Props) {
  const decisions: Row[] = [];
  const waiting: Row[] = [];
  const overdue: Row[] = [];

  for (const p of portfolio.projects) {
    for (const a of p.attention) {
      if (a.status !== "open") continue;
      const row = toRow(p, a, lang, today);
      if (isAttentionOverdue(a, today)) overdue.push(row);
      else if (a.type === "decision") decisions.push(row);
      else if (a.type === "waiting") waiting.push(row);
    }
    for (const f of derivedFlags(p, today)) {
      if (f.kind === "attention-overdue") continue; // already listed above
      const row: Row = {
        key: `${p.id}-${f.kind}-${f.title.en}`,
        project: p,
        title: lang === "ar" ? f.title.ar : f.title.en,
        reference: f.reference,
        days: f.days,
        derived: true,
      };
      if (f.kind === "contract-expiry") decisions.push(row);
      else overdue.push(row);
    }
  }
  overdue.sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  decisions.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

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

function toRow(p: Project, a: AttentionItem, lang: Lang, today: Date): Row {
  const due = parseDate(a.due);
  return {
    key: `${p.id}-${a.id}`,
    project: p,
    title: bi(a.title, lang),
    owner: a.owner,
    reference: a.reference,
    due: a.due,
    days: due ? daysBetween(due, today) : undefined,
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
