#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_JSON = join(__dirname, '..', 'data', 'apps.json');

const githubUrl = process.argv[2];
if (!githubUrl) {
  console.log('Usage: npm run add -- <github-url> [--booth <url>] [--web <url>] [--tags tag1,tag2]');
  console.log('Example: npm run add -- https://github.com/user/repo --tags tool,utility');
  process.exit(1);
}

const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
if (!match) {
  console.error('Error: Invalid GitHub URL');
  process.exit(1);
}

const [, owner, repo] = match;

function parseArgs(args) {
  const opts = { booth: '', web: '', tags: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--booth' && args[i + 1]) opts.booth = args[++i];
    if (args[i] === '--web' && args[i + 1]) opts.web = args[++i];
    if (args[i] === '--tags' && args[i + 1]) opts.tags = args[++i].split(',').map(t => t.trim());
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(3));

async function fetchRepoInfo(owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`Fetching info for ${owner}/${repo}...`);
  const info = await fetchRepoInfo(owner, repo);

  const apps = JSON.parse(readFileSync(APPS_JSON, 'utf-8'));

  if (apps.some(a => a.links.github === info.html_url)) {
    console.error('Error: This app is already in the list.');
    process.exit(1);
  }

  const newApp = {
    name: info.name,
    description: info.description || 'No description',
    thumbnail: `images/${repo}.png`,
    links: {
      github: info.html_url,
      booth: opts.booth,
      web: info.homepage || opts.web
    },
    tags: opts.tags.length > 0 ? opts.tags : (info.topics || []).slice(0, 5),
    addedAt: new Date().toISOString().slice(0, 10)
  };

  apps.push(newApp);
  writeFileSync(APPS_JSON, JSON.stringify(apps, null, 2) + '\n');

  console.log(`Added: ${newApp.name}`);
  console.log(`  Description: ${newApp.description}`);
  console.log(`  Tags: ${newApp.tags.join(', ') || '(none)'}`);
  console.log(`  Thumbnail: ${newApp.thumbnail} (place image manually)`);
  if (newApp.links.web) console.log(`  Web: ${newApp.links.web}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
