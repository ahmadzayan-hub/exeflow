import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { tr } from "../ui/tr";
import { api } from "./api";
import { BrowserPanel } from "./BrowserPanel";
import { ServicePanel } from "./ServicePanel";

type Mode = "browser" | "service";

export function ReportingView({ lang }: { lang: Lang }) {
  const x = tr(lang);
  const [mode, setMode] = useState<Mode>("browser");
  const [serviceUp, setServiceUp] = useState(false);

  useEffect(() => {
    api
      .health()
      .then(() => setServiceUp(true))
      .catch(() => setServiceUp(false));
  }, []);

  return (
    <section className="reporting">
      <div className="rep-head">
        <div>
          <h2>{x("Management reporting from your files", "تقارير إدارية من ملفاتك")}</h2>
          <p className="muted">
            {mode === "browser"
              ? x("Open a spreadsheet and get key figures, charts, findings and a management report. Every number is computed from your data and checked by an evidence gate. The file stays on this device.", "افتح جدول بيانات لتحصل على الأرقام الرئيسية والرسوم والنتائج وتقرير إداري. كل رقم محسوب من بياناتك ويمر عبر بوابة أدلة. يبقى الملف على هذا الجهاز.")
              : x("Upload PDF, Word or spreadsheet files to the analytics service. Analyst, reviewer and reporter agents work on them, with memory across runs.", "ارفع ملفات PDF أو Word أو جداول إلى الخدمة التحليلية. يعمل عليها وكلاء التحليل والمراجعة والتقارير مع ذاكرة بين التشغيلات.")}
          </p>
        </div>
        <div className="segmented" role="tablist" aria-label={x("Where to analyse", "مكان التحليل")}>
          <button type="button" role="tab" aria-selected={mode === "browser"} className={mode === "browser" ? "active" : ""} onClick={() => setMode("browser")}>
            {x("On this device", "على هذا الجهاز")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "service"}
            className={mode === "service" ? "active" : ""}
            onClick={() => setMode("service")}
            title={serviceUp ? "" : x("The analytics service is not running", "الخدمة التحليلية غير مشغلة")}
          >
            {x("Analytics service", "الخدمة التحليلية")}
            {!serviceUp && <span className="dot dot-grey" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {mode === "browser" ? <BrowserPanel lang={lang} /> : <ServicePanel lang={lang} />}
    </section>
  );
}
