import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { formatAed, formatDate, nextMilestone, scheduleRag, scheduleVariance, timeElapsedPct } from "../metrics";
import type { Project } from "../types";

interface Props {
  project: Project;
  today: Date;
  lang: Lang;
  onSelect: () => void;
}

export function ProjectCard({ project: p, today, lang, onSelect }: Props) {
  const rag = scheduleRag(p, today);
  const elapsed = timeElapsedPct(p, today);
  const variance = scheduleVariance(p);
  const next = nextMilestone(p, today);
  const openItems = p.attention.filter((a) => a.status === "open").length;
  const decisions = p.attention.filter((a) => a.status === "open" && a.type === "decision").length;

  return (
    <article className={`card rag-border-${rag}`}>
      <header className="card-head">
        <div className="badges">
          <span className={`badge badge-${p.asset}`}>{t(p.asset, lang)}</span>
          <span className="badge">{t(p.category, lang)}</span>
          <span className="badge badge-stage">{t(p.stage, lang)}</span>
          {p.kind === "contract" && <span className="badge badge-kind">{t("contract", lang)}</span>}
        </div>
        <span className={`rag-pill rag-${rag}`}>{t(rag, lang)}</span>
      </header>
      <h3 className="card-title">
        <button type="button" className="link-btn" onClick={onSelect}>
          {bi(p.name, lang)}
        </button>
      </h3>
      <p className="card-code">{p.code ?? t("tbcShort", lang)}</p>

      <dl className="card-facts">
        <div>
          <dt>{t("value", lang)}</dt>
          <dd>{formatAed(p.valueAed, lang)}</dd>
        </div>
        <div>
          <dt>{t("ntp", lang)}</dt>
          <dd>{formatDate(p.ntp, lang)}</dd>
        </div>
        <div>
          <dt>{t("completion", lang)}</dt>
          <dd>{formatDate(p.completion, lang)}</dd>
        </div>
        <div>
          <dt>{t("contractor", lang)}</dt>
          <dd className="truncate" title={p.contractor ?? p.consultant ?? ""}>
            {p.contractor ?? p.consultant ?? t("tbcShort", lang)}
          </dd>
        </div>
      </dl>

      <div className="bars">
        <Bar label={t("timeElapsed", lang)} value={elapsed} tone="time" lang={lang} />
        {p.progress.planned != null && p.progress.actual != null ? (
          <>
            <Bar label={t("progressPlanned", lang)} value={p.progress.planned} tone="planned" lang={lang} />
            <Bar label={t("progressActual", lang)} value={p.progress.actual} tone={rag} lang={lang} />
            <p className="variance">
              {t("variance", lang)}: <strong className={`text-${rag}`}>{variance! > 0 ? "+" : ""}{variance} pp</strong>
            </p>
          </>
        ) : (
          <p className="muted">{t("noProgress", lang)}</p>
        )}
      </div>

      <p className="next">
        <span className="muted">{t("nextMilestone", lang)}:</span>{" "}
        {next ? (
          <>
            {bi(next.title, lang)} · {formatDate(next.planned, lang)}
          </>
        ) : (
          t("noMilestone", lang)
        )}
      </p>

      <footer className="card-foot">
        <span>
          {p.risks.length} {t("openRisks", lang)} · {openItems} {t("openItems", lang)}
          {decisions > 0 && <strong className="text-decision"> · {decisions} {t("decision", lang)}</strong>}
        </span>
        <span className={`tag tag-${p.confidence}`}>{t(p.confidence, lang)}</span>
      </footer>
    </article>
  );
}

function Bar({ label, value, tone, lang }: { label: string; value: number | null; tone: string; lang: Lang }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track" role="progressbar" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        {value != null && <div className={`bar-fill bar-${tone}`} style={{ width: `${value}%` }} />}
      </div>
      <span className="bar-value">{value != null ? `${value}%` : t("tbcShort", lang)}</span>
    </div>
  );
}
