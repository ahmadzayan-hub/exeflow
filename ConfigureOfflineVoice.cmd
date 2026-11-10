@echo off
setlocal
powershell.exe -NoProfile -File "%~dp0scripts\ConfigureOfflineVoice.ps1" -Apply
set "ExecFlowVoiceExitCode=%errorlevel%"
echo.
echo Read the result above. Reopen idle Ollama normally and open a new terminal before testing.
echo No model is downloaded and no running process is stopped.
pause
exit /b %ExecFlowVoiceExitCode%
