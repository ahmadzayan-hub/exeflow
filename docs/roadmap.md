# Roadmap

The start rule from the [charter](charter.md) still holds: one user (the director), one workflow (meeting to register to weekly brief), one measure of success before any expansion.

## Done

- Capture to register to weekly brief, in English and Arabic.
- Timeline, item actions, monthly update, As of date.
- Browser analytics with an evidence gate; optional AI narrative.
- Python service, agent pipeline and Hermes Agent integration.
- Vercel deployment with strict headers; offline single file; private build.

## Next

| Item | Why |
|---|---|
| **Closure rate and lead time** as the first measured KPI, shown on the portfolio | The charter's KPI, not yet displayed |
| **Escalation rules**: an item overdue by N days moves to the director with a note to its owner | Closes the loop without chasing |
| **Meeting minutes import**: paste or upload minutes and review proposed commitments in the capture dialog | Biggest source of commitments |
| **Share a register**: export a read-only link or a signed JSON for a deputy | Covers absence and delegation |
| **PDF and Word in the browser** | Removes the need for the service for common reports |
| **Event output**: `executive.action_overdue` for other tools in the family | Integration, after the single-user loop is measured |

## Not planned

Project scheduling, document analysis and KPI management are other products' jobs. ExecFlow owns what was decided and whether it closed.

Ideas and corrections are welcome through the [issue templates](../.github/ISSUE_TEMPLATE).
