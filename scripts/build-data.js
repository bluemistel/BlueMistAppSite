#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_JSON = join(__dirname, '..', 'data', 'apps.json');
const OUTPUT = join(__dirname, '..', 'dist', 'apps.js');

mkdirSync(join(__dirname, '..', 'dist'), { recursive: true });

const data = readFileSync(APPS_JSON, 'utf-8');
writeFileSync(OUTPUT, `const APPS_DATA = ${data.trim()};\n`);

console.log('Generated dist/apps.js');
