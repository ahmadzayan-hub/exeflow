@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 (
  echo Cannot open the ExecFlow folder. Extract the package to a local folder first.
  pause
  exit /b 1
)
set "ExecFlowNode=%~dp0Runtime\node.exe"
if exist "%ExecFlowNode%" goto RunExecFlow
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install an approved Node.js LTS version 22 or newer.
  echo Or place an approved portable node.exe in this package's Runtime folder.
  echo Then close this window and double-click StartExecFlow.cmd again.
  echo No dependency will be downloaded automatically.
  pause
  exit /b 1
)
set "ExecFlowNode=node.exe"
:RunExecFlow
"%ExecFlowNode%" "%~dp0scripts\LocalLauncher.mjs"
set "ExecFlowExitCode=%errorlevel%"
if not "%ExecFlowExitCode%"=="0" (
  echo.
  echo ExecFlow did not start successfully. Read the message above.
  pause
)
exit /b %ExecFlowExitCode%
