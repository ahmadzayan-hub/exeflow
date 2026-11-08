import { useState } from "react";
import type { Lang } from "../i18n";
import {
  acceptCandidates, changeStatus, extractMinutes, isRegister, localToday, MAX_TEXT,
  readRegister, saveRegister, weeklyBrief, type Candidate, type Register, type Status,
} from "./register";
import "./commitments.css";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function CommitmentsView({ lang }: { lang: Lang }) {
  const en = lang === "en";
  const filePreview = location.protocol === "file:";
  const label = (english: string, arabic: string) => en ? english : arabic;
  const [initial] = useState(readRegister);
  const [register, setRegister] = useState(initial.register);
  const [storageBlocked, setStorageBlocked] = useState(initial.error);
  const [name, setName] = useState("");
  const [date, setDate] = useState(localToday);
  const [minutes, setMinutes] = useState("");
  const [preview, setPreview] = useState<{ candidates: Candidate[]; unparsed: number[] } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const today = localToday();
  const brief = weeklyBrief(register, today, lang);
  const unknown = label("Not specified", "غير محدد");

  function resetPreview() { setPreview(null); setReviewed(false); setSaved(null); }
  function persist(next: Register) {
    try {
      saveRegister(next); setRegister(next); setStorageBlocked(false); setError(false); return true;
    } catch { setError(true); return false; }
  }
  function accept() {
    if (!preview || !reviewed || storageBlocked) return;
    try {
      const next = acceptCandidates(register, preview.candidates, today);
      if (persist(next)) { setSaved(next.records.length - register.records.length); setPreview(null); setReviewed(false); }
    } catch { setError(true); }
  }
  async function importBackup(file: File) {
    try {
      if (file.size > 4_000_000) throw new Error("large-file");
      const parsed: unknown = JSON.parse(await file.text());
      if (!isRegister(parsed)) throw new Error("invalid-backup");
      // A complete explicit restore replaces this register only; never portfolio data.
      if (persist(parsed)) { resetPreview(); setSaved(parsed.records.length); }
    } catch { setError(true); }
  }

  return <section className="commitments" aria-labelledby="commitments-title">
    <h1 id="commitments-title">{label("Commitment register", "سجل الالتزامات")}</h1>
    <p className="banner" role="note">{label(
      "Offline, on this browser only. Review each source line before saving. Use synthetic or approved non-confidential minutes. Export a backup; this is not shared storage or organizational approval.",
      "يعمل دون اتصال، على هذا المتصفح فقط. راجع كل سطر مصدر قبل الحفظ. استخدم محاضر اصطناعية أو معتمدة غير سرية. صدّر نسخة احتياطية؛ هذا ليس تخزيناً مشتركاً أو اعتماداً مؤسسياً.",
    )}</p>
    {filePreview && <p className="banner" role="note">{label("This file preview may lose saved records when reloaded. Export a backup before leaving. Open the app through its local server for browser persistence.", "قد تفقد معاينة الملف البنود عند إعادة التحميل. صدّر نسخة احتياطية قبل المغادرة. افتح التطبيق عبر خادمه المحلي للحفظ في المتصفح.")}</p>}
    {storageBlocked && <p role="alert">{label("Stored register is unreadable or storage is unavailable. Existing data was preserved. Recover it before restoring a valid backup; new captures are disabled.", "السجل المخزن غير قابل للقراءة أو التخزين غير متاح. تم الحفاظ على البيانات الموجودة. استعدها قبل تحميل نسخة سليمة؛ إضافة البنود معطلة.")}</p>}
    {error && <p role="alert">{label("Could not save or read the register. Check the backup format, date, record limit (1,000), and browser storage. Existing saved data has not been replaced.", "تعذّر حفظ السجل أو قراءته. تحقق من صيغة النسخة والتاريخ وحد السجلات (١٠٠٠) وتخزين المتصفح. لم يتم استبدال البيانات المحفوظة.")}</p>}
    {saved !== null && <p role="status">{filePreview
      ? label(`Kept ${saved} records in this preview. Export a backup before reloading.`, `تم الاحتفاظ بـ ${saved} بنداً في هذه المعاينة. صدّر نسخة قبل إعادة التحميل.`)
      : label(`Saved ${saved} records. Repeated source lines are skipped.`, `تم حفظ ${saved} بنداً. يتم تجاهل أسطر المصدر المكررة.`)}</p>}

    <form onSubmit={(event) => {
      event.preventDefault(); setError(false); setReviewed(false); setSaved(null);
      try { setPreview(extractMinutes(minutes, name, date)); } catch { setPreview(null); setError(true); }
    }} className="capture-form no-print">
      <h2>{label("Capture from minutes", "التقاط من المحضر")}</h2>
      <div className="capture-fields">
        <label>{label("Meeting / source", "الاجتماع / المصدر")}<input required maxLength={200} value={name} onChange={(e) => { setName(e.target.value); resetPreview(); }} /></label>
        <label>{label("Meeting date", "تاريخ الاجتماع")}<input type="date" required min="1900-01-01" value={date} onChange={(e) => { setDate(e.target.value); resetPreview(); }} /></label>
      </div>
      <label>{label("Minutes", "المحضر")}<textarea required rows={6} maxLength={MAX_TEXT} value={minutes} onChange={(e) => { setMinutes(e.target.value); resetPreview(); }} aria-describedby="minutes-format" /></label>
      <p id="minutes-format">{label("Use one labelled Action: or Decision: per line. Optional fields follow |. Dates must be YYYY-MM-DD; relative dates and unlabelled narrative are shown for correction.", "اكتب إجراء: أو قرار: في كل سطر. افصل الحقول الاختيارية بعلامة |. يجب أن تكون التواريخ YYYY-MM-DD؛ تُعرض التواريخ النسبية والنصوص غير المصنفة للتصحيح.")}</p>
      <pre className="capture-example" dir={en ? "ltr" : "rtl"}>{en
        ? "Action: Review the synthetic proposal | Owner: Ali | Due: 2026-11-12 | Priority: high | Dependency: Finance reply"
        : "إجراء: مراجعة العرض التجريبي | المسؤول: علي | الاستحقاق: ٢٠٢٦-١١-١٢ | الأولوية: عالية | الاعتماد: رد المالية"}</pre>
      <button className="btn" disabled={storageBlocked} type="submit">{label("Extract for review", "استخراج للمراجعة")}</button>
    </form>

    {preview && <section className="capture-preview no-print" aria-labelledby="review-title">
      <h2 id="review-title">{label("Review proposed records", "مراجعة البنود المقترحة")}</h2>
      {preview.unparsed.length > 0 && <p role="alert">{label("Not extracted — correct these lines or acknowledge their omission:", "لم تُستخرج — صحح هذه الأسطر أو أقر باستبعادها:")} {preview.unparsed.join(", ")}</p>}
      <ul>{preview.candidates.map((r) => <li key={r.source.line}>
        <strong>{r.text}</strong>
        <p>{label("Owner", "المسؤول")}: {r.owner ?? unknown} · {label("Due", "الاستحقاق")}: {r.due ?? unknown}</p>
        <blockquote>{r.source.line}: {r.source.quote}</blockquote>
      </li>)}</ul>
      {preview.candidates.length === 0 ? <p>{label("No records extracted. Correct the minutes above.", "لم تُستخرج بنود. صحح المحضر أعلاه.")}</p> : <>
        <label className="review-consent"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />{label("I reviewed the quoted lines, missing fields, and any omitted lines.", "راجعت الأسطر المقتبسة والحقول الناقصة وأي أسطر مستبعدة.")}</label>
        <button type="button" className="btn" disabled={!reviewed || storageBlocked} onClick={accept}>{label("Save reviewed records", "حفظ البنود المراجعة")}</button>
      </>}
    </section>}

    <section aria-labelledby="register-title">
      <h2 id="register-title">{label("Saved commitments", "الالتزامات المحفوظة")} ({register.records.length})</h2>
      <ul className="commitment-list">{register.records.map((r) => <li key={r.id}>
        <h3>{r.text}</h3>
        <p>{label("Owner", "المسؤول")}: {r.owner ?? unknown} · {label("Due", "الاستحقاق")}: {r.due ?? unknown}</p>
        <p>{label("Priority", "الأولوية")}: {r.priority === "high" ? label("High", "عالية") : label("Normal", "عادية")}{r.dependency && ` · ${label("Dependency", "الاعتماد")}: ${r.dependency}`}</p>
        <p>{r.source.name} · {r.source.date} · {label("Line", "سطر")} {r.source.line}</p>
        <blockquote>{r.source.quote}</blockquote>
        <label>{label("Status", "الحالة")}<select aria-label={`${label("Status", "الحالة")}: ${r.text}`} value={r.status} disabled={storageBlocked} onChange={(e) => {
          try { persist(changeStatus(register, r.id, e.target.value as Status, today)); } catch { setError(true); }
        }}>
          <option value="open">{label("Open", "مفتوح")}</option><option value="waiting">{label("Waiting", "بانتظار الرد")}</option><option value="closed">{label("Closed", "مغلق")}</option>
        </select></label>
        {r.closedOn && <p>{label("Closed on", "أُغلق بتاريخ")}: {r.closedOn}</p>}
      </li>)}</ul>
      <div className="commitment-actions no-print">
        <button className="btn" type="button" disabled={storageBlocked} onClick={() => download(`commitments-${today}.json`, JSON.stringify(register, null, 2), "application/json")}>{label("Export register backup", "تصدير نسخة السجل")}</button>
        <label>{label("Restore backup (replaces this register)", "استعادة نسخة (تستبدل هذا السجل)")}<input type="file" accept="application/json,.json" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = ""; if (file) void importBackup(file);
        }} /></label>
      </div>
    </section>
    <section aria-labelledby="brief-title">
      <h2 id="brief-title">{label("Weekly director brief", "الموجز الأسبوعي للمدير")}</h2>
      <p>{label("Last seven calendar days, using today's current register status. Reopening a record clears its closure date; this is not an audit history.", "آخر سبعة أيام تقويمية، وفق الحالة الحالية للسجل اليوم. إعادة فتح بند تمسح تاريخ إغلاقه؛ هذا ليس سجل تدقيق تاريخياً.")}</p>
      <pre className="weekly-brief">{brief}</pre>
      <button className="btn no-print" type="button" onClick={() => download(`director-brief-${today}-${lang}.md`, brief, "text/markdown;charset=utf-8")}>{label("Download weekly brief", "تنزيل الموجز الأسبوعي")}</button>
    </section>
  </section>;
}
