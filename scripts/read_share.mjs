#!/usr/bin/env node
/**
 * read_share.mjs — Read a JS-rendered share page (e.g. https://gemini.google.com/share/<id>)
 * and print the conversation as plain text.
 *
 * Why: these pages render client-side; a plain HTTP fetch returns only the app shell.
 * This script renders the page with a headless Chromium-family browser (Edge first,
 * then Chrome/Chromium/Brave — no npm installs) and extracts the text.
 *
 * Usage:
 *   node read_share.mjs <url> [outfile]
 *
 * Exit codes: 0 ok, 1 usage error, 2 no browser found, 3 browser failed, 4 empty output.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const VIRTUAL_TIME_BUDGET = parseInt(process.env.READ_SHARE_BUDGET || '20000', 10);

/** Candidate Chromium-family browsers, in discovery order. */
function candidates() {
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const lad = process.env['LOCALAPPDATA'] || '';
    return [
      join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(lad, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(lad, 'Chromium', 'Application', 'chrome.exe'),
      join(lad, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
  }
  // linux: rely on PATH lookup for well-known names
  return ['microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser'];
}

async function firstExistingBrowser() {
  for (const c of candidates()) {
    if (c.includes('\\') || c.startsWith('/')) {
      if (existsSync(c)) return c;
    } else {
      try {
        await execFileP(c, ['--version'], { timeout: 10000 });
        return c;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

/** Launch the browser directly (no shell); node quotes each argv element for Windows. */
function dumpDom(browser, url, profileDir, stdoutFile, stderrFile) {
  return new Promise((resolve, reject) => {
    const argv = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crashpad',
      '--dump-dom', `--virtual-time-budget=${VIRTUAL_TIME_BUDGET}`,
      `--user-data-dir=${profileDir}`, url,
    ];
    const child = spawn(browser, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      writeFileSync(stdoutFile, Buffer.concat(out));
      writeFileSync(stderrFile, Buffer.concat(err));
      code === 0 ? resolve() : reject(new Error(`browser exited ${code}; stderr tail: ${Buffer.concat(err).toString().slice(-400)}`));
    });
  });
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…' };

export function extractText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, '\n');
  for (const [ent, ch] of Object.entries(ENTITIES)) t = t.split(ent).join(ch);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return t
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1)
    .join('\n');
}

async function main() {
  const [url, outArg] = process.argv.slice(2);
  if (!url || !/^https?:\/\//i.test(url)) {
    console.error('Usage: node read_share.mjs <https-url> [outfile]');
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'read-share-'));
  const domFile = join(tmp, 'dom.html');
  const errFile = join(tmp, 'err.txt');

  try {
    const browser = await firstExistingBrowser();
    if (!browser) {
      console.error('No Chromium-family browser found (looked for Edge, Chrome, Chromium, Brave).');
      process.exit(2);
    }
    const profile = join(tmp, 'profile');
    await dumpDom(browser, url, profile, domFile, errFile);

    const html = readFileSync(domFile, 'utf8');
    if (html.length < 5000) {
      console.error(`Browser returned only ${html.length} bytes — page may have failed to load. stderr tail:\n` + readFileSync(errFile, 'utf8').slice(-500));
      process.exit(4);
    }
    const text = extractText(html);
    if (!text) {
      console.error('Extraction produced no text.');
      process.exit(4);
    }
    if (outArg) writeFileSync(outArg, text);
    else process.stdout.write(text + '\n');
  } finally {
    // Best-effort cleanup: Edge's lingering child processes (crashpad, GPU) may still
    // hold handles, so a locked dir must not fail the run.
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {}
  }
}

// Run when executed directly; the path comparison is defensive (drive-letter casing,
// URL-encoding) but the argv fallback guarantees the CLI always runs.
const invoked = process.argv[1] && /read_share\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || invoked) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(3);
  });
}