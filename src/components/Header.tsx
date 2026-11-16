import { useRef } from "react";
import type { Lang } from "../i18n";
import { bi } from "../i18n";
import { formatDate } from "../metrics";
import type { Portfolio } from "../types";
import type { ThemeChoice } from "../storage";
import { tr } from "../ui/tr";

interface Props {
  portfolio: Portfolio;
  lang: Lang;
  theme: ThemeChoice;
  asOf: string;
  hasRegister: boolean;
  usingRegister: boolean;
  onLang: () => void;
  onTheme: () => void;
  onCapture: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onReset: () => void;
  onDataset: (key: "showcase" | "register") => void;
}

const ThemeIcon = ({ theme }: { theme: ThemeChoice }) =>
  theme === "dark" ? (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  ) : theme === "light" ? (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></g></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" /><path fill="currentColor" d="M12 3.5a8.5 8.5 0 0 1 0 17z" /></svg>
  );

export function Header(p: Props) {
  const x = tr(p.lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const themeLabel = p.theme === "system" ? x("Theme: system", "المظهر: تلقائي") : p.theme === "light" ? x("Theme: light", "المظهر: فاتح") : x("Theme: dark", "المظهر: داكن");
  return (
    <header className="header">
      <div className="header-titles">
        <p className="org">{bi(p.portfolio.organisation, p.lang)}</p>
        <h1>{bi(p.portfolio.title, p.lang)}</h1>
        <p className="period">
          {x("Reporting period", "فترة التقرير")}: <strong>{bi(p.portfolio.reportingPeriod.label, p.lang)}</strong> · {x("As of", "حتى تاريخ")} {formatDate(p.asOf, p.lang)}
        </p>
      </div>
      <div className="toolbar no-print">
        <button type="button" className="btn btn-primary" onClick={p.onCapture} title="C">
          {x("Quick capture", "تسجيل سريع")}
        </button>
        <button type="button" className="btn" onClick={p.onTheme} aria-label={themeLabel} title={themeLabel}>
          <ThemeIcon theme={p.theme} />
        </button>
        <button type="button" className="btn" onClick={p.onLang} aria-label="language">
          {p.lang === "ar" ? "English" : "العربية"}
        </button>
        <details className="menu">
          <summary className="btn">{x("Data", "البيانات")}</summary>
          <div className="menu-pop">
            <button type="button" onClick={() => fileRef.current?.click()}>
              {x("Import JSON", "استيراد JSON")}
            </button>
            <button type="button" onClick={p.onExport}>
              {x("Export JSON", "تصدير JSON")}
            </button>
            {p.hasRegister && (
              <button type="button" onClick={() => p.onDataset(p.usingRegister ? "showcase" : "register")}>
                {p.usingRegister ? x("Switch to showcase data", "التبديل إلى البيانات التوضيحية") : x("Switch to my register", "التبديل إلى سجلي")}
              </button>
            )}
            <button type="button" onClick={p.onReset}>
              {x("Discard my edits", "تجاهل تعديلاتي")}
            </button>
          </div>
        </details>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn" onClick={() => window.print()}>
          {x("Print", "طباعة")}
        </button>
      </div>
    </header>
  );
}
