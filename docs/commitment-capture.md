# Offline meeting commitments

Open the **Commitments** view (`/#commitments`) in the built app or standalone
HTML. This implements a bounded portion of the README's P0/P1 workflow without
an inference provider, microphone, production records or database migration.

1. Enter a meeting/source name, date, and labelled text minutes.
2. Extract and review the proposed records beside their exact source lines.
3. Correct any unparsed lines in the text or explicitly acknowledge their
   omission. Missing owners and due dates remain visibly unspecified.
4. Save reviewed records. Repeated quotes for the same source name/date are
   skipped, including repeated captures after reload.
5. Set each record to open, waiting, or closed. Closing records the local
   calendar date; reopening clears that date. This is current-state tracking,
   not immutable audit history or authenticated organizational approval.
6. Download the weekly Markdown brief or the full JSON register backup.

## Supported text grammar

One record per line; optional fields are separated by `|`:

```text
Action: Review synthetic proposal | Owner: Ali | Due: 2026-11-12 | Priority: high | Dependency: Finance reply
Decision: Choose a synthetic option | Owner: Sara | Due: 2026-11-15
إجراء: مراجعة العرض التجريبي | المسؤول: علي | الاستحقاق: ٢٠٢٦-١١-١٢ | الأولوية: عالية
```

`Action` / `إجراء` and `Decision` / `قرار` are mandatory labels. Metadata labels
are Owner/المسؤول, Due/الاستحقاق, Priority/الأولوية and Dependency/الاعتماد.
Priority supports normal/عادية or high/عالية and defaults to normal.
Dates must be real YYYY-MM-DD calendar dates; Eastern Arabic digits are accepted
in the due-date field. Relative dates, duplicate/unknown metadata, oversized
lines and unlabelled narrative are reported, never guessed. Free-form voice or
transcript understanding is **not** implemented by this rules-based parser.

## Register and brief boundaries

The independent `exeflow.commitments.v1` browser-storage key holds a versioned
JSON register. Existing portfolio data and analytics/backend storage are
unchanged. Source name, meeting date, line number and exact quote travel with
each record. Input is limited to 50,000 characters, source quotes to 2,000,
record text/metadata to 500, and the register to 1,000 records.

Storage failures are surfaced without a successful-save message. Corrupt stored
data is preserved and normal captures disabled. Recover the original browser
storage before restoring a valid backup. **Restore backup replaces this register**
only after its structure, dates, unique IDs/quotes and source-derived fields
validate; an invalid backup leaves saved data intact. Export before restoring.
Local storage is neither encrypted shared storage nor protection from a person
editing their own browser data. Use synthetic or approved non-confidential data.

The brief uses today's local calendar date and the current register status.
Its closure window is the last seven calendar days inclusive. Due-today is not
overdue. Closure rate is closed records divided by all recorded commitments,
not a weekly completion target. Sections overlap intentionally and retain source
quotes; unknown metadata has its own section. Reopening removes an item from the
closed count. There is no historical snapshot reconstruction, notification,
automated escalation, email sending or domain-event delivery.

## Validation

Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
CI also runs `scripts/verify-commitments-browser.mjs` with its existing disposable
Playwright installation (`BROWSER_TOOL_ROOT`). Four synthetic browser cases cover
English/Arabic at desktop/mobile widths, review gating, unparsed lines,
source retention, closure/reload, backup/restore and invalid backups, with all
HTTP(S) requests blocked and asserted absent. Unit/component tests cover strict
dates, missing metadata, duplicate captures, quota/corrupt storage, malformed
backups, weekly boundaries and changed-source invalidation.

Actual voice transcription, arbitrary narrative extraction, multi-user durable
records, approved enterprise data, live notification integrations, and audited
authorization remain separate work. This feature does not certify those paths.
