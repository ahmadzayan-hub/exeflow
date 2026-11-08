import type { Lang } from "../i18n";

export const STORAGE_KEY = "exeflow.commitments.v1";
export const MAX_TEXT = 50_000;
export const MAX_RECORDS = 1_000;
export type Status = "open" | "waiting" | "closed";
export interface Candidate {
  kind: "action" | "decision";
  text: string;
  owner: string | null;
  due: string | null;
  priority: "normal" | "high";
  dependency: string | null;
  source: { name: string; date: string; line: number; quote: string; original?: { kind: "voice" | "email" | "calendar"; text: string; reference: string } };
}
export interface Commitment extends Candidate {
  id: string;
  capturedOn: string;
  status: Status;
  closedOn: string | null;
}
export interface Register { schemaVersion: 1; records: Commitment[] }
export const emptyRegister = (): Register => ({ schemaVersion: 1, records: [] });

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const aliases: Record<string, string> = {
  owner: "owner", "المسؤول": "owner", due: "due", "الاستحقاق": "due",
  priority: "priority", "الأولوية": "priority", dependency: "dependency", "الاعتماد": "dependency",
};

/** Deliberately bounded grammar: labelled minutes, not natural-language inference. */
export function extractMinutes(text: string, name: string, date: string) {
  if (!name.trim() || name.length > 200 || !validDate(date) || text.length > MAX_TEXT) throw new Error("invalid-input");
  const candidates: Candidate[] = [];
  const unparsed: number[] = [];
  text.split(/\r?\n/).forEach((quote, index) => {
    if (!quote.trim()) return;
    const parts = quote.split("|").map((s) => s.trim());
    const lead = /^(action|decision|إجراء|قرار)\s*:\s*(.+)$/i.exec(parts[0]);
    if (!lead || quote.length > 2_000 || lead[2].length > 500) { unparsed.push(index + 1); return; }
    const fields: Record<string, string> = {};
    for (const part of parts.slice(1)) {
      const match = /^([^:]+):\s*(.+)$/.exec(part);
      const key = match && aliases[match[1].trim().toLowerCase()];
      if (!match || !key || key in fields || match[2].length > 500) { unparsed.push(index + 1); return; }
      fields[key] = match[2].trim();
    }
    const due = fields.due ? digits(fields.due) : null;
    const priority = fields.priority?.toLowerCase();
    if ((due && !validDate(due)) || (priority && !["normal", "high", "عادية", "عالية"].includes(priority))) {
      unparsed.push(index + 1); return;
    }
    candidates.push({
      kind: ["decision", "قرار"].includes(lead[1].toLowerCase()) ? "decision" : "action",
      text: lead[2].trim(), owner: fields.owner || null, due,
      priority: priority === "high" || priority === "عالية" ? "high" : "normal",
      dependency: fields.dependency || null,
      source: { name: name.trim(), date, line: index + 1, quote },
    });
  });
  return { candidates, unparsed };
}

// Source position is informational; repeating the same quote on a new line is not new work.
const sourceKey = (r: Candidate) => JSON.stringify([r.source.name, r.source.date, r.source.quote.trim()]);
export function acceptCandidates(register: Register, candidates: Candidate[], today: string): Register {
  if (!validDate(today)) throw new Error("invalid-date");
  const seen = new Set(register.records.map(sourceKey));
  const added: Commitment[] = [];
  for (const candidate of candidates) {
    const key = sourceKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ ...candidate, id: crypto.randomUUID(), capturedOn: today, status: "open", closedOn: null });
  }
  if (register.records.length + added.length > MAX_RECORDS) throw new Error("too-many-records");
  return { schemaVersion: 1, records: [...register.records, ...added] };
}
export function changeStatus(register: Register, id: string, status: Status, today: string): Register {
  if (!validDate(today)) throw new Error("invalid-date");
  return { schemaVersion: 1, records: register.records.map((r) => {
    if (r.id !== id || r.status === status) return r;
    if (today < r.capturedOn) throw new Error("invalid-date");
    return { ...r, status, closedOn: status === "closed" ? today : null };
  }) };
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.length <= max;
const nullableText = (v: unknown) => v === null || text(v, 500);
export function isRegister(value: unknown): value is Register {
  if (!obj(value) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) return false;
  const ids = new Set<string>();
  const sources = new Set<string>();
  return value.records.every((r: unknown) => {
    if (!obj(r) || !text(r.id, 100) || ids.has(r.id) || !["action", "decision"].includes(r.kind as string) ||
      !text(r.text, 500) || !nullableText(r.owner) || !nullableText(r.dependency) ||
      !(r.due === null || validDate(r.due)) || !["normal", "high"].includes(r.priority as string) ||
      !validDate(r.capturedOn) || !["open", "waiting", "closed"].includes(r.status as string)) return false;
    if (r.status === "closed" ? !validDate(r.closedOn) || r.closedOn < r.capturedOn : r.closedOn !== null) return false;
    const s = r.source;
    if (!obj(s) || !text(s.name, 200) || !validDate(s.date) || !Number.isInteger(s.line) || Number(s.line) < 1 || !text(s.quote, 2_000) || /[\r\n]/.test(s.quote)) return false;
    if (s.original != null && (!obj(s.original) || !["voice", "email", "calendar"].includes(s.original.kind as string) || !text(s.original.text, 2_000) || typeof s.original.reference !== "string" || s.original.reference.length > 2048)) return false;
    // A backup must retain the exact extraction, not just a plausible source label.
    const parsed = extractMinutes(s.quote, s.name, s.date).candidates[0];
    if (!parsed || (["kind", "text", "owner", "due", "priority", "dependency"] as const).some((k) => parsed[k] !== r[k])) return false;
    const key = sourceKey(parsed);
    if (sources.has(key)) return false;
    ids.add(r.id); sources.add(key); return true;
  });
}
export function readRegister(): { register: Register; error: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { register: emptyRegister(), error: false };
    const value: unknown = JSON.parse(raw);
    if (isRegister(value)) return { register: value, error: false };
  } catch { /* Preserve the original storage; do not silently overwrite it. */ }
  return { register: emptyRegister(), error: true };
}
export function saveRegister(register: Register): void {
  if (!isRegister(register)) throw new Error("invalid-register");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(register));
}

export function weeklyBrief(register: Register, asOf: string, lang: Lang): string {
  if (!validDate(asOf)) return "";
  const start = new Date(`${asOf}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const from = start.toISOString().slice(0, 10);
  const en = lang === "en";
  // No fabricated historical reconstruction from a current-state register.
  const eligible = register.records.filter((r) => r.capturedOn <= asOf);
  const open = eligible.filter((r) => r.status !== "closed");
  const closed = eligible.filter((r) => r.closedOn && r.closedOn >= from && r.closedOn <= asOf);
  const groups: [string, Commitment[]][] = [
    [en ? "Needs my decision" : "بانتظار قراري", open.filter((r) => r.kind === "decision")],
    [en ? "Waiting for others" : "بانتظار الآخرين", open.filter((r) => r.status === "waiting")],
    [en ? "Overdue" : "متأخر", open.filter((r) => r.due && r.due < asOf)],
    [en ? "Missing owner or due date" : "مسؤول أو تاريخ استحقاق غير محدد", open.filter((r) => !r.owner || !r.due)],
    [en ? "Closed in the last seven days" : "أُغلق خلال الأيام السبعة الأخيرة", closed],
    [en ? "All open commitments" : "جميع الالتزامات المفتوحة", open],
  ];
  const rate = eligible.length ? Math.round(eligible.filter((r) => r.status === "closed" && r.closedOn! <= asOf).length / eligible.length * 100) : null;
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ");
  return [
    `# ${en ? "Weekly director brief" : "الموجز الأسبوعي للمدير"} — ${from} / ${asOf}`,
    en ? "Local register, current status only. Sections can overlap. Verify against the quoted minutes; this is not organizational approval." : "سجل محلي بالحالة الحالية فقط. قد تتكرر البنود بين الأقسام. راجع المحضر المقتبس؛ هذا ليس اعتماداً مؤسسياً.",
    `${en ? "Closure rate (closed / all recorded commitments)" : "معدل الإغلاق (المغلق / كل الالتزامات المسجلة)"}: ${rate === null ? "—" : `${rate}%`}`,
    ...groups.flatMap(([label, records]) => [
      `\n## ${label} (${records.length})`,
      ...records.map((r) => `- ${clean(r.text)} | ${en ? "Owner" : "المسؤول"}: ${r.owner ?? "—"} | ${en ? "Due" : "الاستحقاق"}: ${r.due ?? "—"} | ${en ? "Priority" : "الأولوية"}: ${en ? r.priority : r.priority === "high" ? "عالية" : "عادية"}${r.dependency ? ` | ${en ? "Dependency" : "الاعتماد"}: ${clean(r.dependency)}` : ""}\n  ${en ? "Source" : "المصدر"}: ${clean(r.source.name)}, ${r.source.date}, ${en ? "line" : "سطر"} ${r.source.line}\n  > ${clean(r.source.quote)}${r.source.original ? `\n  ${en ? "Original source" : "المصدر الأصلي"}: ${clean(r.source.original.text)}` : ""}`),
    ]),
  ].join("\n\n");
}
