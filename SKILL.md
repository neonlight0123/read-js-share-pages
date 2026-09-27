---
name: read-js-share-pages
description: Read JS-rendered share pages (e.g. gemini.google.com/share links, and similar client-side-rendered share/chat pages) by rendering with headless Edge/Chrome and extracting the conversation text. Use when a pasted share URL returns empty content from plain fetch, or when asked to read a Gemini share link.
license: MIT
---

# Reading JS-rendered share pages (Gemini share links and similar)

## When to use

A URL like `https://gemini.google.com/share/<id>` (or other JavaScript-rendered share/chat page) is pasted and its content needs to be read. A plain `web_fetch` returns an empty shell: Gemini share pages render their conversation client-side, so the raw HTML contains only the app skeleton (the `AF_initDataCallback` data chunks arrive via XHR after page load).

## Fast path — use the bundled script

This skill directory contains `scripts/read_share.mjs`, a standalone Node 18+ CLI that implements the full recipe below (browser discovery, DOM dump, text extraction). Prefer it:

```bash
node <skill-dir>/scripts/read_share.mjs "https://gemini.google.com/share/<id>"
```

It prints the conversation (title, dates, alternating `You said` / model-answer turns) to stdout. Use it when no sandbox escalation is needed; follow the manual recipe when the script's browser launch is blocked (Step 2b).

If the script is missing, do the manual recipe.

## The recipe (proven end-to-end 2026-09)

Plain fetches (web_fetch, PowerShell Invoke-WebRequest, curl.exe, node fetch) get the shell only. You must render the page with a real browser. Headless Edge works and needs no install.

### Step 1 — Dump the rendered DOM

Run headless Edge (or Chrome) with `--dump-dom`.

Under a restrictive agent sandbox this FAILS (Edge's internal named-pipe IPC / mojo channels and temp crashpad dir are denied — symptoms: empty output, `FATAL:mojo\...\platform_channel.cc` / `Access is denied (0x5)` in stderr). Escalate this exact command once with your sandbox's wider mode and a justification naming the IPC denial; under DSH use `sandbox_permissions: danger-full-access`:

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"  # or C:\Program Files\...; macOS: /Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge
$prof = "$env:LOCALAPPDATA\dsh-edge-headless"                           # writable profile dir
$out  = "<workspace>\.tmp-share\dom.html"
$args = '--headless=new --disable-gpu --no-sandbox --disable-crashpad --dump-dom --virtual-time-budget=20000 "--user-data-dir=' + $prof + '" "<URL>"'
Start-Process -FilePath $edge -ArgumentList $args -RedirectStandardOutput $out -RedirectStandardError "<workspace>\.tmp-share\err.txt" -Wait -PassThru
```

Notes:
- Pass ALL flags as ONE quoted argument string; splitting them into an array makes Edge treat the URL as an extra target ("Multiple targets are not supported in headless mode").
- `--virtual-time-budget=20000` gives the SPA time to fetch its data chunks; raise it if content is missing.
- Keep the profile dir and all intermediate files OUT of OneDrive-synced or sandbox-denied paths.
- Output lands in `$out` (redirected stdout), typically ~1 MB+ for a real conversation.

### Step 2 — Extract the conversation text

Write a small node script (inline `node -e` quoting breaks on Windows; use a `.mjs` file):

1. Strip `<script>` and `<style>` blocks.
2. Strip remaining tags (replace with newlines), decode basic entities (`&nbsp; &amp; &lt; &gt; &quot; &#39;`).
3. Split on newlines, trim, drop lines of length ≤ 1.
4. Save and read the text.

The result contains the share title, dates, and alternating `You said` / model-answer turns in order.

### Step 3 — Clean up

Delete the `.tmp-share` workspace directory when done.

## Gotchas discovered

- Under the DSH sandbox: .NET/schannel TLS fails (`SEC_E_NO_CREDENTIALS`) for Invoke-WebRequest and curl.exe; node's `fetch` works but undici throws `HeadersOverflowError (UND_ERR_HEADERS_OVERFLOW)` on Google's giant response headers — if you ever plain-fetch google.com pages from node, set `$env:NODE_OPTIONS='--max-http-header-size=1048576'` first (the per-request `maxHeaderSize` fetch option does NOT fix it).
- npm/npx installs fail under the sandbox (`EPERM` on npm cache) — do not try to install Playwright/Puppeteer; headless Edge is already present on Windows and most macOS machines.
- Sandbox file reads/writes outside the workspace are denied (including `$env:TEMP`) — keep all intermediate files inside the session workspace.
- Chrome-family alternative paths, in discovery order: Edge (stable paths above), then `%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`, `%LocalAppData%\Google\Chrome\Application\chrome.exe`, `chromium`, `brave`. Same flags work for all.