import { useCallback, useEffect, useMemo, useState } from "react";
import { addItem, closeItem, removeItem, reopenItem, setMilestoneDone, setProgress, setStage, snoozeItem } from "./actions";
import { AttentionPanel } from "./components/AttentionPanel";
import { CapturePanel } from "./components/CapturePanel";
import { Filters, type FilterState, emptyFilters, applyFilters } from "./components/Filters";
import { Header } from "./components/Header";
import { Insights } from "./components/Insights";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectDetail } from "./components/ProjectDetail";
import { SummaryTiles } from "./components/SummaryTiles";
import { baseFor, defaultDataset, hasRegister, type DatasetKey } from "./data";
import type { Lang } from "./i18n";
import { bi, t } from "./i18n";
import { DAY_MS, parseDate, reportingWindow, summarise } from "./metrics";
import { ReportingView } from "./reporting/ReportingView";
import { isPortfolio, loadLang, loadPortfolio, saveLang, savePortfolio } from "./storage";
import type { Asset, Category, Kind, Portfolio, Project, Rag, Stage } from "./types";
import { useTheme, useView, type View } from "./ui/hooks";
import { Toast } from "./ui/Toast";
import { tr } from "./ui/tr";
import { BriefView } from "./views/BriefView";
import { TimelineView } from "./views/TimelineView";

type StoreKey = DatasetKey | "imported";

function initial(): { key: StoreKey; portfolio: Portfolio } {
  const imported = loadPortfolio("imported");
  if (imported) return { key: "imported", portfolio: imported };
  const key = defaultDataset();
  return { key, portfolio: loadPortfolio(key) ?? baseFor(key) };
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => loadLang());
  const [theme, cycleTheme] = useTheme();
  const [view, go] = useView();
  const [{ key: storeKey, portfolio }, setState] = useState(initial);
  const [asOfOverride, setAsOfOverride] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const x = tr(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    saveLang(lang);
  }, [lang]);

  // "c" opens quick capture unless the user is typing.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setCapturing(true);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const todayISO = new Date().toISOString().slice(0, 10);
  const live = portfolio.dataset === "showcase" || portfolio.base === "showcase";
  const asOfISO = asOfOverride ?? (live ? todayISO : portfolio.reportingPeriod.asOf);
  const today = useMemo(() => parseDate(asOfISO) ?? new Date(), [asOfISO]);
  const period = useMemo(() => (asOfOverride || live ? { start: new Date(today.getTime() - 30 * DAY_MS), end: today } : reportingWindow(portfolio)), [asOfOverride, live, today, portfolio]);
  const summary = useMemo(() => summarise(portfolio, today, period), [portfolio, today, period]);
  const visible = useMemo(() => applyFilters(portfolio.projects, filters, today, lang), [portfolio, filters, today, lang]);
  const selected = portfolio.projects.find((p) => p.id === selectedId) ?? null;
  const closeDetail = useCallback(() => setSelectedId(null), []);
  const clearToast = useCallback(() => setToast(null), []);

  const commit = useCallback(
    (next: Portfolio, message?: string) => {
      setState((s) => ({ ...s, portfolio: next }));
      savePortfolio(storeKey, next);
      if (message) setToast(message);
    },
    [storeKey],
  );

  const replace = (key: StoreKey, p: Portfolio) => {
    setState({ key, portfolio: p });
    setFilters(emptyFilters);
    setSelectedId(null);
    setAsOfOverride(null);
  };

  function onImport(file: File) {
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!isPortfolio(parsed)) throw new Error("invalid");
        const next = { ...parsed, dataset: "imported" as const };
        savePortfolio("imported", next);
        replace("imported", next);
        setError(null);
        setToast(x("Register imported. It is saved on this device only.", "تم استيراد السجل. يُحفظ على هذا الجهاز فقط."));
      })
      .catch(() => setError(t("importError", lang)));
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rmd-portfolio-${asOfISO}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function onReset() {
    savePortfolio(storeKey, null);
    const key: StoreKey = storeKey === "imported" ? defaultDataset() : storeKey;
    replace(key, baseFor(key as DatasetKey));
    setToast(x("Your edits were discarded.", "تم تجاهل تعديلاتك."));
  }

  function onDataset(key: DatasetKey) {
    replace(key, loadPortfolio(key) ?? baseFor(key));
  }

  const ragFilter = (rag: Rag) => setFilters((f) => ({ ...f, rag: f.rag === rag ? "" : rag }));
  const attentionFilter = (type: FilterState["attention"]) => setFilters((f) => ({ ...f, attention: f.attention === type ? "" : type }));

  const handlers = {
    onDone: (pid: string, iid: string) => commit(closeItem(portfolio, pid, iid, asOfISO), x("Marked as done.", "تم تحديده كمنجز.")),
    onReopen: (pid: string, iid: string) => commit(reopenItem(portfolio, pid, iid)),
    onSnooze: (pid: string, iid: string, days: number) => commit(snoozeItem(portfolio, pid, iid, days, asOfISO), x(`Moved by ${days} days.`, `تم التأجيل ${days} أيام.`)),
    onRemove: (pid: string, iid: string) => commit(removeItem(portfolio, pid, iid), x("Removed.", "تم الحذف.")),
    onProgress: (pid: string, planned: number | null, actual: number | null) => commit(setProgress(portfolio, pid, planned, actual, asOfISO), x("Progress saved.", "تم حفظ الإنجاز.")),
    onMilestone: (pid: string, mid: string, done: boolean) => commit(setMilestoneDone(portfolio, pid, mid, done, asOfISO)),
    onStage: (pid: string, stage: Stage) => commit(setStage(portfolio, pid, stage)),
  };

  const NAV: { id: View; en: string; ar: string }[] = [
    { id: "portfolio", en: "Portfolio", ar: "المحفظة" },
    { id: "timeline", en: "Timeline", ar: "الجدول الزمني" },
    { id: "brief", en: "Weekly brief", ar: "الملخص الأسبوعي" },
    { id: "reporting", en: "Reporting", ar: "التقارير" },
  ];

  const bannerTone = portfolio.dataset === "working" ? "seed" : portfolio.dataset;

  return (
    <div className="app">
      <a className="skip" href="#main">{x("Skip to content", "انتقل إلى المحتوى")}</a>
      <div className="brandbar">
        <div className="page">
          <Header
            portfolio={portfolio}
            lang={lang}
            theme={theme}
            asOf={asOfISO}
            hasRegister={hasRegister()}
            usingRegister={storeKey === "register" || portfolio.base === "seed"}
            onLang={() => setLang(lang === "en" ? "ar" : "en")}
            onTheme={cycleTheme}
            onCapture={() => setCapturing(true)}
            onImport={onImport}
            onExport={onExport}
            onReset={onReset}
            onDataset={onDataset}
          />
        </div>
      </div>
      <nav className="views no-print" aria-label="views">
        <div className="page views-row">
          <div className="views-tabs">
            {NAV.map((n) => (
              <button key={n.id} type="button" className={`view-btn ${view === n.id ? "active" : ""}`} onClick={() => go(n.id)} aria-current={view === n.id ? "page" : undefined}>
                {lang === "ar" ? n.ar : n.en}
              </button>
            ))}
          </div>
          <div className="asof">
            <label>
              <span>{x("As of", "حتى تاريخ")}</span>
              <input type="date" value={asOfISO} onChange={(e) => setAsOfOverride(e.target.value || null)} />
            </label>
            <button type="button" className="mini" onClick={() => setAsOfOverride(todayISO)} disabled={asOfISO === todayISO}>
              {x("Today", "اليوم")}
            </button>
            {!live && asOfOverride && (
              <button type="button" className="mini" onClick={() => setAsOfOverride(null)}>
                {x("Reporting date", "تاريخ التقرير")}
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="page" id="main">
        {view !== "reporting" && (
          <div className={`banner banner-${bannerTone}`} role="note">
            <strong>{portfolio.dataset === "working" ? x("Working copy", "نسخة عمل") : t(portfolio.dataset, lang)}:</strong> {bi(portfolio.disclaimer, lang)}
            {portfolio.dataset === "working" && <> {x("Your edits are saved in this browser only. Use Data, then Export JSON, to keep a copy.", "تُحفظ تعديلاتك في هذا المتصفح فقط. استخدم البيانات ثم تصدير JSON للاحتفاظ بنسخة.")}</>}
          </div>
        )}
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        {view === "portfolio" && (
          <main>
            <SummaryTiles summary={summary} lang={lang} filters={filters} onRag={ragFilter} onAttention={attentionFilter} />
            <Insights portfolio={portfolio} today={today} lang={lang} />
            <AttentionPanel portfolio={portfolio} today={today} lang={lang} onSelect={setSelectedId} onDone={handlers.onDone} onSnooze={handlers.onSnooze} />
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

        {view === "timeline" && (
          <main>
            <TimelineView projects={portfolio.projects} today={today} lang={lang} onSelect={setSelectedId} />
          </main>
        )}

        {view === "brief" && (
          <main>
            <BriefView portfolio={portfolio} today={today} period={period} lang={lang} onToast={setToast} />
          </main>
        )}

        {view === "reporting" && (
          <main>
            <ReportingView lang={lang} />
          </main>
        )}

        <footer className="footer">{t("footer", lang)}</footer>
      </div>

      {selected && <ProjectDetail project={selected} today={today} lang={lang} onClose={closeDetail} {...handlers} />}
      {capturing && (
        <CapturePanel
          portfolio={portfolio}
          lang={lang}
          today={today}
          onClose={() => setCapturing(false)}
          onSave={(entries) => {
            let next = portfolio;
            for (const e of entries) next = addItem(next, e.projectId, e.item);
            commit(next, x(`${entries.length} item(s) saved to the register.`, `تم حفظ ${entries.length} بند في السجل.`));
            setCapturing(false);
          }}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function distinct<T extends Asset | Category | Stage | Kind>(projects: Project[], pick: (p: Project) => T): T[] {
  return Array.from(new Set(projects.map(pick)));
}
