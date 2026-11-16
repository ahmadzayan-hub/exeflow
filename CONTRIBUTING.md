# Contributing

Thank you for helping. ExecFlow is small on purpose, so changes are easiest to review when they are focused.

## Ground rules

1. **Numbers come from code.** Anything shown as a figure must be computed by a tested function. A language model may write prose around facts; it never supplies them.
2. **No real data in the repository.** Do not commit contract references, values, names or files from a real register or a real report. Use fictional data. `data/private/` is git-ignored for a reason.
3. **English and Arabic together.** A new user-facing string needs both versions with the same meaning, not a literal translation. Arabic is formal Gulf Arabic for official content.
4. **Plain writing.** Short sentences, no filler, no em dashes in user-facing text.

## Setup

```bash
git clone https://github.com/ahmadzayan-hub/exeflow.git && cd exeflow
npm ci
npm run dev                       # http://localhost:5173
npm test                          # unit tests
npm run build                     # typecheck + production build

# optional Python service
python -m venv .venv && . .venv/bin/activate
pip install -e "./server[dev]"
(cd server && python -m pytest -q)
```

Node 22 and Python 3.11 or newer.

## Before you open a pull request

- `npm test`, `npm run build` and the Python tests pass.
- New logic has a test. Pure functions in `src/metrics.ts`, `src/actions.ts`, `src/capture.ts` and `src/engine/` are the pattern to follow.
- You checked the screen in English and Arabic, light and dark, and at phone width.
- Docs under `docs/` are updated when behaviour changes, and `CHANGELOG.md` has a line under *Unreleased*.

## Commit style

Imperative, specific subject under 72 characters, a body that says why. Examples: `fix: keep overdue items out of the waiting column`, `feat: dictation in Quick capture`.

## Reporting problems

Use the issue templates. For anything involving real data, do not attach it: describe the shape of the problem or reproduce it with the example register. Security issues go through the process in [SECURITY.md](SECURITY.md).
