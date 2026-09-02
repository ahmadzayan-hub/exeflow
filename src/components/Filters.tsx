import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { derivedFlags, scheduleRag } from "../metrics";
import type { Asset, Category, Kind, Project, Rag, Stage } from "../types";

export interface FilterState {
  q: string;
  asset: Asset | "";
  category: Category | "";
  stage: Stage | "";
  kind: Kind | "";
  rag: Rag | "";
  attention: "decision" | "waiting" | "overdue" | "";
}

export const emptyFilters: FilterState = { q: "", asset: "", category: "", stage: "", kind: "", rag: "", attention: "" };

export function applyFilters(projects: Project[], f: FilterState, today: Date, lang: Lang): Project[] {
  const q = f.q.trim().toLowerCase();
  return projects.filter((p) => {
    if (f.asset && p.asset !== f.asset) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.stage && p.stage !== f.stage) return false;
    if (f.kind && p.kind !== f.kind) return false;
    if (f.rag && scheduleRag(p, today) !== f.rag) return false;
    if (f.attention === "decision" && !p.attention.some((a) => a.status === "open" && a.type === "decision")) return false;
    if (f.attention === "waiting" && !p.attention.some((a) => a.status === "open" && a.type === "waiting")) return false;
    if (f.attention === "overdue" && !derivedFlags(p, today).some((x) => x.kind !== "contract-expiry")) return false;
    if (q) {
      const hay = [p.name.en, p.name.ar ?? "", p.code ?? "", p.contractor ?? "", p.consultant ?? "", bi(p.name, lang)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

interface Props {
  lang: Lang;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  total: number;
  shown: number;
  assets: Asset[];
  categories: Category[];
  stages: Stage[];
  kinds: Kind[];
}

export function Filters({ lang, filters, onChange, total, shown, assets, categories, stages, kinds }: Props) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) => onChange({ ...filters, [key]: value });
  const dirty = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  return (
    <div className="filters no-print" role="search">
      <input
        type="search"
        className="search"
        placeholder={t("search", lang)}
        value={filters.q}
        onChange={(e) => set("q", e.target.value)}
        aria-label={t("search", lang)}
      />
      <Select label={t("asset", lang)} value={filters.asset} options={assets} lang={lang} onChange={(v) => set("asset", v as Asset | "")} />
      <Select
        label={t("category", lang)}
        value={filters.category}
        options={categories}
        lang={lang}
        onChange={(v) => set("category", v as Category | "")}
      />
      <Select label={t("stage", lang)} value={filters.stage} options={stages} lang={lang} onChange={(v) => set("stage", v as Stage | "")} />
      <Select label={t("kind", lang)} value={filters.kind} options={kinds} lang={lang} onChange={(v) => set("kind", v as Kind | "")} />
      <span className="count">
        {t("showing", lang)} {shown} {t("of", lang)} {total}
      </span>
      {dirty && (
        <button type="button" className="btn btn-link" onClick={() => onChange(emptyFilters)}>
          {t("clearFilters", lang)}
        </button>
      )}
    </div>
  );
}

function Select<T extends Asset | Category | Stage | Kind>({
  label,
  value,
  options,
  lang,
  onChange,
}: {
  label: string;
  value: string;
  options: T[];
  lang: Lang;
  onChange: (v: string) => void;
}) {
  return (
    <label className="select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("all", lang)}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {t(o, lang)}
          </option>
        ))}
      </select>
    </label>
  );
}
