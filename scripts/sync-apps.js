#!/usr/bin/env node
//
// GitHub のリポジトリ一覧から apps.json を同期する。
//
//   node scripts/sync-apps.js            新規リポジトリを追記 + サムネ差し替え検出
//   node scripts/sync-apps.js --dry-run  変更せず、何が起きるかだけ表示
//
// 方針:
//   - 既存エントリ（手で整えた名前・説明・タグ・サムネ）は絶対に上書きしない
//   - 未登録のリポジトリだけを追記する
//   - サムネ未作成のものは GitHub の OGP 画像を仮置きし、
//     後から images/<repo>.png などを置けば次回同期で自動的に差し替える
//

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root       = join(__dirname, '..');
const APPS_JSON  = join(root, 'data', 'apps.json');
const CONFIG     = join(root, 'data', 'sync-config.json');
const IMAGES_DIR = join(root, 'images');
const AUTO_DIR   = join(IMAGES_DIR, 'auto');

const DRY_RUN = process.argv.includes('--dry-run');

const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// ---------- helpers ----------

/** GitHub URL から "owner/repo"（小文字）を取り出す */
function repoKey(url) {
  const m = String(url || '').match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase().replace(/\.git$/, '') : null;
}

/**
 * images/ 内から <repo> 相当の手動サムネを探す。
 * 必ず readdir の実ファイル名を返す（Linux の GitHub Pages は大小文字を区別するため、
 * Windows 上で存在判定だけして名前を組み立てると 404 の原因になる）。
 */
function findManualThumb(repo) {
  if (!existsSync(IMAGES_DIR)) return null;
  const lower = repo.toLowerCase();
  const files = readdirSync(IMAGES_DIR)
    .filter(f => IMG_EXTS.includes(extname(f).toLowerCase()));

  for (const ext of IMG_EXTS) {
    const hit = files.find(f => f.toLowerCase() === lower + ext);
    if (hit) return `images/${hit}`;
  }
  // 接尾辞つき（KoeBako_2.png など）
  const hit = files.find(f => {
    const base = f.slice(0, f.length - extname(f).length).toLowerCase();
    return base.startsWith(lower + '_');
  });
  return hit ? `images/${hit}` : null;
}

/**
 * サムネが「大文字小文字まで一致して」実在するか検査する。
 *   { ok: true }                      … 問題なし
 *   { ok: false, missing: true }      … ファイルが無い
 *   { ok: false, correct: 'images/X' } … 名前は在るが大小文字が違う（Linux で 404 になる）
 */
function checkThumb(thumbnail) {
  if (!thumbnail) return { ok: false, missing: true };
  const parts = thumbnail.split('/');
  const base  = parts.pop();
  const dir   = join(root, ...parts);
  if (!existsSync(dir)) return { ok: false, missing: true };

  const files = readdirSync(dir);
  if (files.includes(base)) return { ok: true };

  const hit = files.find(f => f.toLowerCase() === base.toLowerCase());
  if (hit) return { ok: false, correct: [...parts, hit].join('/') };
  return { ok: false, missing: true };
}

/** GitHub topics を既存のタグ体系へ正規化する */
function normalizeTags(topics, cfg, dropped) {
  const map    = cfg.tagMap || {};
  const ignore = new Set((cfg.tagIgnore || []).map(t => t.toLowerCase()));
  const out    = [];
  for (const raw of topics || []) {
    const t = String(raw).toLowerCase();
    if (ignore.has(t)) { dropped.add(raw); continue; }
    if (map[t]) { if (!out.includes(map[t])) out.push(map[t]); continue; }
    if (cfg.keepUnmappedTags) { if (!out.includes(raw)) out.push(raw); }
    else dropped.add(raw);
  }
  return out.slice(0, 5);
}

async function ghJson(url) {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'MyAppSite-sync' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const hint = res.status === 403 ? '（APIレート制限の可能性。GITHUB_TOKEN を設定すると緩和されます）' : '';
    throw new Error(`GitHub API ${res.status} ${res.statusText} ${hint}\n  ${url}`);
  }
  return res.json();
}

/** GitHub の OGP 画像を仮サムネとして保存 */
async function downloadOgImage(owner, repo) {
  const url = `https://opengraph.githubassets.com/1/${owner}/${repo}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'MyAppSite-sync' } });
  if (!res.ok) return null;
  mkdirSync(AUTO_DIR, { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(AUTO_DIR, `${repo}.png`), buf);
  return `images/auto/${repo}.png`;
}

// ---------- main ----------

async function main() {
  const cfg  = JSON.parse(readFileSync(CONFIG, 'utf-8'));
  const apps = JSON.parse(readFileSync(APPS_JSON, 'utf-8'));

  const known  = new Map(apps.map(a => [repoKey(a.links?.github), a]).filter(([k]) => k));
  const ignore = new Set((cfg.ignore || []).map(s => s.toLowerCase()));

  console.log(`GitHub: ${cfg.owner} のリポジトリを取得中...`);
  const repos = await ghJson(
    `https://api.github.com/users/${cfg.owner}/repos?per_page=100&sort=pushed`
  );

  const candidates = repos.filter(r =>
    (cfg.includeForks    || !r.fork) &&
    (cfg.includeArchived || !r.archived) &&
    !ignore.has(r.name.toLowerCase())
  );

  const droppedTags = new Set();
  const added = [];
  const rethumbed = [];

  // --- 1. 未登録リポジトリを追記 ---
  for (const r of candidates) {
    if (known.has(r.full_name.toLowerCase())) continue;

    let thumbnail = findManualThumb(r.name);
    let auto = false;
    if (!thumbnail) {
      thumbnail = DRY_RUN ? `images/auto/${r.name}.png` : await downloadOgImage(cfg.owner, r.name);
      auto = true;
    }

    const entry = {
      name: r.name,
      description: r.description || '',
      thumbnail: thumbnail || `images/${r.name}.png`,
      links: {
        github: r.html_url,
        booth: '',
        web: r.homepage || ''
      },
      tags: normalizeTags(r.topics, cfg, droppedTags),
      addedAt: (r.created_at || new Date().toISOString()).slice(0, 10),
      ...(auto ? { thumbnailAuto: true } : {})
    };

    apps.push(entry);
    known.set(r.full_name.toLowerCase(), entry);
    added.push(entry);
  }

  // --- 2. 仮サムネ → 手動サムネへの差し替えを検出 ---
  for (const a of apps) {
    if (!a.thumbnailAuto) continue;
    const key = repoKey(a.links?.github);
    if (!key) continue;
    const repo = key.split('/')[1];
    const manual = findManualThumb(repo);
    if (manual && !manual.startsWith('images/auto/')) {
      a.thumbnail = manual;
      delete a.thumbnailAuto;
      rethumbed.push(a);
    }
  }

  // --- 3. 書き込み ---
  if (!DRY_RUN) {
    writeFileSync(APPS_JSON, JSON.stringify(apps, null, 2) + '\n');
  }

  // --- 4. レポート ---
  const line = '─'.repeat(58);
  console.log(`\n${line}`);
  console.log(`対象リポジトリ ${candidates.length} 件 / 登録済み ${apps.length} 件`);
  console.log(line);

  if (added.length) {
    console.log(`\n[新規追加] ${added.length} 件`);
    for (const a of added) {
      console.log(`  + ${a.name}`);
      console.log(`      説明: ${a.description || '(なし — 要記入)'}`);
      console.log(`      タグ: ${a.tags.join(', ') || '(なし — 要記入)'}`);
      console.log(`      サムネ: ${a.thumbnail}${a.thumbnailAuto ? ' (GitHub OGP 仮置き)' : ''}`);
    }
  } else {
    console.log('\n[新規追加] なし');
  }

  if (rethumbed.length) {
    console.log(`\n[サムネ差し替え] ${rethumbed.length} 件`);
    for (const a of rethumbed) console.log(`  * ${a.name} → ${a.thumbnail}`);
  }

  // 要対応リスト
  const todo = apps.filter(a =>
    a.thumbnailAuto || !checkThumb(a.thumbnail).ok || !a.description || !a.tags?.length
  );
  if (todo.length) {
    console.log(`\n[要対応] ${todo.length} 件`);
    for (const a of todo) {
      const issues = [];
      if (a.thumbnailAuto)            issues.push('サムネ仮置き');
      const tc = checkThumb(a.thumbnail);
      if (!tc.ok && tc.missing)  issues.push(`画像なし(${a.thumbnail})`);
      if (!tc.ok && tc.correct)  issues.push(`大小文字不一致: ${a.thumbnail} → ${tc.correct} が正しい`);
      if (!a.description)             issues.push('説明なし');
      if (!a.tags?.length)            issues.push('タグなし');
      console.log(`  - ${a.name}: ${issues.join(' / ')}`);
    }
    console.log(`\n  ヒント: images/<リポジトリ名>.png を置いて再同期すると仮サムネを自動で差し替えます。`);
  } else {
    console.log('\n[要対応] なし');
  }

  if (droppedTags.size) {
    console.log(`
[未採用のtopics] ${droppedTags.size} 件 — 採用したいものは data/sync-config.json の tagMap に追加してください`);
    console.log('  ' + [...droppedTags].join(', '));
  }

  console.log(`\n${DRY_RUN ? '(--dry-run のため apps.json は変更していません)' : 'apps.json を更新しました。'}`);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
