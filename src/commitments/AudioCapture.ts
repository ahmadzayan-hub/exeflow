/** Convert browser-decoded audio to bounded mono 16 kHz PCM WAV, entirely locally. */
export async function audioToWave(file: Blob): Promise<ArrayBuffer> {
  if (file.size > 20_000_000) throw new Error('Audio file is too large.');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration < .2 || decoded.duration > 300) throw new Error('Record between 0.2 and 300 seconds.');
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const node = offline.createBufferSource(); node.buffer = decoded; node.connect(offline.destination); node.start();
    const output = (await offline.startRendering()).getChannelData(0), bytes = new ArrayBuffer(44 + output.length * 2), view = new DataView(bytes);
    const str = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, output.length * 2, true);
    output.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * (v < 0 ? 32768 : 32767), true)); return bytes;
  } finally { await context.close(); }
}
