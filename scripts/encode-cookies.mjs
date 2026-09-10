#!/usr/bin/env node
/* global Buffer, console, process */
// Encode a YouTube cookies.txt export for the YTDLP_COOKIES Render env var.
//
// Usage:
//   node scripts/encode-cookies.mjs <path-to-cookies.txt>
//   npm run cookies:encode -- <path-to-cookies.txt>
//
// What it does:
//   1. Validates the file looks like a Netscape cookies.txt with YouTube
//      entries (warns instead of guessing when it doesn't).
//   2. Prints a single-line base64 of the file, which the API accepts
//      exactly like the raw file body (see cookiesContent() in
//      apps/api/src/providers/ytmusic/ytdlp.ts). Base64 survives Render
//      dashboard pastes that would mangle multi-line values.
//
// Privacy: the file is only read locally and printed to your own terminal.
// Never commit the output anywhere — treat it like a password.

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2).filter((a) => a !== '--');
const file = args[0];

if (!file || file === '-h' || file === '--help') {
  console.log('Usage: node scripts/encode-cookies.mjs <cookies.txt>');
  console.log('Export it first: "Get cookies.txt LOCALLY" extension on youtube.com (logged in).');
  process.exit(file ? 0 : 1);
}

let raw;
try {
  raw = await readFile(file, 'utf8');
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}

const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
const lines = text.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
const ytLines = lines.filter((l) => l.includes('.youtube.com') || l.includes('.google.com'));

if (ytLines.length === 0) {
  console.error(
    'No YouTube/Google cookie lines found. Make sure you exported cookies while on youtube.com and logged in, then try again.',
  );
  process.exit(1);
}

const looksNetscape = lines.length > 0 && lines.every((l) => l.split('\t').length >= 6);
if (!looksNetscape) {
  console.warn('Warning: lines do not look like Netscape TSV format — the API may reject this. Re-export as cookies.txt.');
}

const b64 = Buffer.from(text, 'utf8').toString('base64');
console.log(`OK: ${ytLines.length} YouTube/Google cookie lines found.`);
console.log('Render dashboard -> zabify-api -> Environment -> Add Environment Variable');
console.log('Key: YTDLP_COOKIES. Value: paste this single line, then Save (API redeploys):');
console.log(b64);
