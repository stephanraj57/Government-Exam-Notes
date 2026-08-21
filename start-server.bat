@echo off
title Govt Exam Notes - Server
echo Starting Govt Exam Notes Server...

where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.js
    goto end
)

if exist "C:\Users\steph\AppData\Local\OpenAI\Codex\runtimes\cua_node\ebe20bea09b80502\bin\node.exe" (
    "C:\Users\steph\AppData\Local\OpenAI\Codex\runtimes\cua_node\ebe20bea09b80502\bin\node.exe" server.js
    goto end
)

echo [Error] Node.js is not found in PATH.
echo Please install Node.js from https://nodejs.org or run directly in your browser.
pause

:end
