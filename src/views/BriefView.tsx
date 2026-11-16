import { useMemo, useState } from "react";
import { briefToMarkdown, briefToText, buildBrief, type BriefItem } from "../brief";
import type { Lang } from "../i18n";
import { formatDate } from "../metrics";
import type { Portfolio } from "../types";
import { tr } from "../ui/tr";

interface Props {
  portfolio: Portfolio;
  today: Date;
  period: { start: Date; end: Date };
  lang: Lang;
  onToast: (m: string) => void;
}

export function BriefView({ portfolio, today, period, lang, onToast }: Props) {
  const x = tr(lang);
  const [briefLang, setBriefLang] = useState<Lang>(lang);
  const brief = useMemo(() => buildBrief(portfolio, today, briefLang, period), [portfolio, today, briefLang, period]);
  const md = useMemo(() => briefToMarkdown(brief, briefLang), [brief, briefLang]);
  const L = tr(briefLang);

  async function copy() {
    const text = briefToText(brief, briefLang);
    try {
      await navigator.clipboard.writeText(text);
      onToast(x("Brief copied. Paste it into WhatsApp or email.", "تم نسخ الملخص. الصقه في واتساب أو البريد."));
    } catch {
      onToast(x("Copy was blocked by the browser. Use Download instead.", "منع المتصفح النسخ. استخدم التنزيل بدلاً منه."));
    }
  }

  function download() {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `director-brief-${today.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const h = brief.health;
  return (
    <section className="brief" dir={briefLang === "ar" ? "rtl" : "ltr"}>
      <div className="rep-head no-print" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div>
          <h2>{x("Weekly director brief", "الملخص الأسبوعي للمدير")}</h2>
          <p className="muted">{x("One page for the weekly review: what needs you, what slipped, who owes you what, and what closed. Built from the register, never typed in.", "صفحة واحدة للمراجعة الأسبوعية: ما يحتاجك، وما تأخر، ومن عليه ماذا، وما أُغلق. تُبنى من السجل ولا تُكتب يدوياً.")}</p>
        </div>
        <div className="toolbar">
          <label className="select">
            <span>{x("Language", "اللغة")}</span>
            <select value={briefLang} onChange={(e) => setBriefLang(e.target.value as Lang)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={copy}>
            {x("Copy as text", "نسخ كنص")}
          </button>
          <button type="button" className="btn" onClick={download}>
            {x("Download .md", "تنزيل .md")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            {x("Print or save as PDF", "طباعة أو حفظ PDF")}
          </button>
        </div>
      </div>

      <article className="paper">
        <header className="paper-head">
          <p className="org">{L("Rail Maintenance Department", "إدارة صيانة القطارات")}</p>
          <h2>{L("Weekly director brief", "الملخص الأسبوعي للمدير")}</h2>
          <p className="muted">
            {L("As of", "حتى تاريخ")} {formatDate(today.toISOString().slice(0, 10), briefLang)} · {L("Period", "الفترة")}: {brief.period}
          </p>
          <p className="headline">{brief.headline}</p>
          <ul className="health-line">
            <li><span className="dot dot-green" /> {h.green} {L("on track", "على المسار")}</li>
            <li><span className="dot dot-amber" /> {h.amber} {L("at risk", "معرض للخطر")}</li>
            <li><span className="dot dot-red" /> {h.red} {L("delayed", "متأخر")}</li>
            <li><span className="dot dot-grey" /> {h.grey} {L("not assessed", "غير مقيّم")}</li>
          </ul>
        </header>

        <Block title={L("Needs your decision", "بانتظار قرارك")} items={brief.decisions} lang={briefLang} kind="due" tone="decision" />
        <Block title={L("Overdue", "متأخر")} items={brief.overdue} lang={briefLang} kind="overdue" tone="overdue" />
        <Block title={L("Waiting for others", "بانتظار الآخرين")} items={brief.waiting} lang={briefLang} kind="due" tone="waiting" />
        <Block title={L("Closed in the period", "أُغلق خلال الفترة")} items={brief.closed} lang={briefLang} kind="plain" tone="closed" />

        {brief.late.length > 0 && (
          <div className="brief-block">
            <h3>{L("Projects behind plan", "مشاريع متأخرة عن الخطة")}</h3>
            <ul>
              {brief.late.map((l) => (
                <li key={l.name}>
                  {l.name}: <strong>{l.variance} pp</strong> {L("behind plan", "عن الخطة")}
                </li>
              ))}
            </ul>
          </div>
        )}
        {brief.gaps.length > 0 && (
          <div className="brief-block">
            <h3>{L("Gaps in the data", "فجوات في البيانات")}</h3>
            <ul>
              {brief.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </section>
  );
}

function Block({ title, items, lang, kind, tone }: { title: string; items: BriefItem[]; lang: Lang; kind: "due" | "overdue" | "plain"; tone: string }) {
  const L = tr(lang);
  return (
    <div className={`brief-block tone-${tone}`}>
      <h3>
        {title} <span className="att-count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="muted">{L("None.", "لا يوجد.")}</p>
      ) : (
        <ul>
          {items.map((i, k) => (
            <li key={`${i.project}-${i.title}-${k}`}>
              <strong>{i.title}</strong>
              <span className="muted small">
                {" "}
                {i.project}
                {i.owner ? ` · ${L("Owner", "المسؤول")}: ${i.owner}` : ""}
                {kind === "overdue" && i.daysPast != null ? ` · ${i.daysPast} ${L("days overdue", "يوم تأخير")}` : i.due ? ` · ${L("Due", "الاستحقاق")}: ${formatDate(i.due, lang)}` : i.derived && i.daysPast != null && i.daysPast <= 0 ? ` · ${-i.daysPast} ${L("days left", "يوم متبقٍ")}` : ""}
                {i.reference ? ` · ${i.reference}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
