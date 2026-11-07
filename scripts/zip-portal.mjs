// Архив для площадки (node scripts/zip-portal.mjs yandex|vk|crazygames): index.html в корне,
// имена файлов латиницей без пробелов (Яндекс, 1.22), не больше 1 500 файлов (CrazyGames)
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2] ?? 'yandex';
const dir = `dist-${name}`;
const zip = `gorod-dela-${name}.zip`;
let total = 0;
let files = 0;
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (!/^[A-Za-z0-9._-]+$/.test(f)) throw new Error(`Имя файла не подходит для Яндекс Игр: ${p}`);
    if (statSync(p).isDirectory()) walk(p);
    else {
      total += statSync(p).size;
      files += 1;
    }
  }
};
walk(dir);
if (total > 100 * 1024 * 1024) throw new Error(`Больше 100 МБ: ${total}`);
if (files > 1500) throw new Error(`Больше 1 500 файлов: ${files}`);
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', `../${zip}`, '.'], { cwd: dir });
console.log(`${zip}: ${files} файлов, ${(total / 1024 / 1024).toFixed(1)} МБ`);
