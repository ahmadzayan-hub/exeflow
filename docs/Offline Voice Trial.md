# ExecFlow offline voice trial

Author: Ahmed Zaian. 10 November 2026.

Status: development preparation; Windows laptop, actual models and new recordings NOT_RUN. No production approval. This package does not bundle or download Node, whisper.cpp, Ollama or model weights.

## Profiles and preserved limits

| Profile | Speech | Understanding | Initial recording |
| --- | --- | --- | --- |
| Initial | Multilingual ggml-small.bin | Exact installed qwen3:4b-instruct, Q4_K_M | 30 seconds |
| Arabic quality comparison | Exact large-v3-turbo file with its hash recorded | Same 4B model | 20 to 30 seconds |
| Lower memory | Multilingual small | Exact installed qwen3:1.7b, Q4_K_M | 30 seconds |

The bridge retains two CPU threads, 4096 context tokens, 1024 output tokens, temperature zero, the original extraction instructions and human review. Transcription still has a 180-second timeout; interpretation has a 120-second timeout. The five-minute input cap is not a completion guarantee. A transcript beyond 2000 characters is truncated with a visible warning and requires review against the original.

Every interpretation request now includes keep_alive:0. This asks Ollama to unload its model after the response; observe actual process memory to verify it. Cold-start time may increase. OLLAMA_MAX_LOADED_MODELS applies to Ollama, not whisper.cpp or LM Studio. Do not add memory claims from file sizes or count a shared GPU's memory as independent RAM.

## Apply the approved Windows server profile

These are user environment settings for the shared Ollama server, so Hermes also observes them if it uses that server. Close idle Ollama normally and reopen it after applying the profile. No running process is stopped by this package.

Preview without changing settings:

```powershell
powershell.exe -NoProfile -File .\scripts\ConfigureOfflineVoice.ps1
```

Apply the four approved values, saving their previous user values first:

```powershell
powershell.exe -NoProfile -File .\scripts\ConfigureOfflineVoice.ps1 -Apply
```

Alternatively double-click ConfigureOfflineVoice.cmd. The values are OLLAMA_HOST=127.0.0.1:11434, OLLAMA_NO_CLOUD=1, OLLAMA_NUM_PARALLEL=1, OLLAMA_MAX_LOADED_MODELS=1. No global keep-alive value is changed. Restart Ollama normally and open a fresh terminal. Verify its cloud-disabled log. The saved user values do not prove which values a running server inherited.

Rollback, after stopping idle Ollama normally:

```powershell
powershell.exe -NoProfile -File .\scripts\ConfigureOfflineVoice.ps1 -Restore
```

The backup is in %LOCALAPPDATA%\ExecFlowVoiceTrial. It contains only these four prior values. Restore refuses if any current user value differs from the applied profile; review such external changes manually. If organisational execution policy prevents running the script, use the approved Windows environment-settings interface; this package does not bypass policy.

## Reuse PR 11's 48 text cases

Use an approved Node 22+ and local whisper.cpp/model files. Substitute the real local paths and exact installed tag. First run the read-only preflight:

```powershell
node scripts/CheckVoiceRuntime.mjs "C:\Models\whisper-cli.exe" "C:\Models\ggml-small.bin" "qwen3:4b-instruct"
$env:EXECFLOW_LOCAL_MODEL = 'qwen3:4b-instruct'
Remove-Item Env:EXECFLOW_LOCAL_THINK -ErrorAction SilentlyContinue
node scripts/RunVoiceAcceptance.mjs "." "Windows Voice Meaning Results.json"
```

The existing 48 cases are unchanged: 16 Egyptian, 16 Gulf, 16 British. Run them once on the final Windows profile, then repeat only failures or affected cases after another change. No launcher, worker, Microsoft sign-in or mail/calendar write is started by these two Node scripts. The initial /api/tags response and source hashes remain in the results; the request profile is now recorded too. Record the Ollama/whisper.cpp versions and model file SHA256 alongside them.

The runner's strict score remains unchanged: errors fail, including safe guard rejections. Report negative-source guard rejections separately after comparing the saved response with its source. Do not silently turn them into passing extractions. Retain false-positive, missing-task, owner and date results independently.

For the lighter profile, first set the exact local tag and explicit thinking request, then repeat preflight with that tag:

```powershell
$env:EXECFLOW_LOCAL_MODEL = 'qwen3:1.7b'
$env:EXECFLOW_LOCAL_THINK = 'false'
node scripts/CheckVoiceRuntime.mjs "C:\Models\whisper-cli.exe" "C:\Models\ggml-small.bin" "qwen3:1.7b"
```

Proceed only when preflight passes. It checks /api/show for thinking.values containing boolean false; older servers lacking this metadata remain unverified. VoiceBridge repeats this check before any explicitly non-thinking extraction. Do not automatically upgrade the server or substitute a different model. If supported, run the existing acceptance runner with a different results filename, then start ExecFlow from this same terminal only when ready for reviewed microphone testing.

## Limited new acoustic acceptance

Record spontaneous speech on the Windows laptop's normal microphone. Use two speakers per language variety where practical. Do not read the existing text cases aloud and call that spontaneous acceptance. Keep recordings local and create a manually checked verbatim reference and expected task/owner/date labels before inspecting the model output.

| Recording IDs | Variety | Scenario | Status |
| --- | --- | --- | --- |
| AudioEgyptian01, AudioGulf01, AudioBritish01 | Egyptian, Gulf, British | Adopted task with owner and explicit date | NOT_RECORDED |
| AudioEgyptian02, AudioGulf02, AudioBritish02 | Egyptian, Gulf, British | Required task without assigned owner | NOT_RECORDED |
| AudioEgyptian03, AudioGulf03, AudioBritish03 | Egyptian, Gulf, British | Unadopted suggestion | NOT_RECORDED |
| AudioEgyptian04, AudioGulf04, AudioBritish04 | Egyptian, Gulf, British | Negation or cancellation with a valid sibling task | NOT_RECORDED |
| AudioEgyptian05, AudioGulf05, AudioBritish05 | Egyptian, Gulf, British | Multiple tasks, numbers and ambiguous relative dates | NOT_RECORDED |
| AudioEgyptian06, AudioGulf06, AudioBritish06 | Egyptian, Gulf, British | Rail/business terms, Arabic-English mixing where natural and room noise | NOT_RECORDED |

These are 18 new audio records, not the already existing synthetic text cases with similar IDs. Use 20 to 40 seconds each; keep Turbo's first comparisons to 30 seconds. Test both speech models on the same files sequentially with other inference idle. Do not reuse Linux concurrent timings as the Windows baseline. A quantized Turbo is a new model variant and needs its own acoustic comparison before inheriting any accuracy claim.

Measure normalized WER per variety and all critical errors in names, numbers, dates and negation. First test Qwen on the corrected reference to isolate understanding, then on the actual automatic transcript to measure the full chain. Keep manually reviewed results separate from the uncorrected pipeline. Proposed pilot conditions: zero accepted negated/unadopted tasks and zero invented owner/date; report missing valid tasks separately. Eighteen records cannot establish general dialect accuracy or production readiness.

## Windows performance and offline evidence

Capture total/free RAM and peak process working set for whisper-cli and the Ollama runner separately, including any GPU/shared-memory allocation. Check for sustained paging. Aim initially to leave 3 to 4 GB available as a planning margin, not a measured model requirement. Record cold and warm elapsed time, transcription RTF and the complete audio-to-proposal time, plus timeout/failure counts. Verify that memory actually falls after the model unload request.

After approved dependencies and weights are present, disconnect the network, restart the applications and process a new recording. Inspect attempted outbound connections as well as successful output. Loopback configuration and a cloud-disabled flag alone do not prove offline isolation. Record this as a separate manual acceptance item; do not report it passed from unit tests.

Local speech, interpretation and the register are the offline scope. Microsoft mail/calendar and email escalation require internet and their existing consent. Keep operational sending disabled during this trial. No benchmark, actual laptop memory measurement or dialect result is supplied by the settings script or the software tests.

## Existing evidence retained

PR 11 reports small WER 24.24% and Turbo WER 10.23% on 12 read FLEURS ar_eg files. Observed Linux RTF was 0.89 and 2.91 with concurrent inference. The earlier Qwen 4B run passed 41/48 text cases. The final guard's six real checks scored 3/6 strictly, with three safe rejections. These are previous development results, not measurements of this updated Windows trial profile.

References: https://github.com/ahmadzayan-hub/exeflow/pull/11 ; https://docs.ollama.com/faq ; https://docs.ollama.com/capabilities/thinking ; https://github.com/ggml-org/whisper.cpp
