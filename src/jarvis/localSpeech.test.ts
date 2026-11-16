import { describe, expect, it, vi } from "vitest";
import { LocalReadback, localVoice } from "./localSpeech";

const voice = (lang: string, localService: boolean) => ({ lang, localService }) as SpeechSynthesisVoice;

function setup(voices: SpeechSynthesisVoice[], speaking = false) {
  const synth = { getVoices: () => voices, speaking, pending: false, speak: vi.fn(), cancel: vi.fn() };
  const create = vi.fn((text: string) => ({ text }) as SpeechSynthesisUtterance);
  return { synth, create, reader: new LocalReadback(synth as unknown as SpeechSynthesis, create) };
}

describe("device-local readback", () => {
  it("rejects remote voices and does not fall back to another language", () => {
    expect(localVoice([voice("en-US", false), voice("ar-AE", true)], "en")).toBeNull();
    expect(localVoice([voice("en-US", true)], "ar")).toBeNull();
    const { reader, synth, create } = setup([voice("en-US", false)]);
    expect(reader.read("Summary", "en", vi.fn(), vi.fn())).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does nothing until read and assigns the verified local voice explicitly", () => {
    const local = voice("ar_AE", true);
    const { reader, synth, create } = setup([voice("ar-AE", false), local]);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(reader.read("ملخص", "ar", vi.fn(), vi.fn())).toBe(true);
    expect(create.mock.results[0].value).toMatchObject({ text: "ملخص", voice: local, lang: "ar_AE" });
    reader.stop();
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(create.mock.results[0].value.onend).toBeNull();
    reader.stop();
    expect(synth.cancel).toHaveBeenCalledOnce();
  });

  it("does not cancel or queue behind another active reader", () => {
    const { reader, synth } = setup([voice("en-US", true)], true);
    expect(reader.read("Summary", "en", vi.fn(), vi.fn())).toBe(false);
    reader.stop();
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("reports speech completion and recovers from a browser speech error", () => {
    const { reader, synth, create } = setup([voice("en-US", true)]);
    const finish = vi.fn();
    reader.read("Summary", "en", finish, vi.fn());
    create.mock.results[0].value.onend?.call(create.mock.results[0].value, {} as SpeechSynthesisEvent);
    expect(finish).toHaveBeenCalledOnce();
    synth.speak.mockImplementation(() => { throw new Error("unavailable"); });
    expect(reader.read("Summary", "en", finish, vi.fn())).toBe(false);
    expect(synth.cancel).toHaveBeenCalledOnce();
  });
});
