# Deployment

ExecFlow deploys as a static site. The optional pieces (AI narrative, Python service) are separate and can be added later.

## Vercel (recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fahmadzayan-hub%2Fexeflow&env=GROQ_API_KEY,EXECFLOW_ACCESS_KEY&envDescription=Both%20are%20optional.%20GROQ_API_KEY%20enables%20the%20AI%20narrative%3B%20EXECFLOW_ACCESS_KEY%20protects%20it.&project-name=exeflow)

1. Import the repository in Vercel. The settings in [`vercel.json`](../vercel.json) are picked up: framework Vite, `npm ci`, `npm run build:web`, output `dist`.
2. Deploy. The result is the **showcase** build: fictional data that moves with today's date. It contains no real register.
3. Optional AI narrative. In **Project Settings, Environment Variables**, add:

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Enables `/api/narrate`. Without it the Reporting screen still works and uses the deterministic report. |
| `EXECFLOW_ACCESS_KEY` | A shared secret. When set, the endpoint requires it in the `x-execflow-key` header, and the Reporting screen asks for it once per browser session. **Set this on any public URL**, otherwise anyone can spend your model quota. |
| `GROQ_MODEL` | Default `openai/gpt-oss-120b`. Confirm current model ids at the Groq console before changing. |
| `GROQ_BASE_URL` | Default `https://api.groq.com/openai/v1`. Any OpenAI-compatible endpoint works. |

The function accepts at most 24 KB per request, validates every field, limits each caller to 12 requests per 10 minutes per instance, and forwards only aggregates. For stronger limits use Vercel Firewall rules on `/api/narrate`.

### What the headers do

[`vercel.json`](../vercel.json) sets a strict Content Security Policy (scripts, styles and connections from the same origin only), `X-Frame-Options: DENY`, `nosniff`, a restrictive referrer policy, and a Permissions Policy that allows the microphone for dictation on your own origin only.

### Protecting a deployment that uses real data

Do not deploy a private build to a public URL. If you must host it, turn on **Vercel Authentication** (Project Settings, Deployment Protection) so only your team can open it. See [Data governance](data-governance.md).

## Single HTML file (offline)

```bash
npm ci
npm run build          # writes release/rmd-dashboard.html
```

`release/rmd-dashboard.html` is one self-contained file. It opens from a phone, a shared drive or an email attachment, with no server.

## Private build with your own register

```bash
mkdir -p data/private
cp my-register.json data/private/register.json     # git-ignored
npm run build:private                               # bundles the register; never deploy this publicly
```

`npm run dev` uses the private register automatically when the file exists, and the showcase otherwise.

## Analytics service (PDF, Word, multi-agent)

```bash
pip install -e "./server[dev]"
cp .env.example .env            # add GROQ_API_KEY
uvicorn execflow.api:app --port 8000 --app-dir server
```

Or `docker compose up --build` (add `--profile local` for a bundled Ollama). Details and the agent pipeline are in [Analytics](analytics-os.md).

## Environments at a glance

| You want | Use |
|---|---|
| A shareable demo | Vercel, no variables |
| AI-written reports on the demo | Vercel with `GROQ_API_KEY` and `EXECFLOW_ACCESS_KEY` |
| Your real register, on your machine | `npm run dev` with `data/private/register.json` |
| Your real register on your phone | Private build, single HTML file, or Vercel behind Vercel Authentication |
| PDF and Word analysis | The Python service, locally or in Docker |
