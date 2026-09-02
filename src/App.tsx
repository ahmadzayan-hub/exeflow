import { useCallback, useEffect, useMemo, useState } from "react";
import seedJson from "./data/portfolio.json";
import { buildDemo } from "./data/demo";
import type { Lang } from "./i18n";
import { bi, t } from "./i18n";
import { parseDate, summarise } from "./metrics";
import { isPortfolio, loadLang, loadPortfolio, saveLang, savePortfolio } from "./storage";
import type { Asset, Category, Kind, Portfolio, Project, Rag, Stage } from "./types";
import { AttentionPanel } from "./components/AttentionPanel";
import { Filters, type FilterState, emptyFilters, applyFilters } from "./components/Filters";
import { Header } from "./components/Header";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectDetail } from "./components/ProjectDetail";
import { SummaryTiles } from "./components/SummaryTiles";
import { ReportingView } from "./reporting/ReportingView";

const seed = seedJson as Portfolio;

export function App() {
  const [lang, setLang] = useState<Lang>(() => loadLang());
  const [portfolio, setPortfolio] = useState<Portfolio>(() => loadPortfolio() ?? seed);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"portfolio" | "reporting">(() => (location.hash === "#reporting" ? "reporting" : "portfolio"));

  useEffect(() => {
    location.hash = view === "reporting" ? "#reporting" : "";
  }, [view]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    saveLang(lang);
  }, [lang]);

  const today = useMemo(() => parseDate(portfolio.reportingPeriod.asOf) ?? new Date(), [portfolio]);
  const summary = useMemo(() => summarise(portfolio, today), [portfolio, today]);
  const visible = useMemo(() => applyFilters(portfolio.projects, filters, today, lang), [portfolio, filters, today, lang]);
  const selected = portfolio.projects.find((p) => p.id === selectedId) ?? null;
  const closeDetail = useCallback(() => setSelectedId(null), []);

  function replacePortfolio(p: Portfolio, persist: boolean) {
    setPortfolio(p);
    setFilters(emptyFilters);
    setSelectedId(null);
    savePortfolio(persist ? p : null);
  }

  function onImport(file: File) {
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!isPortfolio(parsed)) throw new Error("invalid");
        replacePortfolio({ ...parsed, dataset: "imported" }, true);
        setError(null);
      })
      .catch(() => setError(t("importError", lang)));
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rmd-portfolio-${portfolio.reportingPeriod.asOf}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoke after the browser has started the download (Firefox and Safari need the delay)
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const ragFilter = (rag: Rag) => setFilters((f) => ({ ...f, rag: f.rag === rag ? "" : rag }));
  const attentionFilter = (type: FilterState["attention"]) =>
    setFilters((f) => ({ ...f, attention: f.attention === type ? "" : type }));

  return (
    <div className="app">
      <Header
        portfolio={portfolio}
        lang={lang}
        onLang={() => setLang(lang === "en" ? "ar" : "en")}
        onImport={onImport}
        onExport={onExport}
        onDemo={() => replacePortfolio(buildDemo(seed), true)}
        onReset={() => replacePortfolio(seed, false)}
      />
      {view === "portfolio" && (
        <div className={`banner banner-${portfolio.dataset}`} role="note">
          <strong>{t(portfolio.dataset, lang)}:</strong> {bi(portfolio.disclaimer, lang)}
        </div>
      )}
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <nav className="views no-print" aria-label="views">
        <button type="button" className={`view-btn ${view === "portfolio" ? "active" : ""}`} onClick={() => setView("portfolio")}>
          {t("navPortfolio", lang)}
        </button>
        <button type="button" className={`view-btn ${view === "reporting" ? "active" : ""}`} onClick={() => setView("reporting")}>
          {t("navReporting", lang)}
        </button>
      </nav>

      {view === "reporting" ? (
        <main>
          <ReportingView lang={lang} />
        </main>
      ) : (
      <main>
        <SummaryTiles summary={summary} lang={lang} filters={filters} onRag={ragFilter} onAttention={attentionFilter} />
        <AttentionPanel portfolio={portfolio} today={today} lang={lang} onSelect={setSelectedId} />

        <section className="projects" aria-label={t("projectsAndContracts", lang)}>
          <Filters
            lang={lang}
            filters={filters}
            onChange={setFilters}
            total={portfolio.projects.length}
            shown={visible.length}
            assets={distinct(portfolio.projects, (p) => p.asset)}
            categories={distinct(portfolio.projects, (p) => p.category)}
            stages={distinct(portfolio.projects, (p) => p.stage)}
            kinds={distinct(portfolio.projects, (p) => p.kind)}
          />
          {visible.length === 0 ? (
            <p className="empty">{t("noMatch", lang)}</p>
          ) : (
            <div className="grid">
              {visible.map((p) => (
                <ProjectCard key={p.id} project={p} today={today} lang={lang} onSelect={() => setSelectedId(p.id)} />
              ))}
            </div>
          )}
        </section>
      </main>
      )}

      <footer className="footer">{t("footer", lang)}</footer>

      {selected && <ProjectDetail project={selected} today={today} lang={lang} onClose={closeDetail} />}
    </div>
  );
}

function distinct<T extends Asset | Category | Stage | Kind>(projects: Project[], pick: (p: Project) => T): T[] {
  return Array.from(new Set(projects.map(pick)));
}
