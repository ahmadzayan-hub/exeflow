# User guide

ExecFlow answers five questions for a director: what did we decide, who owns it, when is it due, what slipped, and what needs me now. This guide walks through each screen. Every screen works in English and Arabic. Use the language button in the header; the layout flips to right to left.

## The four screens

| Screen | Use it to |
|---|---|
| **Portfolio** | See decisions, overdue items and what you are waiting for, then drill into any project or contract. |
| **Timeline** | See start, completion, progress and milestones of every project on one calendar, with today marked. |
| **Weekly brief** | Produce the one-page weekly review and share it as text, Markdown or PDF. |
| **Reporting** | Turn a spreadsheet into key figures, charts, verified findings and a management report. |

Press **C** anywhere to open Quick capture. Press **Esc** to close any dialog.

## Portfolio

The four tiles at the top are the director's questions: *Needs my decision*, *Waiting for others*, *Overdue*, *Closed this period*. Click a tile to filter the project grid to the projects behind that number.

Below the tiles:

- **Schedule health by asset** shows how many projects are on track, at risk, delayed or not assessed, split by Dubai Metro, Dubai Tram and shared assets.
- **Known value by category** shows where the money sits. Projects without a value on file are counted in the tile, never guessed.
- **Director attention** lists the actual items in three columns. Each row has **Done** and **+7d** buttons. Done closes the item today. +7d moves the due date by a week; an item that is already late restarts from today.
- **Project cards** show value, dates, time elapsed, planned versus actual progress, the next milestone and where the data came from.

Click a project to open its drawer. The **Monthly update** block at the top lets you enter planned and actual progress and change the stage. The variance recalculates as you type. Milestones can be marked done or reopened. Items can be closed, snoozed or reopened.

### How health is decided

Health is computed, never typed in:

| Case | Result |
|---|---|
| Planned and actual progress on file, actual minus planned is -2 points or better | On track |
| Between -2 and -10 points | At risk |
| Worse than -10 points | Delayed |
| No progress data, milestone more than 60 days late | Delayed |
| No progress data, a milestone late by up to 60 days or marked at risk | At risk |
| Nothing to assess | Not assessed |

Some flags come from dates alone. A milestone past its planned date is overdue. A contract ending within 90 days appears under *Needs my decision* as a renewal or retender decision. A project nearing completion appears in its drawer only.

### The As of date

The **As of** control next to the tabs recalculates everything for another date. **Today** jumps to the current date. This is how you prepare for a meeting next week ("what will be overdue by then?") or reproduce last week's brief.

## Quick capture

Open it with the **Quick capture** button or the **C** key. Type or dictate what was decided or promised:

> سجّل إن علي لازم يراجع عرض المقاول قبل الخميس، وعايز رد من المالية على الدفعة السابعة.

> Ask Omar to send the revised programme by Sunday, and I need a reply from Finance on payment 7 tomorrow.

ExecFlow splits the text into commitments and proposes, for each: a title, a type (decision, waiting, note), an owner, a due date and, when the wording is clear enough, a project. Nothing is saved until you confirm. Edit any field, untick what you do not want, and choose **Save to register**. Items without a project go to the **Director inbox**.

Date wording understood: today, tomorrow, weekdays, *next week*, *end of the month*, *in N days or weeks*, ISO dates, day/month dates, and the Arabic equivalents. "Before Thursday" is read as the day before, and the dialog says so, so you can correct it.

**Dictation** uses your browser's speech service. In Chrome and Edge the audio is processed by the browser vendor, not by ExecFlow. If your browser does not support it, the button is hidden and typing works the same way.

## Timeline

Each bar runs from start to completion. The filled part is actual progress and the black tick is where the plan says it should be. Diamonds are milestones: solid when done, red outline when late. A dotted tail is the defects liability period. Projects with no start or completion date are listed under the chart so nothing disappears. Click a bar to open the project.

## Weekly brief

The brief is built from the register: decisions, overdue items, waiting items, what closed in the period, projects behind plan and the gaps in the data. Choose English or Arabic independently of the interface. Then:

- **Copy as text** gives plain text that pastes cleanly into WhatsApp or email.
- **Download .md** gives Markdown.
- **Print or save as PDF** uses the browser's print dialog; the page is laid out for A4.

## Reporting

Drop in a CSV, TSV or Excel file. In the default **Browser** mode the file never leaves your device: ExecFlow reads it, profiles it, computes aggregates, trends, distributions and outliers, and writes findings in which every number can be traced to a computation. A reviewer step rejects any statement whose numbers are not in the evidence. See [Analytics](analytics-os.md) for the optional AI narrative, PDF and Word support, and the agent pipeline.

## Where your data lives

Edits are saved in your browser on this device. They are not uploaded anywhere. To keep a copy or move to another device, use **Data, then Export JSON**, and **Import JSON** on the other device. **Discard my edits** returns to the base data. See [Data governance](data-governance.md).

## Keyboard

| Key | Action |
|---|---|
| C | Quick capture |
| Esc | Close the open dialog or drawer |
| Tab | Move through controls; all actions are reachable by keyboard |
