# Restore safety review

Author: Ahmed Zaian. 9 November 2026, Dubai.

The former file picker immediately replaced the register when it read a valid JSON backup. It also allowed replacement of corrupt storage without a means to export the original bytes. This change stages the validated register in a preview, requires explicit confirmation, supports cancellation, and requires original-text download plus human acknowledgement before replacing an unreadable register. The user must verify the downloaded file; download initiation is not a durable-backup guarantee.

A request counter prevents an earlier asynchronous file read from reviving a discarded selection after a newer file or intervening save. Saves invalidate pending restores. The existing JSON schema, source validation, grammar, weekly brief, portfolio and backend interfaces are unchanged. No dependency was added.

Review covered correctness, readability, architecture, security and performance. The restore flow uses existing validation and bounded file limits. React renders counts and labels as text. Browser storage remains unencrypted, local to its origin and profile, and unsuitable for multi-user coordination or permanent backup. No cross-tab locking or audit-history guarantee is introduced.

Local validation passed: 73 frontend tests, production/standalone build, 12 launcher tests, original commitment browser scenarios, and English/Arabic persistent browser tests. New tests cover preview/cancel, corrupt-text recovery and acknowledgement, and delayed file-read ordering. Browser cases downloaded and checked the exact corrupt original, confirmed recovery, and verified reload. A mutation replacing the corrupt-storage confirm button's disabled guard with false caused the targeted regression test to fail; restoring the guard restored the green suite.

The previous Windows baseline remains documented at its own tested SHA in Windows Test Results.md. The new source changes require their own Windows and Linux CI evidence before merge. Final run and merge identifiers are recorded in the release report.
