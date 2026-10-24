# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
