# ExecFlow Windows acceptance results

Prepared for Ahmed Zaian (أحمد زيان). Date: 9 November 2026, Dubai.

## Outcome and evidence

GitHub Actions run [42520994875](https://github.com/ahmadzayan-hub/exeflow/actions/runs/42520994875) completed successfully for tested source commit `fac13d2ce0a1c216ab5934492e6b0200254bfd83` on branch `feat/windows-local-launcher`. Both the Windows and Linux jobs passed. No merge, application deployment, production configuration change, migration or live data use occurred.

The branch adds a fixed-origin, dependency-free Node static launcher to PR #6 base `1ae40303098feabecb3877fbab785d60cb4cac8e`. It preserves the existing app, commitment parser, JSON schema, localStorage key, portfolio and backend code. Runtime remains local at `http://127.0.0.1:4173/#commitments`.

## Actual execution results

| Check | Environment | Result |
| --- | --- | --- |
| Production and standalone build | Windows Server 2025, Node v22.23.4 | Passed |
| Launcher suite | Windows | 11 passed, 0 failed, 1 skipped |
| Native cmd.exe acceptance | Windows | All 6 cases passed |
| Full browser/server restart and JSON recovery | Windows, preinstalled Google Chrome through Playwright 1.62.1 | English desktop and Arabic mobile passed |
| TypeScript check, production build and dependency audit | Linux CI | Passed |
| Existing frontend unit/component tests | Linux CI | 70 passed |
| Existing commitment and Jarvis browser tests | Linux CI | 9 scenarios passed |
| Existing backend tests | Linux CI | 288 passed, 2 deprecation warnings |
| Additional launcher suite | Local Linux, Node v24.22.1 | 12 passed, no failures or skips |

The Windows skip is intentional: sending SIGINT with Windows process.kill does not emulate interactive console Ctrl+C. Enter shutdown was actually tested through the Windows command launcher and released the port. Windows default-browser association and real interactive Ctrl+C/SIGBREAK remain manual device checks; CI suppresses automatic browser opening, and the persistence suite starts Chrome explicitly. The CheckExecFlow.cmd convenience wrapper was not separately invoked by CI; its underlying Windows acceptance script and StartExecFlow.cmd were executed.

## Native Windows cases actually passed

1. Launch StartExecFlow.cmd from a path containing spaces and `&`, serve the fixed origin, and exit cleanly with Enter.
2. Use an approved portable Runtime/node.exe with no Node in PATH and no npm/node_modules in the disposable package.
3. Show an actionable missing-Node message and fail cleanly.
4. Show recovery instructions for a missing built page and fail cleanly.
5. Reject an occupied port without selecting another port or terminating the synthetic port owner.
6. Reopen the same port after clean shutdown.

WindowsAcceptance.json is the actual output of these cases. The tests used temporary files, never the user's normal browser profile.

## Browser recovery actually passed on Windows

For each language, the suite used a disposable on-disk Chrome profile to capture, review, save and close a synthetic source-bound item. It downloaded the JSON backup through the UI, reloaded, and then stopped the entire browser process and launcher server. After restarting both at the same origin, it compared the complete register with the original.

It then removed the register's storage key to simulate loss, verified the empty register, restored the downloaded JSON through the UI and compared every field. Invalid JSON did not replace the valid register. A second full browser/server restart retained the restoration. Source quotes and closure dates survived. No external page requests or JavaScript page errors were observed. The Windows artifact contains the actual SyntheticEnglish.json and SyntheticArabic.json files; these are stored under Evidence/Windows in the package to distinguish them from Linux exports.

Removing a register key is a controlled loss test, not certification of recovery after device failure or profile corruption. localStorage remains working browser storage, not a permanent backup. Keep independent JSON copies outside the application folder.

## Package verification and provenance

Evidence/WindowsCI.log and Evidence/LinuxCI.log contain the actual job logs. Evidence/CIResults.json records the run, jobs, tested SHA and artifact metadata. The downloaded WindowsAcceptance.zip was verified against GitHub's SHA256 digest `a112d4961ac8905de555b86989755cdc16681feb42e8ba535cf62d9e9297f244`.

The delivered built HTML comes from the successful Linux CI artifact, whose archive digest was verified as `61a7fe6bbde2559a813d5da9f6cd015b3b0247a1c44f1d26a9fe69887aa00e04`. Its bytes match the local build exactly. HTML SHA256: `1eaa12627e67743d2e772d2eb974629c37491a272ff4f9237843870d533cade0`.

The final documentation update follows the tested code commit without changing runtime or tests. The package includes the complete review patch and checksums. Runtime prerequisites are Node.js 22+ and a browser. The Node binary is not bundled, and the launcher does not download dependencies. Reporting still requires its separately configured backend and is not supplied as a running service by this package.

## Usage and remaining device checks

Extract the whole package. Use StartExecFlow.cmd and keep its window open. Press Enter to stop. An approved portable node.exe may be placed in Runtime if installed Node is unavailable. Close the app before running CheckExecFlow.cmd. Use the same exact origin and browser profile for your real register. Export JSON backups to a separate safe folder.

The successful hosted Windows Server test does not certify every Windows 10/11 installation, managed RTA endpoint policy, browser profile or default-browser association. Verify the normal browser opens on your device; if it does not, copy the printed fixed URL manually. Real voice availability and audio were not validated. No guarantee of permanent browser-storage retention is claimed.
