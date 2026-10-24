import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { loadTheme, saveTheme, type ThemeChoice } from "../storage";

export function useTheme(): [ThemeChoice, () => void] {
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    saveTheme(theme);
  }, [theme]);
  const cycle = useCallback(() => setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system")), []);
  return [theme, cycle];
}

export type View = "portfolio" | "timeline" | "brief" | "reporting";
const VIEWS: View[] = ["portfolio", "timeline", "brief", "reporting"];

export function viewFromHash(hash: string): View {
  const h = hash.replace(/^#\/?/, "");
  return (VIEWS as string[]).includes(h) ? (h as View) : "portfolio";
}

export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => viewFromHash(location.hash));
  useEffect(() => {
    const on = () => setView(viewFromHash(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((v: View) => {
    location.hash = v === "portfolio" ? "" : `#/${v}`;
    setView(v);
  }, []);
  return [view, go];
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser dictation. Supported in Chromium based browsers and Safari; nothing is sent by this app itself. */
export function useSpeech(lang: Lang, onText: (text: string, final: boolean) => void) {
  const supported = typeof window !== "undefined" && speechCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => ref.current?.stop(), []);
  const start = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = lang === "ar" ? "ar-AE" : "en-GB";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      cb.current(text, final);
    };
    rec.onerror = (e) => setError(e.error ?? "error");
    rec.onend = () => setListening(false);
    ref.current = rec;
    setListening(true);
    rec.start();
  }, [lang]);

  useEffect(() => () => ref.current?.stop(), []);
  return { supported, listening, start, stop, error };
}
