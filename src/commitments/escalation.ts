import type { Lang } from "../i18n";
import { validDate, type Commitment, type Register } from "./register";

/** An open commitment this many days past its due date goes to the director. */
export const DEFAULT_ESCALATION_DAYS = 7;

export type EscalationLevel = "owner" | "director";
export type EscalationReason = "late" | "no-owner";

export interface Escalation {
  record: Commitment;
  daysLate: number;
  level: EscalationLevel;
  reason: EscalationReason;
}

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/**
 * Escalation rule, stated plainly:
 * - only open or waiting items with a due date in the past are considered;
 * - 1 to N-1 days late: remind the owner;
 * - N days or more late, or late with no owner to remind: the director decides.
 * Nothing is sent; the list tells the director who to chase and why.
 */
export function escalations(register: Register, today: string, thresholdDays = DEFAULT_ESCALATION_DAYS): Escalation[] {
  if (!validDate(today)) throw new Error("invalid-date");
  if (!Number.isInteger(thresholdDays) || thresholdDays < 1) throw new Error("invalid-threshold");
  const out: Escalation[] = [];
  for (const record of register.records) {
    if (record.status === "closed" || !record.due || record.capturedOn > today) continue;
    const daysLate = daysBetween(record.due, today);
    if (daysLate < 1) continue;
    const noOwner = !record.owner;
    out.push({
      record,
      daysLate,
      level: noOwner || daysLate >= thresholdDays ? "director" : "owner",
      reason: noOwner ? "no-owner" : "late",
    });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate || a.record.text.localeCompare(b.record.text));
}

/** Share of closed items that had a due date and were closed on or before it. */
export function onTimeRate(register: Register, today: string): { onTime: number; total: number; rate: number | null } {
  if (!validDate(today)) throw new Error("invalid-date");
  const closed = register.records.filter((r) => r.status === "closed" && r.closedOn && r.closedOn <= today && r.due);
  const onTime = closed.filter((r) => r.closedOn! <= r.due!).length;
  return { onTime, total: closed.length, rate: closed.length ? Math.round((onTime / closed.length) * 100) : null };
}

/** Ready-to-send reminder for the owner. The wording states facts from the register and asks for one answer. */
export function ownerReminder(e: Escalation, lang: Lang): string {
  const r = e.record;
  const who = r.owner ?? (lang === "ar" ? "المسؤول" : "Owner");
  return lang === "ar"
    ? `${who}، تذكير: «${r.text}» كان موعده ${r.due} وقد تأخر ${e.daysLate} يوماً. نرجو تأكيد الحالة أو موعداً جديداً.`
    : `${who}, reminder: "${r.text}" was due ${r.due} and is ${e.daysLate} day${e.daysLate === 1 ? "" : "s"} late. Please confirm the status or a new date.`;
}
