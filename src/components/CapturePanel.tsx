import { useEffect, useMemo, useRef, useState } from "react";
import { parseCapture, type CaptureDraft } from "../capture";
import type { Lang } from "../i18n";
import { bi } from "../i18n";
import type { AttentionItem, Portfolio } from "../types";
import { useSpeech } from "../ui/hooks";
import { tr } from "../ui/tr";

interface Props {
  portfolio: Portfolio;
  lang: Lang;
  today: Date;
  onClose: () => void;
  onSave: (items: { projectId: string | null; item: AttentionItem }[]) => void;
}

const EXAMPLES = {
  en: ["Ask Omar to send the revised programme by Sunday, and I need a reply from Finance on payment 7 tomorrow.", "Decide the procurement route for the fleet refurbishment next week. Urgent."],
  ar: ["سجّل إن علي لازم يراجع عرض المقاول قبل الخميس، وعايز رد من المالية على الدفعة السابعة.", "أقرر مسار الشراء لتجديد الأسطول الأسبوع القادم. عاجل."],
};

interface Row extends CaptureDraft {
  key: string;
  include: boolean;
}

export function CapturePanel({ portfolio, lang, today, onClose, onSave }: Props) {
  const x = tr(lang);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const projects = useMemo(() => portfolio.projects.map((p) => ({ id: p.id, name: p.name, code: p.code })), [portfolio.projects]);

  const speech = useSpeech(lang, (t) => setText(t));

  useEffect(() => {
    taRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Re-parse when the text changes, but keep manual edits to rows that still exist.
  useEffect(() => {
    const drafts = parseCapture(text, { today, projects });
    setRows((prev) => drafts.map((d, i) => ({ ...d, key: `${i}-${d.text}`, include: prev[i]?.include ?? true })));
  }, [text, today, projects]);

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((row, k) => (k === i ? { ...row, ...p } : row)));
  const chosen = rows.filter((r) => r.include && r.title.trim());

  function save() {
    const now = today.toISOString().slice(0, 10);
    onSave(
      chosen.map((r, i) => ({
        projectId: r.projectId ?? null,
        item: {
          id: `cap-${Date.now().toString(36)}-${i}`,
          type: r.type,
          title: { en: r.title, ar: r.title },
          owner: r.owner || undefined,
          due: r.due || null,
          status: "open",
          priority: r.priority,
          createdOn: now,
          capturedFrom: r.text,
          confidence: "verified",
        },
      })),
    );
  }

  return (
    <div className="overlay overlay-center" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cap-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <h2 id="cap-title">{x("Quick capture", "التسجيل السريع")}</h2>
            <p className="muted small">{x("Say or type what was decided or promised. ExecFlow reads the owner, due date and type, and you confirm before anything is saved.", "قل أو اكتب ما تقرر أو ما تم الوعد به. يستخرج ExecFlow المسؤول وتاريخ الاستحقاق والنوع، وتؤكد أنت قبل الحفظ.")}</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            {x("Close", "إغلاق")}
          </button>
        </header>

        <div className="cap-input">
          <textarea
            ref={taRef}
            rows={3}
            value={text}
            dir="auto"
            onChange={(e) => setText(e.target.value)}
            placeholder={x("e.g. Ask Omar to send the revised programme by Sunday", "مثال: سجّل إن علي لازم يراجع عرض المقاول قبل الخميس")}
            aria-label={x("What to capture", "ما يُراد تسجيله")}
          />
          {speech.supported ? (
            <button type="button" className={`btn mic ${speech.listening ? "listening" : ""}`} onClick={speech.listening ? speech.stop : speech.start} aria-pressed={speech.listening}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V22h1.5v-3.04A7.5 7.5 0 0 0 19.5 11.5z" /></svg>
              {speech.listening ? x("Listening… tap to stop", "جارٍ الاستماع… اضغط للإيقاف") : x("Dictate", "إملاء صوتي")}
            </button>
          ) : (
            <p className="muted small">{x("Voice dictation is not available in this browser. Type instead.", "الإملاء الصوتي غير متاح في هذا المتصفح. اكتب بدلاً منه.")}</p>
          )}
          {speech.error && <p className="muted small">{x("Microphone error", "خطأ في الميكروفون")}: {speech.error}</p>}
        </div>

        {!text && (
          <div className="examples">
            <span className="muted small">{x("Try an example", "جرّب مثالاً")}:</span>
            {EXAMPLES[lang].map((e) => (
              <button key={e} type="button" className="chip" onClick={() => setText(e)} dir="auto">
                {e}
              </button>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <ul className="drafts">
            {rows.map((r, i) => (
              <li key={r.key} className={`draft ${r.include ? "" : "off"}`}>
                <label className="draft-check">
                  <input type="checkbox" checked={r.include} onChange={(e) => patch(i, { include: e.target.checked })} />
                  <span className="sr-only">{x("Include", "تضمين")}</span>
                </label>
                <div className="draft-body">
                  <input className="draft-title" value={r.title} dir="auto" onChange={(e) => patch(i, { title: e.target.value })} aria-label={x("Title", "العنوان")} />
                  <div className="draft-fields">
                    <label>
                      <span>{x("Type", "النوع")}</span>
                      <select value={r.type} onChange={(e) => patch(i, { type: e.target.value as Row["type"] })}>
                        <option value="decision">{x("Decision", "قرار")}</option>
                        <option value="waiting">{x("Waiting", "انتظار")}</option>
                        <option value="info">{x("Note", "ملاحظة")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{x("Owner", "المسؤول")}</span>
                      <input value={r.owner ?? ""} dir="auto" onChange={(e) => patch(i, { owner: e.target.value })} />
                    </label>
                    <label>
                      <span>{x("Due", "الاستحقاق")}</span>
                      <input type="date" value={r.due ?? ""} onChange={(e) => patch(i, { due: e.target.value || undefined, dueNote: undefined })} />
                    </label>
                    <label>
                      <span>{x("Project", "المشروع")}</span>
                      <select value={r.projectId ?? ""} onChange={(e) => patch(i, { projectId: e.target.value || undefined })}>
                        <option value="">{x("Director inbox", "وارد المدير")}</option>
                        {portfolio.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {bi(p.name, lang)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {r.dueNote && <p className="muted small">{lang === "ar" ? r.dueNote.ar : r.dueNote.en}</p>}
                  {r.priority === "high" && <span className="tag tag-overdue">{x("Urgent", "عاجل")}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="dialog-foot">
          <span className="muted small">
            {rows.length === 0 ? x("Nothing to save yet.", "لا يوجد ما يُحفظ بعد.") : x(`${chosen.length} of ${rows.length} will be saved to your register on this device.`, `سيُحفظ ${chosen.length} من ${rows.length} في سجلك على هذا الجهاز.`)}
          </span>
          <button type="button" className="btn btn-primary" disabled={chosen.length === 0} onClick={save}>
            {x("Save to register", "حفظ في السجل")}
          </button>
        </footer>
      </div>
    </div>
  );
}
