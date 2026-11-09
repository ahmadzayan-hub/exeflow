@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 exit /b 1
set "ExecFlowNode=%~dp0Runtime\node.exe"
if exist "%ExecFlowNode%" goto Backup
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Approved Node.js LTS 22 or newer is required.
  pause
  exit /b 1
)
set "ExecFlowNode=node.exe"
:Backup
set "ExecFlowData=%EXECFLOW_DATA_DIR%"
if defined ExecFlowData goto Destination
set "ExecFlowData=%LOCALAPPDATA%\ExecFlowData"
:Destination
set "ExecFlowBackup=%~1"
if not defined ExecFlowBackup set /p "ExecFlowBackup=Existing folder on an independent external drive: "
if not defined ExecFlowBackup exit /b 1
"%ExecFlowNode%" "%~dp0scripts\BackupService.mjs" create "%~dp0." "%ExecFlowData%" "%ExecFlowBackup%"
set "ExecFlowResult=%errorlevel%"
if not "%ExecFlowResult%"=="0" echo Backup failed. Original service data was preserved.
pause
exit /b %ExecFlowResult%
