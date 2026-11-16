import type { Lang } from "../i18n";

/** Never fall back to a remote/default voice, including when Arabic is unavailable. */
export function localVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  return voices.find((voice) => voice.localService === true && voice.lang.toLowerCase().split(/[-_]/)[0] === lang) ?? null;
}

/** Own only this panel's utterance; cancel it before its source context changes. */
export class LocalReadback {
  private utterance: SpeechSynthesisUtterance | null = null;

  constructor(private synth: SpeechSynthesis, private create: (text: string) => SpeechSynthesisUtterance) {}

  stop(): void {
    if (!this.utterance) return;
    this.utterance.onend = null;
    this.utterance.onerror = null;
    this.utterance = null;
    this.synth.cancel();
  }

  read(text: string, lang: Lang, onFinish: () => void, onError: () => void): boolean {
    this.stop();
    try {
      const voice = localVoice(this.synth.getVoices(), lang);
      // Do not interrupt readback started elsewhere in the application.
      if (!voice || this.synth.speaking || this.synth.pending) return false;
      const utterance = this.create(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onend = () => {
        if (this.utterance !== utterance) return;
        this.utterance = null;
        onFinish();
      };
      utterance.onerror = () => {
        if (this.utterance !== utterance) return;
        this.utterance = null;
        onError();
      };
      this.utterance = utterance;
      this.synth.speak(utterance);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }
}
