import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntegrationPanel } from './IntegrationPanel';
import { emptyRegister } from './register';
vi.mock('./AudioCapture', () => ({ audioToWave: vi.fn(async () => new ArrayBuffer(6444)) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function setup(transcript = { text: 'Synthetic transcript', truncated: false }) {
 const prepared = vi.fn();
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const value = url.endsWith('/session') ? { token: 'synthetic' } : url.endsWith('/state') ? {
   register: emptyRegister(), registerRevision: 0, policy: { enabled: false, email: false, recipients: [], remindAfterDays: 1, escalateAfterDays: 3 }, events: [], graph: { connected: false, delivery: false }, voice: { transcription: true, interpretation: true },
  } : url.endsWith('/register') ? { registerRevision: 1 } : url.endsWith('/transcribe') ? transcript : { lines: 'Action: Review plan', warnings: ['proposal-rejected'], rejected: 1 };
  return new Response(JSON.stringify(value));
 }));
 render(<IntegrationPanel lang="en" register={emptyRegister()} blocked={false} onPrepared={prepared} onBridge={vi.fn()} />);
 return prepared;
}
it('discloses partial extraction before proposals can be reviewed', async () => {
 const prepared = setup();
 fireEvent.click(screen.getByRole('button', { name: 'Connect local runtime' }));
 const input = await screen.findByLabelText('Original source excerpt / transcript');
 fireEvent.change(input, { target: { value: 'Alice, review plan. Do not submit the report.' } });
 fireEvent.click(screen.getByRole('button', { name: 'Prepare proposals for human review' }));
 await waitFor(() => expect(prepared).toHaveBeenCalledOnce());
 expect(screen.getByRole('alert').textContent).toContain('Extraction may be incomplete');
 expect(prepared.mock.calls[0][1]).toBe('Action: Review plan');
});
it('displays truncation warning returned by the speech service', async () => {
 setup({ text: 'A'.repeat(2000), truncated: true });
 fireEvent.click(screen.getByRole('button', { name: 'Connect local runtime' }));
 const input = await screen.findByLabelText('Audio file');
 fireEvent.change(input, { target: { files: [new File(['synthetic'], 'Recording.wav', { type: 'audio/wav' })] } });
 await screen.findByText(/Only the first 2,000 source characters are shown/);
 expect((screen.getByLabelText('Original source excerpt / transcript') as HTMLTextAreaElement).value).toHaveLength(2000);
});
