import { useRef, useState } from "react";
import type { Lang } from "../i18n";
import {
  acceptCandidates, changeStatus, extractMinutes, isRegister, localToday, MAX_TEXT,
  readRegister, saveRegister, weeklyBrief, STORAGE_KEY, type Candidate, type Register, type Status,
} from "./register";
import { filterCommitments, registerSummary, type RegisterView } from "./Workbench";
import { IntegrationPanel, type SourceEvidence } from "./IntegrationPanel";
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
  const [pendingBackup, setPendingBackup] = useState<Register | null>(null);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const importRequest = useRef(0);
  const [registerView, setRegisterView] = useState<RegisterView>("all");
  const [search, setSearch] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState<SourceEvidence | null>(null);
  const [bridge, setBridge] = useState<((next: Register) => Promise<void>) | null>(null);
  const [cacheWarning, setCacheWarning] = useState(false);
  const today = localToday();
  const summary = registerSummary(register, today);
  const visible = filterCommitments(register.records, registerView, search, today);
  const brief = weeklyBrief(register, today, lang);
  const unknown = label("Not specified", "غير محدد");

  function resetPreview() { setPreview(null); setReviewed(false); setSaved(null); }
  async function persist(next: Register) {
    try {
      if (bridge) await bridge(next);
      try { saveRegister(next); setCacheWarning(false); } catch (e) { if (!bridge) throw e; setCacheWarning(true); } setRegister(next); setStorageBlocked(false); setError(false); setPendingBackup(null); importRequest.current++; return true;
    } catch { setError(true); return false; }
  }
  async function accept() {
    if (!preview || !reviewed || storageBlocked) return;
    try {
      const next = acceptCandidates(register, preview.candidates, today);
      if (await persist(next)) { setSaved(next.records.length - register.records.length); setPreview(null); setReviewed(false); }
    } catch { setError(true); }
  }
  async function importBackup(file: File) {
    const request = ++importRequest.current;
    setPendingBackup(null); setError(false); setSaved(null); setRecoveryVerified(false);
    try {
      if (file.size > 4_000_000) throw new Error("large-file");
      const parsed: unknown = JSON.parse(await file.text());
      if (request !== importRequest.current) return;
      if (!isRegister(parsed)) throw new Error("invalid-backup");
      setPendingBackup(parsed);
    } catch { if (request === importRequest.current) setError(true); }
  }
  async function restoreBackup() {
    if (!pendingBackup || (storageBlocked && !(recoveryDownloaded && recoveryVerified))) return;
    if (await persist(pendingBackup)) { resetPreview(); setSaved(pendingBackup.records.length); }
  }
  function exportOriginal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) throw new Error("missing-original");
      download(`CommitmentRecovery${today.replaceAll("-", "")}.txt`, raw, "text/plain;charset=utf-8");
      setRecoveryDownloaded(true); setRecoveryVerified(false); setError(false);
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
    {storageBlocked && <div className="no-print">
      <button className="btn" type="button" onClick={exportOriginal}>{label("Download original stored text", "تنزيل النص الأصلي المخزن")}</button>
      {recoveryDownloaded && <label><input type="checkbox" checked={recoveryVerified} onChange={e => setRecoveryVerified(e.target.checked)} />{label("I verified that the original text file is saved before replacing it.", "تحققت من حفظ ملف النص الأصلي قبل استبداله.")}</label>}
    </div>}
    {pendingBackup && <section className="capture-preview no-print" aria-labelledby="restore-title">
      <h2 id="restore-title">{label("Review backup before restoring", "مراجعة النسخة قبل الاستعادة")}</h2>
      <p>{label(`This backup has ${pendingBackup.records.length} records and will replace the current register (${register.records.length} readable records). Export the current register first.`, `تحتوي النسخة على ${pendingBackup.records.length} بنداً وستستبدل السجل الحالي (${register.records.length} بنداً قابلاً للقراءة). صدّر السجل الحالي أولاً.`)}</p>
      <button className="btn" type="button" disabled={storageBlocked && !(recoveryDownloaded && recoveryVerified)} onClick={restoreBackup}>{label("Confirm restore", "تأكيد الاستعادة")}</button>
      <button className="btn" type="button" onClick={() => { importRequest.current++; setPendingBackup(null); }}>{label("Cancel restore", "إلغاء الاستعادة")}</button>
    </section>}
    {error && <p role="alert">{label("The operation could not be confirmed. Check the backup, record limit (1,000), browser storage and local service before retrying. Export a recovery copy when possible.", "تعذّر تأكيد العملية. تحقق من النسخة وحد السجلات (١٠٠٠) وتخزين المتصفح والخدمة المحلية قبل المحاولة مجدداً. صدّر نسخة استرداد إن أمكن.")}</p>}
    {saved !== null && <p role="status">{filePreview
      ? label(`Kept ${saved} records in this preview. Export a backup before reloading.`, `تم الاحتفاظ بـ ${saved} بنداً في هذه المعاينة. صدّر نسخة قبل إعادة التحميل.`)
      : label(`Saved ${saved} records. Repeated source lines are skipped.`, `تم حفظ ${saved} بنداً. يتم تجاهل أسطر المصدر المكررة.`)}</p>}

    {cacheWarning && <p role="alert">{label("Saved in the local service, but the browser cache failed. Export a JSON backup.", "حُفظ السجل في الخدمة المحلية، وتعذر تحديث تخزين المتصفح. صدّر نسخة JSON.")}</p>}
    <IntegrationPanel lang={lang} register={register} blocked={storageBlocked} onBridge={sync => setBridge(() => sync)} onPrepared={(source, lines) => { setSourceEvidence(source); setName(source.title.slice(0, 200)); setMinutes(lines); resetPreview(); }} />
    {sourceEvidence && <aside><h2>{label("Original source for these proposals", "المصدر الأصلي لهذه المقترحات")}</h2><blockquote>{sourceEvidence.text}</blockquote><p>{sourceEvidence.reference}</p><button type="button" className="btn" onClick={() => { setSourceEvidence(null); resetPreview(); }}>{label("Clear source link", "إلغاء ربط المصدر")}</button></aside>}
    <form onSubmit={(event) => {
      event.preventDefault(); setError(false); setReviewed(false); setSaved(null);
      try { const extracted = extractMinutes(minutes, name, date); setPreview({ ...extracted, candidates: extracted.candidates.map(c => sourceEvidence ? { ...c, source: { ...c.source, original: { kind: sourceEvidence.kind, text: sourceEvidence.text, reference: sourceEvidence.reference } } } : c) }); } catch { setPreview(null); setError(true); }
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

    <section aria-labelledby="followup-title">
      <h2 id="followup-title">{label("Director follow-up", "متابعة المدير")}</h2>
      <div className="commitment-kpis">
        <button type="button" onClick={() => setRegisterView("decision")}>{label("Needs my decision", "بانتظار قراري")}: <strong>{summary.decision}</strong></button>
        <button type="button" onClick={() => setRegisterView("waiting")}>{label("Waiting for others", "بانتظار الآخرين")}: <strong>{summary.waiting}</strong></button>
        <button type="button" onClick={() => setRegisterView("overdue")}>{label("Overdue", "متأخر")}: <strong>{summary.overdue}</strong></button>
        <div>{label("Closed this week", "أُغلق هذا الأسبوع")}: <strong>{summary.closedThisWeek}</strong></div>
        <div>{label("Closure rate", "معدل الإغلاق")}: <strong>{summary.closureRate === null ? label("Unavailable", "غير متاح") : `${summary.closureRate}%`}</strong></div>
        <div>{label("Mean closure time (days)", "متوسط مدة الإغلاق بالأيام")}: <strong>{summary.meanClosedDays ?? label("Unavailable", "غير متاح")}</strong></div>
      </div>
      <p>{label("Current recorded status only; the closure window includes today and the previous six days. No automatic notification or historical audit is implied.", "وفق الحالة المسجلة الحالية فقط؛ تشمل نافذة الإغلاق اليوم والأيام الستة السابقة. لا تُرسل تنبيهات تلقائية ولا يُستنتج سجل تدقيق تاريخي.")}</p>
      <div className="capture-fields no-print">
        <label>{label("Search commitments", "البحث في الالتزامات")}<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label>{label("Register view", "عرض السجل")}<select aria-label={label("Register view", "عرض السجل")} value={registerView} onChange={e => setRegisterView(e.target.value as RegisterView)}>
          <option value="all">{label("All records", "جميع البنود")}</option><option value="decision">{label("Needs my decision", "بانتظار قراري")}</option><option value="waiting">{label("Waiting for others", "بانتظار الآخرين")}</option><option value="overdue">{label("Overdue", "متأخر")}</option><option value="closed">{label("Closed", "مغلق")}</option><option value="missing">{label("Missing owner or due date", "مسؤول أو تاريخ استحقاق غير محدد")}</option>
        </select></label>
        <button className="btn" type="button" onClick={() => { setSearch(""); setRegisterView("all"); }}>{label("Reset filters", "إلغاء التصفية")}</button>
      </div>
      <p>{label(`Showing ${visible.length} of ${register.records.length} records.`, `يُعرض ${visible.length} من أصل ${register.records.length} بنداً.`)}</p>
    </section>
    <section aria-labelledby="register-title">
      <h2 id="register-title">{label("Saved commitments", "الالتزامات المحفوظة")} ({register.records.length})</h2>
      <ul className="commitment-list">{visible.map((r) => <li key={r.id}>
        <h3>{r.text}</h3>
        <p>{label("Owner", "المسؤول")}: {r.owner ?? unknown} · {label("Due", "الاستحقاق")}: {r.due ?? unknown}</p>
        <p>{label("Priority", "الأولوية")}: {r.priority === "high" ? label("High", "عالية") : label("Normal", "عادية")}{r.dependency && ` · ${label("Dependency", "الاعتماد")}: ${r.dependency}`}</p>
        <p>{r.source.name} · {r.source.date} · {label("Line", "سطر")} {r.source.line}</p>
        <p>{r.source.original ? label("Reviewed extraction", "الاستخراج المراجع") : label("Source quote", "اقتباس المصدر")}</p><blockquote>{r.source.quote}</blockquote>
        {r.source.original && <><p>{label("Original source excerpt", "مقتطف المصدر الأصلي")}</p><blockquote>{r.source.original.text}</blockquote><p>{r.source.original.reference}</p></>}
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
