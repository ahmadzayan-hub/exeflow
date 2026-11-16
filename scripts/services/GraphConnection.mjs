// Delegated Microsoft Graph client. Tokens stay in process memory only.
const AUTH = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class GraphConnection {
  constructor({ fetcher = fetch, now = Date.now } = {}) { this.fetcher = fetcher; this.now = now; this.disconnect(); }
  disconnect() { this.abort?.abort(); this.abort = new AbortController(); this.pending = null; this.token = null; this.config = null; this.account = null; }
  status() { const connected = !!this.token && (this.token.expiresAt > this.now() || !!this.token.refresh); return { connected, account: this.account, delivery: connected && !!this.token?.scopes?.includes('Mail.Send'), calendarWrite: connected && !!this.token?.scopes?.includes('Calendars.ReadWrite') }; }
  async start(config) {
    this.disconnect();
    if (!guid.test(config.clientId ?? '') || !(guid.test(config.tenant ?? '') || ['organizations', 'common'].includes(config.tenant))) throw new Error('Use an approved public-client Entra application ID and tenant ID.');
    this.config = { clientId: config.clientId, tenant: config.tenant };
    const scope = ['offline_access', 'User.Read', 'Mail.Read', config.delivery === true ? 'Calendars.ReadWrite' : 'Calendars.Read'];
    if (config.delivery === true) scope.push('Mail.Send');
    const r = await this.fetcher(`${AUTH}/${config.tenant}/oauth2/v2.0/devicecode`, { method: 'POST', body: new URLSearchParams({ client_id: config.clientId, scope: scope.join(' ') }), redirect: 'error', signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(20000)]) });
    const d = await r.json(); if (!r.ok || typeof d.device_code !== 'string' || typeof d.user_code !== 'string') throw new Error('Microsoft sign-in could not start. Check app registration, tenant policy and connectivity.');
    const uri = new URL(d.verification_uri); if (uri.protocol !== 'https:' || !['microsoft.com', 'login.microsoftonline.com'].includes(uri.hostname)) throw new Error('Unexpected Microsoft verification address.');
    this.pending = { code: d.device_code, expiresAt: this.now() + Math.min(1800, Number(d.expires_in) || 900) * 1000, interval: Math.max(5, Number(d.interval) || 5) * 1000, nextPoll: 0 };
    return { userCode: d.user_code, verificationUri: uri.href, expiresAt: this.pending.expiresAt };
  }
  async poll() {
    const p = this.pending; if (!p || this.now() >= p.expiresAt) { this.pending = null; return { state: 'expired' }; }
    if (this.now() < p.nextPoll) return { state: 'pending' };
    p.nextPoll = this.now() + p.interval;
    const r = await this.fetcher(`${AUTH}/${this.config.tenant}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: p.code }), redirect: 'error', signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(20000)]) });
    const d = await r.json();
    if (this.pending !== p) return { state: 'cancelled' };
    if (d.error === 'authorization_pending') return { state: 'pending' };
    if (d.error === 'slow_down') { p.interval += 5000; p.nextPoll = this.now() + p.interval; return { state: 'pending' }; }
    if (!r.ok || typeof d.access_token !== 'string') { this.pending = null; throw new Error('Microsoft sign-in was declined or expired. Start again.'); }
    this.accept(d); this.pending = null;
    try { const profile = await this.request('/me/?$select=id,displayName,mail,userPrincipalName'); if (typeof profile.id !== 'string' || !profile.id) throw new Error('missing identity'); this.account = { id: profile.id, name: String(profile.displayName ?? '').slice(0, 200), email: String(profile.mail ?? profile.userPrincipalName ?? '').slice(0, 254) }; } catch { this.disconnect(); throw new Error('Microsoft identity could not be verified. Start sign-in again.'); }
    return { state: 'connected' };
  }
  accept(d) { this.token = { value: d.access_token, refresh: d.refresh_token, scopes: String(d.scope ?? '').split(' '), expiresAt: this.now() + Math.max(0, (Number(d.expires_in) || 0) - 60) * 1000 }; }
  async request(path, init = {}) {
    if (!path.startsWith('/me/') || path.includes('://')) throw new Error('Unsupported Graph path.');
    if (this.token && this.token.expiresAt <= this.now() && this.token.refresh) {
      const current = this.token;
      const r = await this.fetcher(`${AUTH}/${this.config.tenant}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, grant_type: 'refresh_token', refresh_token: current.refresh }), redirect: 'error', signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(20000)]) });
      const d = await r.json(); if (this.token !== current) throw new Error('Microsoft session changed during refresh.'); if (!r.ok || typeof d.access_token !== 'string') { this.token = null; throw new Error('Microsoft session needs a new sign-in.'); } this.accept({ ...d, scope: d.scope ?? current.scopes.join(" "), refresh_token: d.refresh_token ?? current.refresh });
    }
    if (!this.status().connected) throw new Error('Sign in to Microsoft first.');
    const active = this.token;
    const r = await this.fetcher(GRAPH + path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${this.token.value}` }, redirect: 'error', signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(20000)]) });
    if (this.token !== active) throw new Error('Microsoft session changed while the request was running.');
    if (!r.ok) throw new Error(`Microsoft Graph returned ${r.status}; verify consent, policy and connection. No successful delivery is recorded.`);
    return r.status === 202 || r.status === 204 ? { accepted: true } : r.json();
  }
  async sources(kind, start, end) {
    const path = kind === 'email' ? '/me/messages?$top=10&$select=id,subject,bodyPreview,webLink,receivedDateTime' : `/me/calendarView?${new URLSearchParams({ startDateTime: start, endDateTime: end, '$top': '20', '$select': 'id,subject,bodyPreview,webLink,start,end' })}`;
    const d = await this.request(path);
    return (d.value ?? []).slice(0, 20).map(x => ({ id: String(x.id), kind, title: String(x.subject ?? '').slice(0, 200), text: String(x.bodyPreview ?? '').slice(0, 2000), reference: typeof x.webLink === 'string' && x.webLink.startsWith('https://') ? x.webLink : '' }));
  }
  async source(kind, id) {
    if (!['email', 'calendar'].includes(kind) || typeof id !== 'string' || !id || id.length > 2048) throw new Error('Invalid source selection.');
    const value = await this.request(`/me/${kind === 'email' ? 'messages' : 'events'}/${encodeURIComponent(id)}?$select=subject,body,webLink`, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    const text = `${value.subject ?? ''}\n${value.body?.content ?? ''}`;
    return { kind, title: String(value.subject ?? '').slice(0, 200), text: text.slice(0, 2000), reference: typeof value.webLink === 'string' && value.webLink.startsWith('https://') ? value.webLink : '', truncated: text.length > 2000 };
  }
  async calendar(record) {
    if (!this.status().calendarWrite) throw new Error('Calendar write consent is required.');
    if (!record.due) throw new Error('This record has no due date.');
    const end = new Date(`${record.due}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    return this.request('/me/events', { method: 'POST', body: JSON.stringify({ subject: `ExecFlow: ${record.text}`, isAllDay: true, start: { dateTime: `${record.due}T00:00:00`, timeZone: 'Arabian Standard Time' }, end: { dateTime: `${end.toISOString().slice(0, 10)}T00:00:00`, timeZone: 'Arabian Standard Time' }, transactionId: `ExecFlow-${record.id}-${record.due}`, body: { contentType: 'text', content: `Source: ${record.source.name}\n${record.source.quote}` } }) });
  }
  async send(event, recipients) {
    if (!this.status().delivery) throw new Error('Mail.Send consent is required.');
    return this.request('/me/sendMail', { method: 'POST', body: JSON.stringify({ message: { subject: `ExecFlow ${event.stage}: ${event.text}`, body: { contentType: 'text', content: `Owner: ${event.owner ?? 'Not specified'}\nDue: ${event.due}\nSource: ${event.source}\nEvent: ${event.id}\nReview the original record before acting.` }, toRecipients: recipients.map(address => ({ emailAddress: { address } })), internetMessageHeaders: [{ name: 'x-execflow-event-id', value: event.id }] }, saveToSentItems: true }) });
  }
}
