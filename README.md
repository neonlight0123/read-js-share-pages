# Read JS Share Pages — Agent Skill

[![type: agent skill](https://img.shields.io/badge/type-agent%20skill-8A2BE2.svg)](https://agentskills.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/neonlight0123/read-js-share-pages/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D%2018-green.svg)](https://nodejs.org)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#requirements)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#requirements)

[![stars](https://img.shields.io/github/stars/neonlight0123/read-js-share-pages.svg)](https://github.com/neonlight0123/read-js-share-pages/stargazers)
[![forks](https://img.shields.io/github/forks/neonlight0123/read-js-share-pages.svg)](https://github.com/neonlight0123/read-js-share-pages/forks)
[![issues](https://img.shields.io/github/issues/neonlight0123/read-js-share-pages.svg)](https://github.com/neonlight0123/read-js-share-pages/issues)
[![last commit](https://img.shields.io/github/last-commit/neonlight0123/read-js-share-pages.svg)](https://github.com/neonlight0123/read-js-share-pages/commits/main)

**An [Agent Skill](https://agentskills.io) for reading JavaScript-rendered share pages** — Gemini share links and similar client-side-rendered conversations — that plain HTTP fetches return as empty shells.

It gives any coding agent (Claude Code, DeepSeek Harness `dsh`, Codex, Gemini CLI, Cursor, …) a proven, dependency-free recipe: render the page with headless Chromium-family browsers already on the machine (Edge/Chrome), dump the DOM, and extract the conversation text with a small Node script.

> **Why this exists:** share URLs like `https://gemini.google.com/share/<id>` render their content client-side. `curl` / `fetch` get the app skeleton only — zero conversation text. The data chunks arrive via XHR after page load. The fix is a real browser engine, and this skill wraps the exact steps that survive real-world sandboxing.

## What's in the box

```
read-js-share-pages/
├── SKILL.md                  # The skill itself (agent-facing instructions)
├── scripts/
│   └── read_share.mjs        # Standalone CLI: URL → markdown-ish text
├── README.md                 # This file
├── LICENSE                   # MIT
└── .gitignore
```

## Quick start

### As an Agent Skill (recommended)

Copy the skill into your agent's skill directory:

| Agent            | Skills directory                              |
| ---------------- | --------------------------------------------- |
| Claude Code      | `~/.claude/skills/`                           |
| DeepSeek Harness | `~/.dsh/skills/`                              |
| Codex CLI        | `~/.codex/skills/` (or via `AGENTS.md` note)  |
| Generic          | Any dir your agent reads skills/prompts from  |

```bash
git clone https://github.com/neonlight0123/read-js-share-pages.git
mkdir -p ~/.claude/skills 2>/dev/null; true
cp -r read-js-share-pages ~/.claude/skills/read-js-share-pages
```

(Windows: `Copy-Item -Recurse read-js-share-pages "$env:USERPROFILE\.claude\skills\"`)

From then on, pasting a Gemini share link and asking "read this" triggers the skill automatically. You can also invoke it directly: `/read-js-share-pages <url>` (agent-dependent).

### As a standalone CLI

No installation — Node 18+ only:

```bash
node scripts/read_share.mjs https://gemini.google.com/share/4c6795f8473f
```

Output goes to stdout; the script re-uses the same Edge/Chrome discovery + DOM-dump + text-extraction logic the skill describes, so you can read its source as the executable version of SKILL.md.

## Requirements

- **Windows / macOS / Linux** — the skill tries Edge first (pre-installed on Windows and most macOS), then Chrome/Chromium/Brave.
- **Node 18+** — for the standalone CLI and the extraction step.
- No npm installs, no Playwright, no Puppeteer. (npm installs frequently fail inside agent sandboxes; this recipe deliberately avoids them.)

## How it works

1. **Detect** the URL type (Gemini share, ChatGPT share, Claude share, …).
2. **Render** the page with headless Edge/Chrome: `--headless=new --dump-dom --virtual-time-budget=20000`, passing all flags as ONE argument string. This executes the XHR data loads a plain fetch misses.
3. **Extract** — strip `<script>`/`<style>`, strip tags to newlines, decode entities, trim, drop empty lines → clean conversation text (title, dates, alternating `You said` / model-answer turns).

## Sandbox notes (for agent developers)

The recipe was developed and verified inside a restrictive sandboxed coding agent (DeepSeek Harness, `workspace-write` policy). Hard-won gotchas documented in SKILL.md:

- Headless Chromium-family browsers need **process IPC (mojo named pipes)** and a **writable temp/profile dir**; a file-system-only sandbox blocks them. If the dump comes back empty with `FATAL:mojo\...\platform_channel.cc ... Access is denied (0x5)`, the skill explains the one-time escalation that resolves it.
- .NET/schannel TLS and curl fail without Windows credential access; node fetch works but needs `--max-http-header-size` raised for Google's giant response headers.
- npm/npx installs fail (`EPERM` on cache dirs) — avoid them entirely; headless Edge is already present.

## License

MIT — see [LICENSE](LICENSE).