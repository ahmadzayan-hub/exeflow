import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { audioToWave } from './AudioCapture';
import { IntegrationPanel } from './IntegrationPanel';
import { emptyRegister } from './register';

vi.mock('./AudioCapture', () => ({ audioToWave: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});

async function connect(transcript: string) {
  const register = emptyRegister();
  const interpret = vi.fn();
  const transcribe = vi.fn();
  const onPrepared = vi.fn();
  vi.mocked(audioToWave).mockResolvedValue(new ArrayBuffer(4));
  vi.stubGlobal('fetch', vi.fn(async (path: string, request: RequestInit) => {
    switch (path) {
      case '/api/local/session': return Response.json({ token: 'synthetic' });
      case '/api/local/state': return Response.json({
        register, registerRevision: 1, policy: { recipients: [] }, events: [],
        graph: { connected: false, delivery: false }, voice: { transcription: true, interpretation: true },
      });
      case '/api/local/register': return Response.json({ registerRevision: 2 });
      case '/api/local/transcribe':
        transcribe(request);
        return Response.json({ text: transcript });
      case '/api/local/interpret':
        interpret(JSON.parse(String(request.body)));
        return Response.json({ lines: 'Action: Synthetic review' });
      default: throw new Error(`Unexpected request ${path}`);
    }
  }));
  render(<IntegrationPanel lang="en" register={register} blocked={false} onPrepared={onPrepared} onBridge={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect local runtime' }));
  await screen.findByLabelText('Dictation language');
  fireEvent.change(screen.getByLabelText('Dictation language'), { target: { value: 'ar' } });
  return { interpret, transcribe, onPrepared };
}

it.each([
  {
    dialect: 'Emirati Arabic',
    transcript: 'أبغي أتأكد من حالة الأصل، check CBTC status for AX-01.',
    reviewed: 'أبغي أتأكد من حالة الأصل، check CBTC status for AX-001.',
  },
  {
    dialect: 'Egyptian Arabic',
    transcript: 'Check CBT status for AX-001، وقول لي لما تخلص.',
    reviewed: 'Check CBTC status for AX-001، وقول لي لما تخلص.',
  },
])('passes $dialect and English identifiers to interpretation only after review', async ({ transcript, reviewed }) => {
  const { interpret, transcribe, onPrepared } = await connect(transcript);
  const audio = new File(['synthetic'], 'Voice.wav', { type: 'audio/wav' });
  fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [audio] } });
  const draft = screen.getByLabelText<HTMLTextAreaElement>('Original source excerpt / transcript');
  await waitFor(() => expect(draft.value).toBe(transcript));
  expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({
    headers: expect.objectContaining({ 'X-ExecFlow-Language': 'ar' }),
  }));
  expect(interpret).not.toHaveBeenCalled();
  fireEvent.change(draft, { target: { value: reviewed } });
  expect(draft.value).toBe(reviewed);
  expect(interpret).not.toHaveBeenCalled();
  expect(onPrepared).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare proposals for human review' }));
  await waitFor(() => expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({ text: reviewed }), expect.any(String)));
  expect(interpret).toHaveBeenCalledExactlyOnceWith({ text: reviewed, language: 'en' });
});

it('keeps the previous draft out of interpretation while a replacement recording is stopping', async () => {
  const { interpret } = await connect('New CBTC transcript for AX-001');
  const draft = screen.getByLabelText<HTMLTextAreaElement>('Original source excerpt / transcript');
  fireEvent.change(draft, { target: { value: 'Old CBTC transcript for AX-010' } });
  const prepare = screen.getByRole<HTMLButtonElement>('button', { name: 'Prepare proposals for human review' });
  expect(prepare.disabled).toBe(false);

  vi.stubGlobal('navigator', { mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
  } });
  class Recorder {
    static current: Recorder;
    mimeType = 'audio/wav';
    state = 'inactive';
    onstop?: () => void;
    constructor() { Recorder.current = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record locally' })); });
  const stop = screen.getByRole('button', { name: 'Stop recording' });
  expect(prepare.disabled).toBe(true);
  await act(async () => { fireEvent.click(stop); });
  expect(Recorder.current.state).toBe('inactive');
  expect(prepare.disabled).toBe(true);
  fireEvent.click(prepare);
  expect(interpret).not.toHaveBeenCalled();
  await act(async () => Recorder.current.onstop?.());
  expect(draft.value).toBe('New CBTC transcript for AX-001');
  expect(prepare.disabled).toBe(false);
  expect(interpret).not.toHaveBeenCalled();
});
