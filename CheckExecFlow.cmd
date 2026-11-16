@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 exit /b 1
set "ExecFlowNode=%~dp0Runtime\node.exe"
if exist "%ExecFlowNode%" goto CheckExecFlow
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Use approved Node.js LTS 22 or newer.
  echo Or put an approved node.exe in the Runtime folder.
  pause
  exit /b 1
)
set "ExecFlowNode=node.exe"
:CheckExecFlow
echo Close any running ExecFlow launcher before this synthetic acceptance check.
echo This check does not use your browser profile or change your saved register.
"%ExecFlowNode%" "%~dp0scripts\VerifyWindowsLauncher.mjs"
set "ExecFlowCheckExitCode=%errorlevel%"
echo.
if "%ExecFlowCheckExitCode%"=="0" (
  echo Checks passed. Results: artifacts\local\WindowsAcceptance.json
) else (
  echo Checks did not complete successfully. Read the error above.
)
pause
exit /b %ExecFlowCheckExitCode%
