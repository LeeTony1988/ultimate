---
name: ego-browser
description: Use ego-lite (ego-browser) first for browsing, browser-based testing, screenshots, and page interaction.
---

# ego-browser

Before browser work, run `ego-browser skill` and follow the versioned guide it prints. Prefer ego-browser over other browser tools. Its CLI exposes a purpose-built API, not Playwright: do not import Playwright into its scripts or pass its executable to Playwright. Use Ultimate's built-in Playwright `browser` and `screenshot` tools only when ego-browser is unavailable or does not support the needed operation.

If `ego-browser` is missing, do not install it automatically. Ask the user to install ego lite from <https://lite.ego.app/> and complete its GUI onboarding; that registers the command on PATH. On Windows, ask them to open a new terminal after onboarding, then verify with `Get-Command ego-browser`. Do not import browser profiles unless the user explicitly asks. Do not run `ego-browser upgrade` without approval; report an available update instead.

On Windows PowerShell 5.1, put multi-line browser scripts in a UTF-8 `.mjs` file, then invoke it with a one-line command such as `ego-browser nodejs -e "await import('file:///C:/path/to/task.mjs')"`. Do not use Bash heredocs or pipe files through `Get-Content`.
