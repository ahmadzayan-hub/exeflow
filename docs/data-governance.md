# Data governance

ExecFlow is built for a department that handles contract and performance information. This page states exactly where data goes.

## What is public and what is not

| Item | Where it lives | In the public repository? |
|---|---|---|
| Source code | Repository | Yes |
| Showcase data (fictional) | Generated in the browser by `src/data/showcase.ts` | Yes, it is invented |
| Example register | `data/register.example.json` (fictional) | Yes |
| **Your real register** | `data/private/register.json`, or imported in the browser | **No.** `data/private/` is git-ignored |
| Edits you make | Browser storage on your device | No |

Public builds are made with the register stubbed out at build time, so a deployed site cannot contain it even by accident. `npm run build:private` is the only command that bundles it.

## What leaves your device

| Action | What is sent | To whom |
|---|---|---|
| Open the app, edit, capture, brief, timeline | Nothing | Nobody |
| Reporting in Browser mode | Nothing | Nobody |
| **Polish with AI** on the Reporting screen | Finding titles and details, KPI values, row counts, column-derived labels. No rows, no file | Your deployment's `/api/narrate`, then Groq |
| Dictation | Audio | Your browser vendor's speech service (browser feature, not ExecFlow) |
| Analytics service | Whatever you upload | Your own server; models only get schema and aggregates unless `EXECFLOW_SEND_ROWS=true` |

Groq, Nous Portal and OpenRouter are external cloud services. For data classified above public, use the local Ollama provider or a self-hosted Hermes Agent: the pipeline is identical, only the endpoint changes.

## Why a model cannot invent a number

The AI narrative is checked after it returns. Every number in the text must exist in the facts that were sent, or the draft is discarded and the deterministic report stays. Labels and column names that come from a file are treated as untrusted data in the prompt.

## If real data was committed

The first versions of this repository contained a seed register with real contract references and values. It has been removed from the current tree and replaced with fictional data, but earlier commits still hold it. If that information is not cleared for public release:

1. Rotate nothing (no credentials were involved), but assume the commits were readable.
2. Remove the history with `git filter-repo --path src/data/portfolio.json --invert-paths` on a fresh clone, then force-push every branch and ask GitHub Support to purge cached views, or delete and recreate the repository.
3. Keep the register local, in `data/private/register.json`.

To recover your own copy of the old file from history: `git show e7dde24:src/data/portfolio.json > data/private/register.json`.

## Roles

ExecFlow has no user accounts. Anyone who can open your deployment sees what it shows. Use Vercel Authentication, a private network or the offline file to control access.
