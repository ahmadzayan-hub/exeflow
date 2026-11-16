import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { escalations, onTimeRate } from "./escalation";
import { localToday, readRegister, STORAGE_KEY } from "./register";
import { registerSummary } from "./Workbench";

/** The commitments register at a glance on the portfolio home. Reads the same browser-local register. */
export function CommitmentsStrip({ lang, onOpen }: { lang: Lang; onOpen: () => void }) {
  const en = lang === "en";
  const label = (english: string, arabic: string) => (en ? english : arabic);
  const [state, setState] = useState(readRegister);
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) setState(readRegister());
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const today = localToday();
  const { register, error } = state;

  if (error) {
    return (
      <section className="commit-strip" aria-label={label("Commitments", "الالتزامات")}>
        <p className="muted">{label("The commitments register could not be read. Open it to recover from a backup.", "تعذرت قراءة سجل الالتزامات. افتحه للاستعادة من نسخة احتياطية.")}</p>
        <button type="button" className="mini" onClick={onOpen}>{label("Open register", "فتح السجل")}</button>
      </section>
    );
  }
  if (register.records.length === 0) {
    return (
      <section className="commit-strip" aria-label={label("Commitments", "الالتزامات")}>
        <p className="muted">{label("No commitments recorded yet. Paste labelled minutes to start the register.", "لا توجد التزامات مسجلة بعد. الصق محضراً موسوماً لبدء السجل.")}</p>
        <button type="button" className="mini" onClick={onOpen}>{label("Open register", "فتح السجل")}</button>
      </section>
    );
  }

  const s = registerSummary(register, today);
  const toDirector = escalations(register, today).filter((e) => e.level === "director").length;
  const onTime = onTimeRate(register, today);
  const cell = (text: string, value: string, tone: string) => (
    <button type="button" className={`tile tile-btn tile-${tone}`} onClick={onOpen}>
      <span className="tile-label">{text}</span>
      <span className="tile-value">{value}</span>
    </button>
  );
  return (
    <section className="commit-strip" aria-label={label("Commitments", "الالتزامات")}>
      <div className="commit-strip-head">
        <h2>{label("Commitments", "الالتزامات")}</h2>
        <button type="button" className="mini" onClick={onOpen}>{label("Open register", "فتح السجل")}</button>
      </div>
      <div className="tiles commit-tiles">
        {cell(label("Needs my decision", "بانتظار قراري"), String(s.decision), "decision")}
        {cell(label("Overdue", "متأخر"), String(s.overdue), "overdue")}
        {cell(label("Escalated to me", "مصعّد إليّ"), String(toDirector), "waiting")}
        {cell(label("Closure rate", "معدل الإغلاق"), s.closureRate === null ? "—" : `${s.closureRate}%`, "closed")}
        {cell(label("Closed on time", "أُغلق في موعده"), onTime.rate === null ? "—" : `${onTime.rate}%`, "closed")}
      </div>
    </section>
  );
}
