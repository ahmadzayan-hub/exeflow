# Roadmap

The start rule from the [charter](charter.md) still holds: one user (the director), one workflow (meeting to register to weekly brief), one measure of success before any expansion.

## Done

- Capture to register to weekly brief, in English and Arabic.
- Timeline, item actions, monthly update, As of date.
- Browser analytics with an evidence gate; optional AI narrative.
- Python service, agent pipeline and Hermes Agent integration.
- Vercel deployment with strict headers; offline single file; private build.
- Closure rate, mean closure time and on-time closure on the commitments register and on the portfolio home.
- Escalation rules: late items are split into *remind the owner* and *needs the director* (limit adjustable, default 7 days).

## Next

| Item | Why |
|---|---|
| **Lead time percentiles** (median and 90th percentile, not only the mean) | A mean hides the slow tail that the director cares about |
| **Send reminders** from the escalation list through the reviewed local email integration | Today the reminder is copied, not sent |
| **Meeting minutes import**: paste or upload minutes and review proposed commitments in the capture dialog | Biggest source of commitments |
| **Share a register**: export a read-only link or a signed JSON for a deputy | Covers absence and delegation |
| **PDF and Word in the browser** | Removes the need for the service for common reports |
| **Event output**: `executive.action_overdue` for other tools in the family | Integration, after the single-user loop is measured |

## Not planned

Project scheduling, document analysis and KPI management are other products' jobs. ExecFlow owns what was decided and whether it closed.

Ideas and corrections are welcome through the [issue templates](../.github/ISSUE_TEMPLATE).
