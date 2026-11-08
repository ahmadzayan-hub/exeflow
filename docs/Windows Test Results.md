# ExecFlow local launcher test results

Prepared for Ahmed Zaian. Date: 9 November 2026, Dubai.

## Scope and source

Base: PR #6, commit `1ae40303098feabecb3877fbab785d60cb4cac8e`, fetched 9 November Dubai time. GitHub reported the PR open and Draft. All work stayed in a separate local branch, `feat/windows-local-launcher`. The follow-up prepared local review branch feat/windows-local-launcher and a Windows CI job; upload was blocked by automatic approval review and the remote branch lookup returned 404. No application deployment, merge, production configuration edit, migration, or live data use is included. See the follow-up evidence for the actual CI outcome.

Added `StartExecFlow.cmd`, dependency-free `scripts/LocalLauncher.mjs`, launcher and persistence tests, local npm commands and operating instructions. Existing application source, parser, storage schema, JSON export/import, Vite configuration and backend were not changed. The built page is served from `http://127.0.0.1:4173/#commitments` only. The server does not change ports, install dependencies, stop other applications or provide backend reporting APIs.

## Actual results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript check | Passed | Typecheck.log |
| Production and standalone build | Passed | Build.log |
| Existing unit/component suite | 70 passed, zero failed | UnitTests.log |
| Local launcher suite | 12 passed, zero failed | LauncherTests.log |
| Existing commitment browser suite | 5 scenarios passed | CommitmentsBrowser.log |
| Existing Jarvis browser suite | 4 scenarios passed | JarvisBrowser.log |
| New fixed-origin persistence/recovery suite | English desktop and Arabic mobile passed | PersistenceTests.log |
| Patch whitespace check | Passed | `git diff --cached --check` |

Launcher checks exercise fixed origin, missing build error, IPv4 loopback binding, HTML delivery, cache/network restrictions, Host rejection, disallowed methods, source-file nonexposure, occupied-port failure with original server still healthy, shutdown/restart, and the actual Node CLI running from a directory with spaces without node_modules. The updated CLI stops with Enter or POSIX SIGINT, exits with code zero and releases the port.

Each new browser case creates a disposable on-disk browser profile, captures a synthetic source-bound item via the review gate, closes it, exports JSON through the UI, and checks reload. It then closes the entire browser process and actual launcher server, restarts both at port 4173, and compares the complete stored register. It removes the commitment storage key to simulate register loss, confirms an empty register, restores the downloaded JSON through the UI and compares every field with the original. Invalid JSON leaves the restored register unchanged. A second browser/server restart retains the restoration. Source quotes and closure date survive. No external HTTP requests or page errors were observed. SyntheticEnglish.json and SyntheticArabic.json are the actual exported files.

The previous browser suite additionally checks RTL, mobile overflow, review gating, unresolved lines, invalid backups and the file-preview warning. Jarvis checks UI evidence and keyboard flows; it did not validate real audio or installed Arabic/English voices.

## Environment and limits

Actual execution: Linux, Node v24.22.1, Playwright 1.62.1, Chromium 153.0.8010.0 supplied by @sparticuz/chromium 153.0.0. The default Playwright browser download returned invalid archive bytes, so the browser binary was obtained from that npm package and extracted locally. Test launches used `--no-sandbox`, `--disable-dev-shm-usage`, `--no-zygote`, and `--use-angle=swiftshader`. Browser web security was not disabled. Windows and Linux tests must not be conflated.

No Windows executor, cmd.exe, Windows default-browser association, Edge profile, enterprise device policy or Windows process-control runtime was available. Therefore **the .cmd launcher, missing-Node console branch, automatic Windows browser opening and Windows Ctrl+C behaviour remain unverified on an actual Windows machine**. The cross-platform Node server, lifecycle and browser persistence were actually tested as above. Node version rejection is implemented but was not tested with an older Node executable. Backend tests were not rerun because backend code was untouched and is not included as a running service in this package.

These results do not prove storage durability under power loss, profile corruption, browser cleanup, quota changes or all device policies. localStorage remains working browser storage; independent JSON files are required for recovery. No automatic disk backup is claimed. Previously saved file: or another origin's records must be exported there and imported into the fixed local origin.

## Reproduce and Windows acceptance

From the source checkout, run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:local`. Install Playwright 1.62.1 in a disposable tooling directory and install its Chromium runtime. Set `BROWSER_TOOL_ROOT` to that directory, then run:

```text
node scripts/verify-commitments-browser.mjs
node scripts/verify-jarvis-browser.mjs
node scripts/VerifyLocalPersistence.mjs
```

The test scripts require the launcher port to be free. The acceptance test creates and deletes only its own disposable browser profiles, never your normal browser data. The package includes the new test sources and logs; existing test sources remain in PR #6. The CLI Enter-shutdown subtest is cross-platform. The SIGINT subprocess test runs on POSIX only; Windows console Ctrl+C requires a separate manual check. The launcher tests included in this package can run directly with `node --test scripts/LocalLauncher.test.mjs`.

On Windows, extract to a local folder, start StartExecFlow.cmd, verify the exact URL, make and export a synthetic item, close browser and server, restart and verify the item. Restore JSON in a separate test profile. Start a second launcher while the first is active and verify the occupied-port message. Stop with Ctrl+C, then restart. Record Windows/Node/browser versions and outcomes before calling Windows acceptance complete.

## Follow-up changes and remaining gate

The first piped Enter test revealed that the HTTP server could close while its stdin pipe kept Node alive. Shutdown now closes readline and destroys the stdin handle. Fresh process tests confirm exit code zero and immediate reuse of port 4173 for both Enter and POSIX SIGINT. Windows SIGBREAK is also handled, but actual Windows signal behaviour is not claimed as tested.

StartExecFlow.cmd now supports an approved portable Runtime/node.exe before checking PATH. CheckExecFlow.cmd provides a native Windows synthetic acceptance entry point without npm dependencies. VerifyWindowsLauncher.mjs defines six native Windows checks and writes WindowsAcceptance.json only after all six pass. Those checks are prepared, not executed in this environment. The Windows CI job also includes real browser process restart and JSON recovery; its execution is pending explicit approval to upload the isolated test branch and run GitHub Actions. No workflow, branch or application was published by this follow-up.

All source changes are included in the review patch. Local source commit 5df029e was created before the blocked push, with further local refinements included in that patch. No merge or production change occurred. The package retains Node as an external approved prerequisite, so it is not a standalone Windows executable or an installed Node runtime.
