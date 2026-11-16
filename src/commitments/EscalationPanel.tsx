import { useState } from "react";
import type { Lang } from "../i18n";
import { DEFAULT_ESCALATION_DAYS, escalations, ownerReminder } from "./escalation";
import type { Register } from "./register";

/** Who to chase and who must decide, from the register's own due dates. Nothing is sent from here. */
export function EscalationPanel({ register, today, lang }: { register: Register; today: string; lang: Lang }) {
  const en = lang === "en";
  const label = (english: string, arabic: string) => (en ? english : arabic);
  const [days, setDays] = useState(DEFAULT_ESCALATION_DAYS);
  const [copied, setCopied] = useState<string | null>(null);
  const list = escalations(register, today, days);
  const director = list.filter((e) => e.level === "director");
  const owners = list.filter((e) => e.level === "owner");

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section aria-labelledby="escalation-title" className="escalation">
      <h2 id="escalation-title">{label("Escalation", "التصعيد")}</h2>
      <p>
        {label(
          "Open or waiting items past their due date. Under the limit the owner is reminded; at the limit, or with no owner, the director decides. Nothing is sent from this screen.",
          "بنود مفتوحة أو بانتظار الرد تجاوزت موعدها. قبل الحد يُذكَّر المسؤول؛ عند الحد أو عند غياب المسؤول يقرر المدير. لا يُرسل شيء من هذه الشاشة.",
        )}
      </p>
      <label className="no-print">
        {label("Escalate to the director after (days late)", "التصعيد إلى المدير بعد (أيام التأخير)")}
        <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Math.min(90, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
      </label>
      {list.length === 0 ? (
        <p>{label("Nothing is past its due date.", "لا يوجد بند تجاوز موعده.")}</p>
      ) : (
        <>
          <h3>{label(`Needs the director (${director.length})`, `بانتظار المدير (${director.length})`)}</h3>
          <ul className="commitment-list">
            {director.map((e) => (
              <li key={e.record.id}>
                <strong>{e.record.text}</strong>
                <span>
                  {label("Owner", "المسؤول")}: {e.record.owner ?? label("Not specified", "غير محدد")} · {label("Due", "الاستحقاق")}: <bdi dir="ltr">{e.record.due}</bdi> · {label(`${e.daysLate} days late`, `متأخر ${e.daysLate} يوماً`)}
                </span>
                {e.reason === "no-owner" && <span>{label("No owner to remind: assign one or decide.", "لا يوجد مسؤول للتذكير: عيّن مسؤولاً أو قرّر.")}</span>}
              </li>
            ))}
          </ul>
          <h3>{label(`Remind the owner (${owners.length})`, `تذكير المسؤول (${owners.length})`)}</h3>
          <ul className="commitment-list">
            {owners.map((e) => (
              <li key={e.record.id}>
                <strong>{e.record.text}</strong>
                <span>
                  {label("Owner", "المسؤول")}: {e.record.owner} · {label("Due", "الاستحقاق")}: <bdi dir="ltr">{e.record.due}</bdi> · {label(`${e.daysLate} days late`, `متأخر ${e.daysLate} يوماً`)}
                </span>
                <button type="button" className="btn no-print" onClick={() => copy(e.record.id, ownerReminder(e, lang))}>
                  {copied === e.record.id ? label("Copied", "تم النسخ") : label("Copy reminder", "نسخ التذكير")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
