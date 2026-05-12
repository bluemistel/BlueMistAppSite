#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const APPS_JSON = join(root, 'data', 'apps.json');
const data      = readFileSync(APPS_JSON, 'utf-8');
const inlineTag = `<script>const APPS_DATA = ${data.trim()};</script>`;

// --- 1. ローカル開発用: dist/apps.js ---
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'apps.js'), `const APPS_DATA = ${data.trim()};\n`);
console.log('Generated dist/apps.js');

// --- 2. デプロイ用: _site/ にデータをインライン化した index.html を生成 ---
mkdirSync(join(root, '_site', 'images'), { recursive: true });

// index.html の <script src="dist/apps.js"> をインラインに置換
const html = readFileSync(join(root, 'index.html'), 'utf-8');
const deployHtml = html.replace('<script src="dist/apps.js"></script>', inlineTag);
writeFileSync(join(root, '_site', 'index.html'), deployHtml);

// favicon
copyFileSync(join(root, 'src', 'favicon.ico'), join(root, '_site', 'favicon.ico'));
// ローカルビルド用のルートfaviconも更新
copyFileSync(join(root, 'src', 'favicon.ico'), join(root, 'favicon.ico'));

// images
cpSync(join(root, 'images'), join(root, '_site', 'images'), { recursive: true });

console.log('Generated _site/ for deployment');
