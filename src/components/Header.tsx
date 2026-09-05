import { useRef } from "react";
import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { formatDate } from "../metrics";
import type { Portfolio } from "../types";

interface Props {
  portfolio: Portfolio;
  lang: Lang;
  onLang: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onDemo: () => void;
  onReset: () => void;
}

export function Header({ portfolio, lang, onLang, onImport, onExport, onDemo, onReset }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="header">
      <div className="header-titles">
        <p className="org">{bi(portfolio.organisation, lang)}</p>
        <h1>{bi(portfolio.title, lang)}</h1>
        <p className="period">
          {t("reportingPeriod", lang)}: <strong>{bi(portfolio.reportingPeriod.label, lang)}</strong> · {t("asOf", lang)}{" "}
          {formatDate(portfolio.reportingPeriod.asOf, lang)}
        </p>
      </div>
      <div className="toolbar no-print">
        <button type="button" className="btn" onClick={onLang} aria-label="language">
          {t("language", lang)}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {t("importJson", lang)}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn" onClick={onExport}>
          {t("exportJson", lang)}
        </button>
        {portfolio.dataset === "demo" ? (
          <button type="button" className="btn" onClick={onReset}>
            {t("resetSeed", lang)}
          </button>
        ) : (
          <button type="button" className="btn" onClick={onDemo}>
            {t("loadDemo", lang)}
          </button>
        )}
        {portfolio.dataset === "imported" && (
          <button type="button" className="btn" onClick={onReset}>
            {t("resetSeed", lang)}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          {t("print", lang)}
        </button>
      </div>
    </header>
  );
}
