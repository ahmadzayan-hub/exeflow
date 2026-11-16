import type { Lang } from "../i18n";
import { t } from "../i18n";
import { formatAed, scheduleRag } from "../metrics";
import type { Asset, Category, Portfolio, Rag } from "../types";
import { tr } from "../ui/tr";

const ASSETS: Asset[] = ["metro", "tram", "both"];
const RAGS: Rag[] = ["green", "amber", "red", "grey"];

/** Two compact visuals: where schedule risk sits by asset, and where the money is by category. */
export function Insights({ portfolio, today, lang }: { portfolio: Portfolio; today: Date; lang: Lang }) {
  const x = tr(lang);
  const byAsset = ASSETS.map((a) => {
    const ps = portfolio.projects.filter((p) => p.asset === a);
    const counts: Record<Rag, number> = { green: 0, amber: 0, red: 0, grey: 0 };
    for (const p of ps) counts[scheduleRag(p, today)]++;
    return { asset: a, total: ps.length, counts };
  }).filter((r) => r.total > 0);

  const valueMap = new Map<Category, number>();
  for (const p of portfolio.projects) if (p.valueAed) valueMap.set(p.category, (valueMap.get(p.category) ?? 0) + p.valueAed);
  const values = [...valueMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxValue = Math.max(1, ...values.map(([, v]) => v));
  const totalValue = values.reduce((s, [, v]) => s + v, 0);

  return (
    <section className="insights" aria-label={x("Portfolio insights", "قراءة المحفظة")}>
      <div className="panel">
        <h3>{x("Schedule health by asset", "صحة الجدول الزمني حسب الأصل")}</h3>
        <ul className="stack-list">
          {byAsset.map((r) => (
            <li key={r.asset}>
              <div className="stack-label">
                <span>{t(r.asset, lang)}</span>
                <span className="muted small">{r.total}</span>
              </div>
              <div className="stack" role="img" aria-label={RAGS.map((g) => `${r.counts[g]} ${t(g, lang)}`).join(", ")}>
                {RAGS.filter((g) => r.counts[g] > 0).map((g) => (
                  <span key={g} className={`seg seg-${g}`} style={{ flexGrow: r.counts[g] }} title={`${r.counts[g]} ${t(g, lang)}`}>
                    {r.counts[g]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <ul className="legend">
          {RAGS.map((g) => (
            <li key={g}>
              <span className={`dot dot-${g}`} /> {t(g, lang)}
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <h3>{x("Known value by category", "القيمة المعروفة حسب الفئة")}</h3>
        {values.length === 0 ? (
          <p className="muted">{x("No values on file.", "لا توجد قيم مسجلة.")}</p>
        ) : (
          <ul className="bars-list">
            {values.map(([c, v]) => (
              <li key={c}>
                <span className="bars-label">{t(c, lang)}</span>
                <span className="bars-track">
                  <span className="bars-fill" style={{ width: `${(v / maxValue) * 100}%` }} />
                </span>
                <span className="bars-value">{formatAed(v, lang)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          {x("Total shown", "الإجمالي المعروض")}: {formatAed(totalValue, lang)}
        </p>
      </div>
    </section>
  );
}
