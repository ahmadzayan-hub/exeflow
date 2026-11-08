# ExecFlow 0.2.0 local release

Author: Ahmed Zaian. 9 November 2026.

This release supports the complete local labelled-text workflow: capture meeting/source details, parse explicit Arabic/English Action/Decision lines, review exact source quotes and missing fields, save the register, close/reopen items, search and filter, review director follow-up indicators, download a weekly brief, export JSON, and preview/confirm recovery. Corrupt stored text can be downloaded before replacement.

The director view shows outstanding decisions, waiting items, overdue items, closures in the last seven calendar days, closure rate and mean captured-to-closed time. Missing values stay unavailable. Due today is not overdue. Filters do not alter saved records. Closing again after reopening uses the current closure date; this is not immutable history.

## Installation and use

Extract ExecFlowWindowsPackage.zip completely. Install approved Node.js LTS 22+ or put an approved portable node.exe in the Runtime folder. No Node binary is bundled. Double-click StartExecFlow.cmd. It opens http://127.0.0.1:4173/#commitments. Keep the console open. Press Enter to stop. Closing the browser alone does not stop the server. If browser opening fails, copy the printed address manually.

Use the same normal browser profile and fixed origin. Export JSON backups to a separate safe folder after important changes. localStorage is working storage, not a permanent backup. The package never installs dependencies automatically, changes ports, terminates another program, starts a cloud service, or publishes your local records. It binds IPv4 loopback only.

The publicly downloadable package starts with an empty demonstration portfolio. Organisational seed records are replaced during its release build and checked before packaging. Existing source builds retain their current seed and functions. Approved portfolio JSON can be imported locally. Nothing from the operator's browser profile is part of the package or uploaded by the release workflow.

## Validation and maturity

Windows CI tests native command startup, missing Node/build errors, portable Node, occupied port, Enter shutdown and reopening. Persistent Chrome scenarios cover Arabic/English capture, source review, reload, full browser/server restarts, JSON recovery, cancellation, corrupt-text export and invalid backups. The release package is extracted and its native Windows acceptance script runs against the extracted files. Build, frontend and backend suites also run before a main-branch release is published.

Version 0.2.0 is a prerelease of the broader product, not proof of every roadmap function. Voice/transcript understanding, email/calendar integrations, scheduled notifications, delivered escalation events, multi-user durable storage, cross-tab coordination and immutable audit history are not implemented here. Reporting has its existing separately configured token-protected backend; this frontend package does not start it. The existing offline/mock and optional local-model restrictions remain unchanged. No voice or live model acceptance is claimed. Device-specific browser association and interactive Ctrl+C remain local checks; Enter is the tested shutdown route.
