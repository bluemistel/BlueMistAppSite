#!/usr/bin/env node
//
// このサイトは https://aomoya.com/apps/ へ統合した（2026-09-25）。
// GitHub Pages には移転案内のページだけを出力し、旧URLで来た人を新しいページへ自動で移動させる。
// アプリ一覧の更新は aomoya.site リポジトリの apps-publish.bat で行う。
//

import { writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const SITE      = join(root, '_site');
const NEW_URL   = 'https://aomoya.com/apps/';

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>移転しました | あおもやの作ったアプリまとめ</title>
  <link rel="canonical" href="${NEW_URL}">
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=${NEW_URL}">
  <link rel="icon" href="favicon.ico">
  <script>location.replace(${JSON.stringify(NEW_URL)});</script>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; color: #333; }
    a { color: #00A0B3; font-weight: bold; }
  </style>
</head>
<body>
  <p>このページは <a href="${NEW_URL}">${NEW_URL}</a> に移転しました。</p>
</body>
</html>
`;

mkdirSync(SITE, { recursive: true });
writeFileSync(join(SITE, 'index.html'), html);
// 旧サイト内の他のパスで来た場合も案内する
writeFileSync(join(SITE, '404.html'), html);
copyFileSync(join(root, 'src', 'favicon.ico'), join(SITE, 'favicon.ico'));

console.log(`Generated _site/ (redirect to ${NEW_URL})`);
