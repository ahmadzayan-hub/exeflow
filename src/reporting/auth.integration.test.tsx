// Local-only synthetic integration: real component + API wrapper, mocked transport.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportingView } from './ReportingView';
import { api, setApiToken } from './api';

afterEach(() => { cleanup(); setApiToken(''); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });
it('recovers from an invalid token through the real wrapper without storing credentials', async () => {
  const health = { version:'synthetic', routing:{default_provider:'mock',roles:{},allow_rows:false,mock:true,providers_with_keys:[]},supported_files:[],datasets:0 };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const accepted = new Headers(init?.headers).get('Authorization') === 'Bearer synthetic-valid';
    if (!accepted) return new Response(JSON.stringify({detail:'Valid bearer token required'}),{status:401});
    const body = url.endsWith('/health') ? health : url.endsWith('/datasets') ? {datasets:[]} : {items:[]};
    return new Response(JSON.stringify(body),{status:200});
  });
  vi.stubGlobal('fetch',fetcher);
  // The on-device panel also asks /api/narrate whether optional AI wording is enabled; that is not a service call.
  const serviceCalls = () => fetcher.mock.calls.filter(([url]) => !String(url).includes('narrate'));
  render(<ReportingView lang="en" />);
  // One probe from the mode switch, then one from the service panel once its tab is opened.
  await waitFor(() => expect(serviceCalls()).toHaveLength(1));
  fireEvent.click(await screen.findByRole('tab',{name:/Analytics service/}));
  await waitFor(() => expect(serviceCalls()).toHaveLength(2));
  let input=await screen.findByLabelText('Service access token');
  fireEvent.change(input,{target:{value:'synthetic-invalid'}});
  fireEvent.click(screen.getByRole('button',{name:'Connect'}));
  await waitFor(() => expect(serviceCalls()).toHaveLength(3));
  await waitFor(() => expect((screen.getByLabelText('Service access token') as HTMLInputElement).value).toBe(''));
  input=screen.getByLabelText('Service access token');
  fireEvent.change(input,{target:{value:'synthetic-valid'}});
  fireEvent.click(screen.getByRole('button',{name:'Connect'}));
  await screen.findByRole('button',{name:'Disconnect'});
  await waitFor(() => expect(serviceCalls()).toHaveLength(6));
  expect(screen.queryByLabelText('Service access token')).toBeNull();
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  for(const [url,init] of serviceCalls()) {
    expect(url).not.toContain('synthetic-');
    expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
  }
  setApiToken('');
  await expect(api.health()).rejects.toThrow('Valid bearer token required');
  expect(new Headers(fetcher.mock.lastCall?.[1]?.headers).has('Authorization')).toBe(false);
});
