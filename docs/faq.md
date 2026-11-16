# FAQ

**Is my data uploaded anywhere?** Not in the default setup. Edits live in your browser. Files you analyse are read in the browser. See [Data governance](data-governance.md) for the three actions that do send something, and what.

**Why does the public demo show fictional projects?** The repository is public. Real contract references and values must not be. The demo is generated in the browser from invented data and moves with today's date so overdue and upcoming items always look real.

**How do I use my own register?** Import a JSON file from **Data, Import JSON**, or put it in `data/private/register.json` and run `npm run dev`. The format is in [Data model](data-model.md); start from `data/register.example.json`.

**Where is my data after I edit?** In the browser on that device. Use **Export JSON** to back it up or move it. Clearing site data removes it.

**Can the AI invent a number?** It can try. The text it returns is compared with the facts that were sent, and any new number discards the draft. The check cannot catch a wrong claim made only in words, so keep the verified report as the source of record.

**How strong is the evidence gate?** It accepts a number that is in the evidence, or a simple derivation of it such as a percentage change or a share. That keeps real findings flowing but means an invented value that happens to equal a derivation can pass. It is a safety net, not a proof. Findings also show the evidence ids so a reviewer can re-run the computation.

**Does Quick capture understand Gulf Arabic?** It handles common phrasing, weekdays, relative dates and department names, and always asks you to confirm. It does not guess a project unless the wording clearly matches one.

**Why not a database and logins?** The first job is a single director's weekly loop, which does not need them. Sharing a register is on the [roadmap](roadmap.md).

**Can I change the colours to the official identity?** Yes. Edit the tokens at the top of `src/styles.css`. See [Design system](design-system.md).

**Which Groq model is used?** `openai/gpt-oss-120b` by default, set by `GROQ_MODEL`. Model catalogues change, so confirm current ids in the Groq console before relying on one.
