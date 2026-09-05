import type { Lang } from "../i18n";
import { t } from "../i18n";
import { formatAed, type PortfolioSummary } from "../metrics";
import type { Rag } from "../types";
import type { FilterState } from "./Filters";

interface Props {
  summary: PortfolioSummary;
  lang: Lang;
  filters: FilterState;
  onRag: (rag: Rag) => void;
  onAttention: (type: FilterState["attention"]) => void;
}

export function SummaryTiles({ summary, lang, filters, onRag, onAttention }: Props) {
  const s = summary;
  return (
    <section className="tiles" aria-label="summary">
      <Tile
        label={t("needsDecision", lang)}
        value={s.needsDecision}
        tone="decision"
        active={filters.attention === "decision"}
        onClick={() => onAttention("decision")}
      />
      <Tile
        label={t("waiting", lang)}
        value={s.waiting}
        tone="waiting"
        active={filters.attention === "waiting"}
        onClick={() => onAttention("waiting")}
      />
      <Tile
        label={t("overdue", lang)}
        value={s.overdue}
        tone="overdue"
        active={filters.attention === "overdue"}
        onClick={() => onAttention("overdue")}
      />
      <Tile label={t("closedThisPeriod", lang)} value={s.closedThisPeriod} tone="closed" />

      <div className="tile tile-wide">
        <span className="tile-label">{t("scheduleHealth", lang)}</span>
        <div className="rag-row">
          {(["green", "amber", "red", "grey"] as Rag[]).map((rag) => (
            <button
              key={rag}
              type="button"
              className={`rag-chip rag-${rag} ${filters.rag === rag ? "active" : ""}`}
              onClick={() => onRag(rag)}
              aria-pressed={filters.rag === rag}
            >
              <span className="rag-count">{s.rag[rag]}</span>
              <span>{t(rag, lang)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tile">
        <span className="tile-label">{t("projectsAndContracts", lang)}</span>
        <span className="tile-value">
          {s.projects} <small>+ {s.contracts}</small>
        </span>
        <span className="tile-sub">
          {t("project", lang)} / {t("contract", lang)}
        </span>
      </div>
      <div className="tile">
        <span className="tile-label">{t("portfolioValue", lang)}</span>
        <span className="tile-value tile-value-sm">{formatAed(s.knownValueAed, lang)}</span>
        <span className="tile-sub">
          {s.valueUnknown} {t("valueUnknown", lang)}
        </span>
      </div>
      <div className="tile">
        <span className="tile-label">{t("dueIn30", lang)}</span>
        <span className="tile-value">{s.dueIn30}</span>
        <span className="tile-sub">
          {t("expiringIn90", lang)}: <strong>{s.expiringIn90}</strong>
        </span>
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`tile tile-${tone} ${active ? "active" : ""} ${onClick ? "tile-btn" : ""}`}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
    >
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
    </Tag>
  );
}
