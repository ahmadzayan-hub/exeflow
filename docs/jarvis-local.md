# Jarvis portfolio commands

This milestone adds an original SVG-free CSS status core and a read-only command panel to the portfolio view, directly after the project filters. It uses the existing in-memory portfolio; it does not call the reporting/model API, change portfolio data, or persist command history. No code or media was copied from the Jarvis donor repository, and no dependencies were added.

## Commands and evidence

- `overdue`, `/overdue`, `show overdue`, `متأخرات`, `المتأخرات`, or `متأخر`: open attention items past due plus overdue milestones.
- `waiting`, `show waiting`, `انتظار`, `المنتظرات`, or `بانتظار الآخرين`: open waiting items not already overdue, including undated items.
- `project` / `مشروع`: details for the project chosen in the panel. Add an exact project ID, reference or English/Arabic name to resolve it directly. Ambiguous names require a selection or unique ID; there is no fuzzy match.
- `help` / `مساعدة`: command guidance. Other text shows an unsupported-command message and takes no action.

The panel only queries projects matching the current dashboard filters. It displays that scope, dataset label and report date. Existing `attentionBuckets` / `overdueMilestones` calculations keep the same classification as the dashboard. Due-today items are not overdue. Results recompute when props change, including imports, demo/reset, filters and language. An invalid report date prevents due-item calculations in the panel.

Each item includes its project, title, recorded owner, due date, reference, project sources and confidence. Missing metadata is shown as missing. Milestone owners are not inferred from contractors; milestone lateness is explicitly marked as derived. Project detail commands show the recorded stage, completion date, contractor, source and attention counts, with a button opening the existing project drawer.

## Optional readback

`Read summary locally` is an explicit user action. Only a `SpeechSynthesisVoice` with `localService === true` and the current language is accepted. There is no default or remote voice fallback. The text read is exactly the displayed scope and summary, not the full item list. If no matching local voice is exposed, text commands remain available and readback is disabled. This relies on the browser's local-service declaration; the operating-system voice implementation has not been independently audited.

Stop works by button or Escape within the panel. Active readback is cancelled on command editing/rerun, project selection, portfolio/filter/language changes, opening a project, document hiding and panel unmount (including switching to the reporting view). The panel does not interrupt a separate active speech reader. The status core animates only during its own active readback and respects `prefers-reduced-motion`.

No microphone, camera, background listening, LLM, automatic follow-ups, system commands, credentials or external voice service is implemented.

## Validation and rollout

Synthetic unit tests cover bilingual parsing, exact/ambiguous selection, matching dashboard counts, report-date/filter scope, preservation of input data, missing metadata and local-only voice selection. Component tests cover typed form submission, evidence display, opening the existing record, cancellation on scope changes/Escape/language/unmount, invalid dates and remote-voice rejection.

Run the existing checks sequentially on a machine with enough free memory:

```text
npm run typecheck
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
```

Before release, manually verify desktop/mobile layout, keyboard navigation and focus, Arabic RTL, reduced motion, actual local voice playback/stop in supported browsers, and the generated single-file HTML. jsdom tests cannot verify actual voice locality, audible output or visual layout.

The hosted `scripts/verify-jarvis-browser.mjs` check opens the generated single-file
HTML with a fabricated portfolio in a fresh Chromium context. It covers both
languages at desktop/phone sizes, keyboard focus/submission, recorded evidence,
filter scope, drawer/Escape and reduced-motion CSS. It observes the browser's
real voice inventory and requires readback to stay disabled if no matching local
voice exists, but never starts speech. Exact CI output and screenshot inspection
must be recorded separately; this does not replace audible local-voice acceptance.

The patch is isolated from the original checkout. Roll back this milestone by reversing its saved patch after checking for subsequent edits. No localStorage schema/key or data migration was introduced; there is no portfolio data to roll back.
