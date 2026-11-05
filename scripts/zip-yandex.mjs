// Архив для черновика Яндекс Игр: index.html в корне, имена файлов латиницей без пробелов (требование 1.22)
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-yandex';
const zip = 'gorod-dela-yandex.zip';
let total = 0;
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (!/^[A-Za-z0-9._-]+$/.test(f)) throw new Error(`Имя файла не подходит для Яндекс Игр: ${p}`);
    if (statSync(p).isDirectory()) walk(p);
    else total += statSync(p).size;
  }
};
walk(dir);
if (total > 100 * 1024 * 1024) throw new Error(`Больше 100 МБ: ${total}`);
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', `../${zip}`, '.'], { cwd: dir });
console.log(`${zip}: ${(total / 1024 / 1024).toFixed(1)} МБ файлов`);
