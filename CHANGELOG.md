# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Escalation rules** on the commitments register: late items split into *remind the owner* and *needs the director* (limit adjustable, default 7 days; an item with no owner goes straight to the director). Copy a ready reminder in English or Arabic. Nothing is sent.
- **Commitments strip** on the portfolio home: needs my decision, overdue, escalated to me, closure rate and closed on time.
- **Closed on time** rate for items that had a due date.

## [0.4.0] - 2026-11-16

### Changed
- **Merged the interactive v0.2 work with `main`** (local Windows package, commitments register, Jarvis commands, API token authentication, offline execution policy). Nothing from `main` was removed.
- The Reporting screen now has two modes: *On this device* (default, no backend) and *Analytics service* (token-protected Python service). The service access token form moved into the service tab.
- Single-file build is written to `dist/rmd-dashboard.html`, as the launcher and Windows package expect.
- `vite build --mode release` keeps shipping an empty demonstration portfolio; the default public build ships the fictional showcase.
- Imported registers keep the original storage key so data saved by earlier versions still loads; a view name followed by `&pair=` in the URL hash is read correctly.
- Toast region no longer uses `role="status"`, so it does not clash with in-page status messages.

### Fixed
- `.gitignore` excluded `src/data/` through an unanchored `data/` rule; the files are tracked again.

### Policy note
- The Python service stays offline by default and rejects cloud providers. The optional `/api/narrate` function is the only cloud path, it is off unless `GROQ_API_KEY` is set on your own deployment, and it sends aggregates only.

## [0.2.0] - 2026-10-23

### Added
- **Quick capture** in English and Arabic with optional dictation: owner, due date, type and project are proposed, you confirm.
- **Item actions**: mark done, move the due date, reopen, remove captured items; monthly progress and stage update in the project drawer.
- **Timeline** view with progress, plan marker, milestones, today line and right-to-left mirroring.
- **Weekly director brief**: copy as text, download Markdown, print to PDF.
- **As of** date control to recalculate every screen for another date.
- **Browser analytics engine**: CSV and Excel analysed on the device with an evidence gate, no backend needed.
- **Optional AI narrative** through a Vercel function (`/api/narrate`), with an access key, payload validation, rate limit and a numeric check on the answer.
- Portfolio insights: health by asset and known value by category.
- Light, dark and system themes; installable web app manifest and icons; strict security headers.
- Vercel configuration, fictional showcase data that tracks today's date, example register, professional repository documentation.

### Changed
- Public builds ship fictional data only. The real register moved out of the repository tree to `data/private/` (git-ignored).
- Tiles and attention columns now share one classification so their counts always agree.

### Fixed
- Dark theme restored after the RTA colour redesign dropped it.
- Status pills use dark text on amber and theme-aware text elsewhere for readable contrast.

## [0.1.0] - 2026-09-02

### Added
- RMD projects executive dashboard, English and Arabic, RTA identity colours.
- Analytics service with ingestion, deterministic tools, analyst, reviewer and reporter agents, memory, and Hermes Agent integration.
