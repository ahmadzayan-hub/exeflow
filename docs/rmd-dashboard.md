# RMD Projects Executive Dashboard

Executive view of the Rail Maintenance Department (RMD) project and contract
portfolio for Dubai Metro and Dubai Tram. Built as the first ExecFlow screen:
one user (the director), one question set (what needs my decision, what is
overdue, what am I waiting for), one register behind it.

## Run

```bash
npm ci
npm run dev        # local development server
npm test           # metrics engine and register tests
npm run build      # typecheck, Vite build, then dist/rmd-dashboard.html
```

`dist/rmd-dashboard.html` is a single self-contained file. It opens from a
phone, a shared drive or an email attachment with no server.

## What the screen shows

1. **Director tiles**: Needs my decision, Waiting for others, Overdue, Closed
   this period. Clicking a tile filters the project grid.
2. **Schedule health**: On track, At risk, Delayed, Not assessed. Computed,
   never typed in (see rules below).
3. **Portfolio facts**: project and contract counts, known portfolio value in
   AED, how many entries have no value on file, milestones due in 30 days,
   contracts ending in 90 days.
4. **Director attention**: three columns built from the open items in the
   register plus flags derived from dates on file.
5. **Project cards**: reference, asset, category, stage, contractor, value,
   start, completion, time elapsed, planned versus actual progress, next
   milestone, open risks and items, data confidence.
6. **Detail drawer**: work packages, milestone table, open items, risks,
   notes and sources for one project.

English and Arabic (RTL) are switchable. The print button produces a
one-page-per-section executive printout.

## Data rules

Schedule health per project:

| Case | Result |
|---|---|
| Planned and actual progress on file, actual minus planned >= -2 pp | On track |
| Variance between -2 and -10 pp | At risk |
| Variance below -10 pp | Delayed |
| No progress data, milestone overdue by more than 60 days | Delayed |
| No progress data, milestone overdue by 60 days or less, or marked at risk | At risk |
| Nothing to assess | Not assessed |

Derived flags (not stored, computed from dates):

- Milestone overdue: an open milestone with a planned date before the
  reporting date.
- Contract expiry: completion or contract end within 90 days. For contracts
  this is listed under Needs my decision as a renewal or retender decision.
- Item overdue: an open item with a due date before the reporting date.

Data confidence per project and per open item:

- `verified`: taken from an RMD record (contract reference, letter, report).
- `tbc`: the entry exists but the value has not been confirmed against OPMS
  or the contract file.
- `illustrative`: demo data only.

## Updating the register

The register is `src/data/portfolio.json`. Each project carries: reference,
bilingual name, asset (metro, tram, both), category, stage, contractor,
consultant, value, spent, start, completion, DLP end, progress (planned and
actual percent with an as-of date), work packages, milestones, risks, open
items (decision, waiting, info) and sources.

Monthly cycle:

1. Update `reportingPeriod` (label and as-of date).
2. Enter planned and actual progress per project from the monthly Projects
   Progress Overview Report or OPMS.
3. Update milestone actual dates and statuses.
4. Add or close open items. Closing an item with `closedOn` inside the period
   feeds the Closed this period tile.
5. Run `npm test` (the seed test rejects illustrative confidence in the
   register) and `npm run build`.

The dashboard also accepts an exported or hand-edited JSON through Import
JSON in the toolbar. The imported file persists in the browser until Reset.

## Seed register status (as of 2 September 2026)

Facts on file with references: ATC SMC Upgrade (RA/RM/24-10128, AED 96M,
NTP 13 Aug 2025, Taking Over 12 Feb 2028, DLP to 12 Feb 2030, WP-C AED
16.91M), Rail Systems Enhancement Consultancy (RA/RM/25-13910, AED 19.24M,
36 months, WP-B AED 935K), BTN-SDH Migration (RA/RM/24-10207), ODAS
Implementation (RA/RM/25-13855), ST05 Enhancement Maintenance
(RA/RM/24-10212-ST05, Mar 2025 to Nov 2027), Tram Miscellaneous Service
Maintenance (RA/RM/23-6863, Nov 2023 to Nov 2026), Asset Criticality
Consultancy (SCG/AM/25-14307).

Not on file and shown as TBC: progress percentages for every project, values
and dates for BTN-SDH, ODAS, MSN Upgrade, the civil assessments and the
energy project, and the commencement date of the SENER consultancy.

Open items in the seed are taken from the RMD review checklists and
precedents and are all marked to be confirmed. Their due dates, where set,
are internal targets or the month an issue was first raised, not contractual
dates.
