# Voice, Microsoft 365 and automation

Author: Ahmed Zaian. 9 November 2026.

## Start and connect

Start the updated StartExecFlow.cmd package, then use **Connect local runtime** in the commitment view. Use the pairing code shown in the local console. Automatic browser opening passes it through a URL fragment, which is removed immediately and cached only in that tab session. It is never included in register backups or localStorage. Pairing changes on each server restart. The service does not reveal a session token to an unpaired client.

Only an explicitly connected register is monitored. Reviewed saves synchronise to an atomic local service snapshot; browser storage remains a cache. If service/browser copies differ, download the service register and reconcile through the existing reviewed restore flow before connecting. The service rejects stale revisions instead of silently overwriting another session.

Local state is under `%LOCALAPPDATA%\ExecFlowData\State.json` on Windows, or `~/ExecFlowData/State.json` when LOCALAPPDATA is absent. EXECFLOW_DATA_DIR can select another local folder. State.previous.json is the previous snapshot. Files contain plaintext commitments, local model paths, automation policy and deduplication history. They are not encrypted backups. Keep independent register JSON backups and securely back up the complete service directory for automation-history recovery. Microsoft access/refresh tokens are never written there or included in exported register files. Corrupt state stops startup without overwriting the original.

## Offline voice and understanding

1. Obtain an approved whisper.cpp build and multilingual model. Select the local whisper-cli.exe and model file under Local voice and interpretation setup. English-only `.en` models are unsuitable for Arabic.
2. Install and verify an approved Ollama model on the same device. Enter its exact local model name. The endpoint is fixed to 127.0.0.1:11434; cloud-marked names, remote URLs and network file paths are rejected. Independently disable Ollama cloud forwarding and verify its outbound network policy. Loopback alone cannot prove another process stays offline.
3. Confirm the files and offline model settings, then save. The package does not download, execute setup installers or bundle models automatically. Alternatively set EXECFLOW_WHISPER_EXE, EXECFLOW_WHISPER_MODEL and EXECFLOW_LOCAL_MODEL before starting the launcher.
4. Upload audio or record with explicit microphone permission. Browser decoding/resampling happens locally. The service accepts bounded mono 16 kHz PCM16 WAV, up to five minutes and 10 MB; capture stops slightly before five minutes. Temporary audio and transcript files are deleted after the local CLI finishes or fails.
5. Review/edit the machine transcript against the recording. Prepare proposals, compare them with the original excerpt, and use Extract for review and the existing consent checkbox. Nothing is committed automatically. Owners not found in the source are removed; relative/ambiguous or non-explicit dates remain unknown. This is an assisted extraction workflow, not a guarantee of semantic or acoustic accuracy.

Records retain the reviewed labelled extraction and the original excerpt/reference as optional source metadata. Existing version-1 register backups remain supported. The weekly brief retains original excerpts for these records. A source excerpt is limited to 2,000 characters; truncated emails must be checked against the full original or replaced with the relevant excerpt before interpretation.

## Microsoft Entra registration and sign-in

Use an organisation-approved **public client** Entra app registration. No client secret is required or requested. The organisation must permit device-code flow and delegated access for this app. Obtain the Application (client) ID and Directory (tenant) ID from the approved registration; tenant `organizations` is also supported. Do not paste access tokens or passwords into this app.

Microsoft mail/calendar access requires internet and organisation consent; the local register and locally configured voice do not require Microsoft connectivity.

Read-only sign-in requests User.Read, Mail.Read, Calendars.Read and offline_access. Checking the additional-consent option requests Calendars.ReadWrite and Mail.Send as well. Tenant policy may require administrator approval. Sign-in starts only on the explicit button; open the returned Microsoft verification page, enter the shown code, finish consent/MFA, then Check sign-in. Tokens remain in Node process memory; refresh can continue only during that process lifetime. Disconnect aborts in-flight Graph requests and clears the session. Restarting the launcher requires sign-in again.

Read recent mail shows ten messages; calendar reading covers the next seven days. Selecting a source retrieves its subject and body as plain text and retains its source link. Imported content is untrusted data, not executable instructions. A separate local model prepares proposals for human review. No message is marked read, moved, replied to or deleted by these reads.

Choose a saved dated record and explicitly confirm an all-day calendar event before creation. Event boundaries use Dubai's Arabian Standard Time and an exclusive next-day end. A deterministic transactionId helps prevent duplicate creates on retry. No attendees or invitations are added.

## Automatic reminders and escalation

Choose overdue-day thresholds and exact recipient addresses. Defaults are disabled, one overdue day for reminders and three for escalation. Due today is not overdue. Enable monitoring; separately enable email submission and approve the recipients/thresholds if desired. No addresses are guessed from owner names. Email automation must be approved after sign-in and is bound to that verified Microsoft account ID; switching accounts blocks submission until the policy is explicitly approved again. Calendar confirmation is also checked against the expected signed-in account.

The local worker scans every 30 seconds while the launcher process runs, including after the browser closes. Browser desktop alerts require explicit notification permission and an open connected browser view; existing history is not re-notified on activation. Local alert/event history persists even without email consent. Automatic email stays pending without a Microsoft session with Mail.Send.

Reminders are emitted once per overdue day before escalation; escalation is emitted once per record/due date. Closed or changed-due records cancel pending submissions. The worker persists an attempting checkpoint before contacting Graph. A successful 202 response means **accepted for processing**, not confirmed delivery. Ambiguous errors or a process restart during submission produce **uncertain** status and are never retried automatically. Check Outlook before any manual resend. There is no delivery-receipt proof, historical approval workflow, automatic retry of ambiguous sends or owner-recipient inference.

The event display retains 500 entries, with a separate bounded 20,000-ID deduplication history. Capacity exhaustion stops new generation with an error instead of discarding deduplication guarantees. Deleting/restoring service history can invalidate prior deduplication. JSON register export alone does not back up policy/events.

## Actual acceptance and open operational gates

Automated tests use synthetic Graph responses, local-model replies and speech-runner fixtures. They test real HTTP session/origin boundaries, review gates, original-source preservation, atomic disk sync, calendar confirmation, automation approval, background scanning, restart deduplication, ambiguous-send suppression, and disconnect/refresh races. They do not prove live Microsoft tenant consent, actual mailbox/calendar writes, real email delivery, a user's microphone or all Arabic dialects.

A real local whisper.cpp multilingual tiny-model English speech test was executed separately in the development environment against the upstream JFK sample. That is a limited acoustic smoke test, not a production accuracy benchmark. Real Arabic acoustic acceptance and actual user-device/model validation remain required. No user mailbox, calendar or real recipients were used during development.

References:
- https://github.com/ggml-org/whisper.cpp
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0

The Microsoft app registration and operator sign-in are operational prerequisites. The ChatGPT Outlook connection is separate and is not silently transferred into this desktop application.


## Verbatim extraction and bounded local inference

Version 0.3.1 uses a JSON schema, Arabic/English extraction instructions and examples. It limits inference to two CPU threads, 4,096 context tokens and 1,024 generated tokens. These are bounded defaults, not universal performance guarantees. Task text must be copied verbatim from the source; paraphrased wording is rejected because a changed verb can reverse meaning. A valid empty result clears old proposals and reports that no adopted commitment was found. Human review remains mandatory. A schema and source-substring check do not prove semantic correctness or defeat every prompt injection.

## Independent backup and recovery

Connect an approved external drive and create a backup folder there. Run BackupExecFlow.cmd and enter that existing folder, or pass it as the command argument. The tool refuses a nested or same-volume destination and never overwrites the live register. It copies the atomic State.json snapshot, exports Register.json, writes SHA256 checksums, and verifies both integrity and runtime acceptance. Policies/events are included in State.json; Microsoft tokens are not. The full snapshot is plaintext, so keep the external drive secure. Volume separation is a technical check, not proof of independent hardware, encryption or protection from device loss.

Verify again before recovery:

```text
node scripts/BackupService.mjs verify "APP FOLDER" "BACKUP FOLDER"
```

Use Register.json through the existing preview/confirm restore workflow for register-only recovery. Restoring complete State.json is an operator task with the service stopped: preserve the current file, disconnect mail, review policies/pending events and deduplication history before re-enabling email. An old snapshot can reintroduce events from before the backup; do not replace state blindly or automatically resend uncertain mail. No automatic restore or retention deletion is installed.

The automation worker still requires the local process to run. Closing the browser does not stop it; stopping the launcher, sleeping or turning off Windows does. Reopening requires Microsoft sign-in again. This update does not silently install an unattended service, save OAuth tokens, or claim a backup was created on the user's external drive.

## Source-local review safeguards (0.3.2)

Transcripts report truncation at 2,000 characters and the view displays the existing source warning. A known English-only `.en` model filename is rejected before Arabic execution, including common quantized filenames. Renamed files still need engine verification.

The local interpretation bridge checks exact task wording, whole-name boundaries, valid explicit dates, and sentence-local field evidence. It removes a proposed owner/date found only in another sentence, with a visible incomplete-extraction warning. A following sentence containing only an explicit owner label is allowed. Dates in a following sentence remain unknown, even if a human could establish their relationship. Repeated task excerpts cannot borrow fields; cross-sentence task excerpts are rejected. Explicit supported negation/cancellation forms are checked for every occurrence.

Invalid proposals are rejected independently: valid siblings remain available for review, accompanied by a warning and rejected count. If every proposed record is rejected, the request errors rather than claiming that the source has no commitment. A genuine empty model result remains supported. Instructions explicitly retain required tasks without an assigned owner and provide an English decision example to reduce example-language contamination. No deterministic fallback invents a missing task.

Sentence-local and lexical checks are conservative, incomplete aids. They do not prove that two activities in one sentence have the correct owner/date, resolve indirect negation or quotations, or guarantee prompt-injection resistance. Human comparison with the original remains mandatory. These changes do not enable automatic saving or sending.

### Read-only Windows voice checks

From the extracted package folder, with approved Node.js 22+ and local model files:

```text
node scripts/CheckVoiceRuntime.mjs "C:\Models\whisper-cli.exe" "C:\Models\ggml-small.bin" "qwen3:4b-instruct"
node scripts/RunVoiceAcceptance.mjs "." "Voice Acceptance Results.json"
```

The first script checks local paths and the exact installed Ollama tag and reports suggested settings without applying them. It does not prove binary authenticity or offline enforcement. The second calls VoiceBridge directly on 30 development cases plus 18 predeclared additional text cases and stores actual responses. It exits with a nonzero code on any failed case. Neither script starts LocalLauncher, Graph sign-in, an automation worker or a mail/calendar write. No model download is performed. The inference runner requires a separately started approved local Ollama server.

Suggested initial 16 GB settings remain: multilingual whisper small, `qwen3:4b-instruct` Q4_K_M, two threads, 4,096 context tokens, 1,024 generated tokens, one concurrent model, cloud features disabled. Start with 30–60 second recordings; the five-minute input limit does not guarantee completion within the 180-second CLI timeout. Do not treat model file size as total RAM usage. Actual Windows RAM, microphone and dialect acceptance remain open.

The approved offline trial profile now requests `keep_alive: 0` on ExecFlow interpretation calls so Ollama can unload that model after each response. This can increase the next request's cold-start latency; neither the flag nor a unit test proves actual memory release. An explicitly selected lighter profile may set `EXECFLOW_LOCAL_THINK=false`; the bridge first requires the installed server/model to advertise boolean false support through `/api/show`. Otherwise it stops before extraction rather than guessing compatibility. The 48-case runner records the request profile and retains its original strict scoring, including failures for guard rejections.

See **Offline Voice Trial.md** for the Windows settings preview/apply/restore commands, the unchanged existing text tests and the 18-recording acoustic plan. The settings script never runs from StartExecFlow or the preflight automatically. It does not stop Ollama, download models, sign into Microsoft or change firewall rules. Windows laptop measurements remain NOT_RUN until evidence is collected on that device.
