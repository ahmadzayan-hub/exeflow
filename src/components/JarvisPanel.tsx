import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { bi, t } from "../i18n";
import { attentionBuckets, formatDate, parseDate } from "../metrics";
import { commandRows, parseCommand, recordedText, resolveProject } from "../jarvis/commands";
import { LocalReadback, localVoice } from "../jarvis/localSpeech";
import type { Portfolio, Project } from "../types";
import "./JarvisPanel.css";

interface Props {
  portfolio: Portfolio;
  projects: Project[];
  today: Date;
  lang: Lang;
  onSelect: (id: string) => void;
}

export function JarvisPanel({ portfolio, projects, today, lang, onSelect }: Props) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);
  const player = useRef<LocalReadback | null>(null);
  const l = (en: string, ar: string) => lang === "ar" ? ar : en;
  const command = useMemo(() => submitted === null ? null : parseCommand(submitted), [submitted]);
  const validDate = !!parseDate(portfolio.reportingPeriod.asOf);
  const selection = projects.some((p) => p.id === selectedId) ? selectedId : "";
  const matches = command?.kind === "project" ? resolveProject(command.query, selection, projects) : [];
  const project = matches.length === 1 ? matches[0] : null;
  const listKind = command?.kind === "overdue" || command?.kind === "waiting" ? command.kind : null;
  const rows = listKind && validDate ? commandRows(listKind, projects, today, lang) : [];
  const missing = l("Not recorded", "غير مسجل");
  const help = l("Use overdue, waiting, or project. For a specific project, type project followed by its exact name, ID or reference.", "اكتب متأخرات أو انتظار أو مشروع. لمشروع محدد، اكتب مشروع ثم الاسم أو المعرّف أو المرجع كاملًا.");
  const scope = `${l("Current filters", "الفلاتر الحالية")}: ${projects.length} / ${portfolio.projects.length} · ${t("asOf", lang)}: ${formatDate(portfolio.reportingPeriod.asOf, lang)} · ${t(portfolio.dataset, lang)}`;
  const title = listKind ? t(listKind, lang) : project ? bi(project.name, lang) : l("Commands", "الأوامر");
  const invalid = command?.kind === "unknown" || (listKind && !validDate) || (command?.kind === "project" && !project);
  const message = listKind
    ? validDate ? `${title}: ${rows.length}. ${listKind === "waiting" ? l("Past-due waiting items appear under overdue.", "بنود الانتظار التي تجاوزت موعدها تظهر ضمن المتأخرات.") : l("Open attention items and milestones, calculated at the report date.", "بنود المتابعة والمعالم المفتوحة، محسوبة بتاريخ التقرير.")}`
      : l("The report date is invalid. Import a valid report before calculating due items.", "تاريخ التقرير غير صالح. استورد تقريرًا بتاريخ صالح قبل حساب الاستحقاقات.")
    : command?.kind === "project"
      ? project ? `${bi(project.name, lang)} · ${t("stage", lang)}: ${t(project.stage, lang)} · ${t("completion", lang)}: ${formatDate(project.completion, lang)}`
        : matches.length > 1 ? l("More than one match. Choose a project from the list or use its unique ID.", "توجد نتائج متعددة. اختر المشروع من القائمة أو استخدم معرّفه الفريد.")
          : l("Select a project or enter an exact project name, ID or reference within the current filters.", "اختر مشروعًا أو اكتب اسمه أو معرّفه أو مرجعه كاملًا ضمن الفلاتر الحالية.")
      : command?.kind === "unknown" ? `${l("Command not recognised.", "الأمر غير معروف.")} ${help}` : help;
  const readback = `${scope}. ${message}`;

  const stop = useCallback(() => {
    player.current?.stop();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const synth = window.speechSynthesis;
    const instance = new LocalReadback(synth, (text) => new SpeechSynthesisUtterance(text));
    player.current = instance;
    const update = () => {
      try { setHasVoice(!!localVoice(synth.getVoices(), lang)); }
      catch { setHasVoice(false); }
    };
    update();
    synth.addEventListener("voiceschanged", update);
    return () => {
      instance.stop();
      player.current = null;
      synth.removeEventListener("voiceschanged", update);
    };
  }, [lang]);

  // Answers derive from current props; a previous spoken answer must stop on any scope change.
  useEffect(() => {
    stop();
    setSpeechError(false);
  }, [portfolio, projects, today, lang, selection, submitted, stop]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stop]);

  function run(value: string) {
    stop();
    setSpeechError(false);
    setInput(value);
    setSubmitted(value);
  }

  function read() {
    setSpeechError(false);
    const started = player.current?.read(readback, lang, () => setSpeaking(false), () => { setSpeaking(false); setSpeechError(true); });
    setSpeaking(!!started);
    if (!started) setSpeechError(true);
  }

  const status = speechError ? l("Readback unavailable", "القراءة غير متاحة") : speaking ? l("Reading summary", "قراءة الملخص") : invalid ? l("Check command", "راجع الأمر") : submitted !== null ? l("Results ready", "النتائج جاهزة") : l("Ready", "جاهز");

  return (
    <section className="jarvis no-print" aria-labelledby="jarvis-title" onKeyDown={(event) => { if (event.key === "Escape") stop(); }}>
      <header className="jarvis-head">
        <div className={`jarvis-core ${speaking ? "is-speaking" : ""}`} aria-hidden="true"><span /><span /><i /></div>
        <div>
          <h2 id="jarvis-title">{l("Jarvis · Portfolio commands", "Jarvis · أوامر المحفظة")}</h2>
          <p className="muted">{l("Read-only commands from this portfolio. No microphone or AI connection.", "أوامر للقراءة من هذه المحفظة. دون ميكروفون أو اتصال بنموذج ذكاء اصطناعي.")}</p>
        </div>
        <span className="jarvis-status" role="status">{status}</span>
      </header>
      <p className="jarvis-scope">{scope}</p>
      <form className="jarvis-form" onSubmit={(event) => { event.preventDefault(); run(input); }}>
        <label htmlFor="jarvis-command">{l("Command", "الأمر")}</label>
        <div className="jarvis-input-row">
          <input id="jarvis-command" value={input} dir="auto" autoComplete="off" maxLength={300} aria-describedby="jarvis-help" placeholder={l("Try overdue or project", "جرّب متأخرات أو مشروع")} onChange={(event) => { stop(); setInput(event.target.value); }} />
          <button className="btn btn-primary" type="submit" disabled={!input.trim()}>{l("Run", "تنفيذ")}</button>
        </div>
        <p id="jarvis-help" className="muted small">{help}</p>
      </form>
      <div className="jarvis-actions">
        <button className="btn" type="button" onClick={() => run(lang === "ar" ? "متأخرات" : "overdue")}>{t("overdue", lang)}</button>
        <button className="btn" type="button" onClick={() => run(lang === "ar" ? "انتظار" : "waiting")}>{t("waiting", lang)}</button>
        <label className="jarvis-select">{l("Project in current filters", "مشروع ضمن الفلاتر الحالية")}
          <select value={selection} onChange={(event) => { stop(); setSelectedId(event.target.value); }}>
            <option value="">{l("Choose a project", "اختر مشروعًا")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{bi(p.name, lang)} · {p.code ?? p.id}</option>)}
          </select>
        </label>
        <button className="btn" type="button" onClick={() => run(lang === "ar" ? "مشروع" : "project")}>{l("Selected project", "المشروع المحدد")}</button>
      </div>
      {command && <div className="jarvis-result">
        <h3>{title}</h3>
        <p role="status" className={invalid ? "jarvis-error" : ""}>{message}</p>
        {listKind && rows.length > 0 && <ul className="jarvis-results" aria-label={title}>
          {rows.map((row) => <li key={row.key}>
            <button type="button" className="link-btn" onClick={() => { stop(); onSelect(row.project.id); }}>{bi(row.project.name, lang)}</button>
            <p>{row.title}</p>
            <dl className="jarvis-facts">
              <div><dt>{t("owner", lang)}</dt><dd>{row.owner ?? missing}</dd></div>
              <div><dt>{t("due", lang)}</dt><dd>{formatDate(row.due, lang)}</dd></div>
              <div><dt>{l("Reference", "المرجع")}</dt><dd>{row.reference ?? missing}</dd></div>
              <div><dt>{t("sources", lang)}</dt><dd>{row.project.sources.length ? row.project.sources.join(" · ") : missing}</dd></div>
            </dl>
            <p className="muted small">{t(row.confidence, lang)}{row.derived ? ` · ${t("derived", lang)}` : ""}</p>
          </li>)}
        </ul>}
        {project && <div className="jarvis-project">
          <dl className="jarvis-facts">
            <div><dt>{l("Reference", "المرجع")}</dt><dd>{project.code ?? missing}</dd></div>
            <div><dt>{t("contractor", lang)}</dt><dd>{recordedText(project.contractor) ?? missing}</dd></div>
            <div><dt>{t("completion", lang)}</dt><dd>{formatDate(project.completion, lang)}</dd></div>
            <div><dt>{t("sources", lang)}</dt><dd>{project.sources.length ? project.sources.join(" · ") : missing}</dd></div>
          </dl>
          <p className="muted small">{t(project.confidence, lang)}</p>
          {validDate && <p>{t("overdue", lang)}: {attentionBuckets(project, today).overdueCount} · {t("waiting", lang)}: {attentionBuckets(project, today).waiting.length}</p>}
          <button type="button" className="btn" onClick={() => { stop(); onSelect(project.id); }}>{l("Open project record", "فتح سجل المشروع")}</button>
        </div>}
        <div className="jarvis-actions">
          <button type="button" className="btn" onClick={read} disabled={!hasVoice || !!invalid || command.kind === "help" || speaking}>{l("Read summary locally", "قراءة الملخص محليًا")}</button>
          <button type="button" className="btn" onClick={stop} disabled={!speaking}>{l("Stop reading", "إيقاف القراءة")}</button>
          <button type="button" className="btn btn-link" onClick={() => { stop(); setSubmitted(null); setInput(""); setSpeechError(false); }}>{l("Clear result", "مسح النتيجة")}</button>
        </div>
        <p className="muted small">{hasVoice ? l("Uses a voice reported as local by your browser, only when pressed. Reads the scope and summary; item details stay on screen.", "يستخدم صوتًا يعرّفه المتصفح كمحلي عند الضغط فقط. يقرأ النطاق والملخص؛ تفاصيل البنود تبقى على الشاشة.") : l("No local voice for this language is available in this browser. Text commands remain available.", "لا يتوفر صوت محلي لهذه اللغة في هذا المتصفح. الأوامر النصية متاحة.")}</p>
        {speechError && <p className="jarvis-error" role="alert">{l("Could not start local readback. Another reader may be active, or the voice is unavailable.", "تعذّر تشغيل القراءة المحلية. قد توجد قراءة أخرى نشطة أو أن الصوت غير متاح.")}</p>}
      </div>}
    </section>
  );
}
