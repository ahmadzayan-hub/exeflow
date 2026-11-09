import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { audioToWave } from './AudioCapture';
import type { Register } from './register';
export type SourceEvidence = { kind: 'voice' | 'email' | 'calendar'; title: string; text: string; reference: string; truncated?: boolean };
type Policy = { enabled: boolean; email: boolean; recipients: string[]; remindAfterDays: number; escalateAfterDays: number };
type Event = { id: string; stage: string; text: string; status: string; date: string; note?: string };
type State = { register: Register; registerRevision: number; policy: Policy; events: Event[]; error?: string; graph: { connected: boolean; delivery: boolean; account?: { id: string; name: string; email: string } | null }; voice: { transcription: boolean; interpretation: boolean } };
export function IntegrationPanel({ lang, register, blocked, onPrepared, onBridge }: { lang: Lang; register: Register; blocked: boolean; onPrepared: (source: SourceEvidence, lines: string) => void; onBridge: (sync: ((next: Register) => Promise<void>) | null) => void }) {
  const en = lang === 'en', label = (a: string, b: string) => en ? a : b;
  const [pairing, setPairing] = useState(() => {
    try { const code = new URLSearchParams(location.hash.split('&').slice(1).join('&')).get('pair'); if (code && /^[a-f0-9]{64}$/.test(code)) { history.replaceState(null, '', location.pathname + location.search + '#commitments'); try { sessionStorage.setItem('exeflow.local.pair', code); } catch {} return code; } return sessionStorage.getItem('exeflow.local.pair') ?? ''; } catch { return ''; }
  });
  const [connected, setConnected] = useState(false), [state, setState] = useState<State | null>(null), [error, setError] = useState('');
  const [source, setSource] = useState<SourceEvidence>({ kind: 'voice', title: '', text: '', reference: '' });
  const [sources, setSources] = useState<(SourceEvidence & { id: string })[]>([]);
  const [clientId, setClientId] = useState(''), [tenant, setTenant] = useState('organizations'), [delivery, setDelivery] = useState(false);
  const [login, setLogin] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [recipients, setRecipients] = useState(''), [enabled, setEnabled] = useState(false), [email, setEmail] = useState(false), [approved, setApproved] = useState(false);
  const [remind, setRemind] = useState(1), [escalate, setEscalate] = useState(3), [recordId, setRecordId] = useState(''), [calendarConfirmed, setCalendarConfirmed] = useState(false);
  const [voiceExe, setVoiceExe] = useState(''), [voiceModel, setVoiceModel] = useState(''), [aiModel, setAiModel] = useState(''), [offlineConfirmed, setOfflineConfirmed] = useState(false);
  const [desktopAlerts, setDesktopAlerts] = useState(false);
  const notified = useRef(new Set<string>());
  const [busy, setBusy] = useState(false), [recording, setRecording] = useState(false);
  const working = useRef(false);
  const token = useRef(''), revision = useRef(0), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), alive = useRef(true);
  async function api<T>(path: string, method = 'GET', body?: unknown, binary = false): Promise<T> {
    const response = await fetch(`/api/local/${path}`, { method, headers: { 'X-ExecFlow-Session': token.current, ...(binary ? { 'Content-Type': 'audio/wav', 'X-ExecFlow-Language': lang } : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : binary ? body as ArrayBuffer : JSON.stringify(body), redirect: 'error' });
    const value = await response.json(); if (!response.ok) throw new Error(value.error ?? 'Local request failed.'); return value;
  }
  async function task(work: () => Promise<void>) { if (working.current) return; working.current = true; setBusy(true); setError(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed.'); } finally { working.current = false; setBusy(false); } }
  async function refresh() { const next = await api<State>('state'); setState(next); return next; }
  async function connect() {
    const session = await fetch('/api/local/session', { headers: { 'X-ExecFlow-Pairing': pairing }, redirect: 'error' }).then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error ?? 'Use StartExecFlow.cmd with the updated local runtime.'); return value; });
    try { sessionStorage.setItem('exeflow.local.pair', pairing); } catch {}
    token.current = session.token; const next = await refresh(); revision.current = next.registerRevision;
    if (next.register.records.length && JSON.stringify(next.register) !== JSON.stringify(register)) throw new Error(label('Service and browser registers differ. Download the service copy, then use the existing reviewed restore flow before connecting again.', 'يختلف سجل الخدمة عن سجل المتصفح. نزّل نسخة الخدمة واستعدها عبر مسار الاستعادة المراجع، ثم أعد الاتصال.'));
    const sync = async (value: Register) => { const result = await api<{ registerRevision: number }>('register', 'PUT', { register: value, expectedRevision: revision.current }); revision.current = result.registerRevision; };
    await sync(register); onBridge(sync); setConnected(true); setEnabled(next.policy.enabled); setEmail(next.policy.email); setRecipients(next.policy.recipients.join(', ')); setRemind(next.policy.remindAfterDays); setEscalate(next.policy.escalateAfterDays);
  }
  useEffect(() => {
    if (!desktopAlerts || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const event of state?.events ?? []) {
      if (notified.current.has(event.id)) continue;
      notified.current.add(event.id);
      if (event.status === 'cancelled') continue;
      try { new Notification(event.stage === 'escalation' ? label('ExecFlow escalation', 'تصعيد ExecFlow') : label('ExecFlow reminder', 'تذكير ExecFlow'), { body: event.text, tag: event.id }); } catch { setError(label('Desktop alerts are unavailable on this device.', 'تنبيهات سطح المكتب غير متاحة على هذا الجهاز.')); }
    }
  }, [state?.events, desktopAlerts, lang]);
  useEffect(() => {
    if (!connected) return; const timer = setInterval(() => { void refresh().catch(e => setError(e.message)); }, 10000);
    return () => clearInterval(timer);
  }, [connected]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  async function transcribe(blob: Blob) { const bytes = await audioToWave(blob); const result = await api<{ text: string; truncated?: boolean }>('transcribe', 'POST', bytes, true); setSource({ kind: 'voice', title: label('Voice capture', 'التقاط صوتي'), text: result.text, truncated: result.truncated, reference: '' }); }
  async function record() {
    if (recording) { if (recorder.current?.state === 'recording') recorder.current.stop(); else stream.current?.getTracks().forEach(t => t.stop()); setRecording(false); return; }
    const media = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = media; if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
    try {
      const rec = new MediaRecorder(media), chunks: BlobPart[] = []; let failed = false; recorder.current = rec;
      rec.onerror = () => { failed = true; media.getTracks().forEach(t => t.stop()); setRecording(false); setError(label('Microphone recording failed; no transcript was submitted.', 'تعذر التسجيل من الميكروفون؛ لم يُرسل تسجيل للتفريغ.')); };
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = () => { media.getTracks().forEach(t => t.stop()); setRecording(false); if (alive.current && !failed) void task(() => transcribe(new Blob(chunks, { type: rec.mimeType }))); };
      rec.start(); setRecording(true); setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 295000);
    } catch (e) { media.getTracks().forEach(t => t.stop()); throw e; }
  }
  return <section aria-labelledby="integration-title">
    <h2 id="integration-title">{label('Voice, Microsoft 365 and automation', 'الصوت وMicrosoft 365 والأتمتة')}</h2>
    <p>{label('Connect the local runtime explicitly. Microsoft sign-in needs an approved Entra public-client app. Voice needs local whisper.cpp and an offline Ollama model. Tokens stay in server memory.', 'اتصل بالخدمة المحلية صراحةً. يتطلب Microsoft تطبيق Entra معتمداً. يحتاج الصوت إلى whisper.cpp ونموذج Ollama محلي. تبقى رموز الدخول في ذاكرة الخدمة.')}</p>
    <label>{label("Local pairing code (shown in launcher)", "رمز الاقتران المحلي الظاهر في نافذة التشغيل")}<input type="password" autoComplete="off" value={pairing} disabled={connected} onChange={e => setPairing(e.target.value)} /></label>
    <button className="btn" type="button" disabled={busy || blocked || connected} onClick={() => void task(connect)}>{label('Connect local runtime', 'الاتصال بالخدمة المحلية')}</button>
    {state && <button className="btn" type="button" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(state.register, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'LocalRegisterBackup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }}>{label('Download service register', 'تنزيل سجل الخدمة')}</button>}
    {error && <p role="alert">{error}</p>}
    {connected && <>
      <p role="note">{label('Reviewed saves now synchronise to the local service. Keep its window running for automatic monitoring. Service files are local plaintext; export independent JSON backups. A restart requires Microsoft sign-in again.', 'تُزامن البنود المراجعة مع الخدمة المحلية. أبقِ نافذتها مفتوحة للمراقبة الآلية. ملفات الخدمة نصية محلية؛ صدّر نسخ JSON مستقلة. تتطلب إعادة التشغيل تسجيل دخول Microsoft مجدداً.')}</p>
      <div className="capture-fields">
        <label>{label('Application ID', 'معرّف التطبيق')}<input value={clientId} onChange={e => setClientId(e.target.value)} /></label>
        <label>{label('Tenant ID', 'معرّف المستأجر')}<input value={tenant} onChange={e => setTenant(e.target.value)} /></label>
      </div>
      <label className="review-consent"><input type="checkbox" checked={delivery} onChange={e => setDelivery(e.target.checked)} />{label('Request email-send and calendar-write consent as well as read access', 'طلب صلاحيات إرسال البريد وتعديل التقويم بالإضافة إلى القراءة')}</label>
      <button className="btn" type="button" disabled={busy} onClick={() => void task(async () => { setCalendarConfirmed(false); setLogin(await api('graph/start', 'POST', { clientId, tenant, delivery })); })}>{label('Start Microsoft sign-in', 'بدء تسجيل الدخول إلى Microsoft')}</button>
      {login && <p><a href={login.verificationUri} target="_blank" rel="noreferrer">{label('Open Microsoft verification', 'فتح تحقق Microsoft')}</a> · <strong>{login.userCode}</strong></p>}
      {login && <button className="btn" type="button" disabled={busy} onClick={() => void task(async () => { const r = await api<{ state: string }>('graph/poll', 'POST'); if (r.state === 'connected') { setLogin(null); await refresh(); } else setError(label('Sign-in is pending or expired; finish verification or start again.', 'التحقق قيد الانتظار أو انتهت صلاحيته؛ أكمله أو ابدأ مجدداً.')); })}>{label('Check sign-in', 'التحقق من تسجيل الدخول')}</button>}
      <p>{label('Microsoft connection', 'اتصال Microsoft')}: {state?.graph.account?.email} {state?.graph.connected ? label('Connected', 'متصل') : label('Not connected', 'غير متصل')}</p>
      <button className="btn" type="button" onClick={() => void task(async () => { setCalendarConfirmed(false); await api('graph/disconnect', 'POST'); setLogin(null); await refresh(); })}>{label('Disconnect Microsoft', 'قطع اتصال Microsoft')}</button>
      <div className="capture-fields">
        {(['email', 'calendar'] as const).map(kind => <button className="btn" key={kind} type="button" disabled={busy || !state?.graph.connected} onClick={() => void task(async () => { setSources((await api<{ sources: (SourceEvidence & { id: string })[] }>('sources', 'POST', { kind })).sources); })}>{kind === 'email' ? label('Read recent mail', 'قراءة البريد الحديث') : label('Read next seven days', 'قراءة الأيام السبعة القادمة')}</button>)}
      </div>
      <ul>{sources.map(s => <li key={s.id}><button className="btn" type="button" disabled={busy || recording} onClick={() => void task(async () => { setSource(await api<SourceEvidence>('source', 'POST', { kind: s.kind, id: s.id })); })}>{s.title || label('Untitled source', 'مصدر دون عنوان')}</button></li>)}</ul>
      <h3>{label('Local voice and interpretation setup', 'إعداد الصوت والتفسير المحلي')}</h3>
      <label>{label('Local whisper-cli executable', 'ملف whisper-cli المحلي')}<input value={voiceExe} onChange={e => { setVoiceExe(e.target.value); setOfflineConfirmed(false); }} /></label>
      <label>{label('Local multilingual model file', 'ملف النموذج المحلي متعدد اللغات')}<input value={voiceModel} onChange={e => { setVoiceModel(e.target.value); setOfflineConfirmed(false); }} /></label>
      <label>{label('Approved local Ollama model name', 'اسم نموذج Ollama المحلي المعتمد')}<input value={aiModel} onChange={e => { setAiModel(e.target.value); setOfflineConfirmed(false); }} /></label>
      <label className="review-consent"><input type="checkbox" checked={offlineConfirmed} onChange={e => setOfflineConfirmed(e.target.checked)} />{label('I verified these files and that Ollama uses a local model with cloud forwarding disabled', 'تحققت من الملفات ومن استخدام Ollama لنموذج محلي مع تعطيل التوجيه السحابي')}</label>
      <button className="btn" type="button" disabled={busy || !offlineConfirmed} onClick={() => void task(async () => { await api('voice/config', 'PUT', { executable: voiceExe, model: voiceModel, aiModel, confirmedOffline: offlineConfirmed }); await refresh(); })}>{label('Save local voice setup', 'حفظ إعداد الصوت المحلي')}</button>
      <label>{label('Original source excerpt / transcript', 'مقتطف المصدر الأصلي / النص الصوتي')}<textarea aria-label={label('Original source excerpt / transcript', 'مقتطف المصدر الأصلي / النص الصوتي')} disabled={busy || recording} maxLength={2000} rows={4} value={source.text} onChange={e => setSource({ ...source, text: e.target.value })} /></label>
      {source.truncated && <p role="note">{label('Only the first 2,000 source characters are shown. Verify the full original or paste the relevant excerpt before interpretation.', 'يُعرض أول ٢٠٠٠ حرف فقط. راجع الأصل الكامل أو الصق المقتطف المناسب قبل تفسيره.')}</p>}
      <p>{label('Check the transcript against your recording before interpreting. Ambiguous dates remain unspecified.', 'راجع النص مقارنة بالتسجيل قبل تفسيره. تبقى التواريخ الملتبسة غير محددة.')}</p>
      <label>{label('Audio file', 'ملف صوتي')}<input type="file" accept="audio/*" disabled={busy || !state?.voice.transcription} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void task(() => transcribe(f)); }} /></label>
      <button className="btn" type="button" disabled={busy || !state?.voice.transcription} onClick={() => void task(record)}>{recording ? label('Stop recording', 'إيقاف التسجيل') : label('Record locally', 'تسجيل محلي')}</button>
      <button className="btn" type="button" disabled={busy || !source.text.trim() || !state?.voice.interpretation} onClick={() => void task(async () => { const result = await api<{ lines: string; warnings?: string[] }>('interpret', 'POST', { text: source.text, language: lang }); onPrepared(source, result.lines); if (result.warnings?.length) setError(label('Some proposals or fields were rejected. Extraction may be incomplete. Compare every task, owner and date with the source before saving.', 'رُفضت بعض المقترحات أو الحقول، وقد يكون الاستخراج غير مكتمل. قارن كل مهمة ومسؤول وموعد بالمصدر قبل الحفظ.')); else if (!result.lines.trim()) setError(label('No adopted commitment was found. Review the source; no records were saved.', 'لم يُعثر على التزام معتمد. راجع المصدر؛ لم تُحفظ أي بنود.')); })}>{label('Prepare proposals for human review', 'إعداد مقترحات للمراجعة البشرية')}</button>
      <label>{label('Calendar commitment', 'بند التقويم')}<select aria-label={label('Calendar commitment', 'بند التقويم')} value={recordId} onChange={e => { setRecordId(e.target.value); setCalendarConfirmed(false); }}><option value="">{label('Choose a saved dated record', 'اختر بنداً محفوظاً له تاريخ')}</option>{register.records.filter(r => r.due).map(r => <option key={r.id} value={r.id}>{r.text} · {r.due}</option>)}</select></label>
      <label className="review-consent"><input type="checkbox" checked={calendarConfirmed} onChange={e => setCalendarConfirmed(e.target.checked)} />{label('Create an all-day due-date event in my Microsoft calendar for this record', 'إنشاء حدث يوم كامل بتاريخ استحقاق هذا البند في تقويم Microsoft')}</label>
      <button className="btn" type="button" disabled={busy || !recordId || !calendarConfirmed} onClick={() => void task(async () => { await api('calendar', 'POST', { recordId, confirmed: calendarConfirmed, expectedAccountId: state?.graph.account?.id }); setCalendarConfirmed(false); })}>{label('Create reviewed calendar event', 'إنشاء حدث التقويم المراجع')}</button>
      <button className="btn" type="button" onClick={() => void task(async () => {
        if (desktopAlerts) { setDesktopAlerts(false); return; }
        if (typeof Notification === 'undefined' || await Notification.requestPermission() !== 'granted') throw new Error(label('Desktop notification permission is unavailable or denied.', 'إذن تنبيهات سطح المكتب غير متاح أو مرفوض.'));
        notified.current = new Set((state?.events ?? []).map(e => e.id)); setDesktopAlerts(true);
      })}>{desktopAlerts ? label('Disable desktop alerts', 'إيقاف تنبيهات سطح المكتب') : label('Enable desktop alerts on this browser', 'تفعيل تنبيهات سطح المكتب في هذا المتصفح')}</button>
      <h3>{label('Automatic reminders and escalation', 'التذكير والتصعيد الآلي')}</h3>
      <p>{state?.policy.enabled ? label('Saved monitoring policy is active. Save a disabled policy to stop it. Microsoft disconnect stops new email submissions.', 'سياسة المراقبة المحفوظة مفعلة. احفظ سياسة معطلة لإيقافها. يؤدي قطع اتصال Microsoft إلى إيقاف إرسال بريد جديد.') : label('Saved monitoring policy is disabled.', 'سياسة المراقبة المحفوظة معطلة.')}</p>
      <div className="capture-fields">
        <label>{label('Reminder after overdue days', 'التذكير بعد أيام تأخر')}<input type="number" min={1} max={365} value={remind} onChange={e => { setRemind(Number(e.target.value)); setApproved(false); }} /></label>
        <label>{label('Escalation after overdue days', 'التصعيد بعد أيام تأخر')}<input type="number" min={1} max={365} value={escalate} onChange={e => { setEscalate(Number(e.target.value)); setApproved(false); }} /></label>
      </div>
      <label>{label('Exact email recipients (comma separated)', 'عناوين المستلمين الدقيقة مفصولة بفواصل')}<input value={recipients} onChange={e => { setRecipients(e.target.value); setApproved(false); }} /></label>
      <label className="review-consent"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setApproved(false); }} />{label('Enable automatic monitoring', 'تفعيل المراقبة الآلية')}</label>
      <label className="review-consent"><input type="checkbox" checked={email} onChange={e => { setEmail(e.target.checked); setApproved(false); }} />{label('Send automated email to these recipients', 'إرسال بريد آلي إلى هؤلاء المستلمين')}</label>
      <label className="review-consent"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />{label('I approve these recipients and thresholds for automatic email submission', 'أعتمد هؤلاء المستلمين وحدود التأخر لإرسال البريد الآلي')}</label>
      <button className="btn" type="button" disabled={busy || enabled && email && (!approved || !state?.graph.delivery || !state.graph.account?.id)} onClick={() => void task(async () => { await api('policy', 'PUT', { policy: { enabled, email, recipients: recipients.split(',').map(x => x.trim()).filter(Boolean), remindAfterDays: remind, escalateAfterDays: escalate }, approved }); await api('scan', 'POST'); await refresh(); })}>{label('Save automation policy', 'حفظ سياسة الأتمتة')}</button>
      {state?.error && <p role="alert">{state.error}</p>}
      <p>{label('Reminders repeat once per overdue day before escalation; escalation submits once per record/due date. Accepted means provider acceptance, not confirmed email delivery. Uncertain submissions are never resent automatically.', 'يتكرر التذكير مرة يومياً قبل التصعيد؛ يُرسل التصعيد مرة لكل بند وتاريخ استحقاق. تعني الحالة accepted قبول المزود، لا إثبات التسليم. لا يُعاد إرسال الحالات غير المؤكدة آلياً.')}</p>
      <ul>{state?.events.slice(-20).reverse().map(e => <li key={e.id}>{e.date} · {e.stage} · {e.text} · <strong>{({ accepted: label('Accepted for processing', 'قُبل للمعالجة'), local: label('Local alert', 'تنبيه محلي'), pending: label('Awaiting connection', 'بانتظار الاتصال'), uncertain: label('Needs submission review', 'يحتاج مراجعة الإرسال'), cancelled: label('Cancelled', 'أُلغي'), attempting: label('Submitting', 'جارٍ الإرسال') } as Record<string, string>)[e.status] ?? e.status}</strong>{e.note && <p>{e.note}</p>}</li>)}</ul>
    </>}
  </section>;
}
