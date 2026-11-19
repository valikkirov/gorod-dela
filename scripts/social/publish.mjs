// Автопостинг «Города дела»: публикует из очереди social/queue то, что настало, в Telegram и ВКонтакте.
// Запускает задача GitHub .github/workflows/social.yml раз в день (и по кнопке). Ключи — только в секретах GitHub:
//   TG_BOT_TOKEN — токен @gorod_dela_bot (бот — админ группы с правом публикации)
//   VK_TOKEN     — ключ доступа сообщества или пользователя с правами wall, photos
// Где публиковать (не секрет) — social/config.json. Что уже вышло — social/published.json (задача коммитит его).
//
// Режимы (первый аргумент):
//   publish  — опубликовать всё, что настало и ещё не вышло
//   dry-run  — показать, что вышло бы, ничего не отправляя
//   chats    — подсказать id группы и тем Telegram (по последним сообщениям, которые видел бот)
//   check    — проверить ключи: кто бот, какая группа ВК
//   test-tg  — отправить пробное сообщение в Telegram (в тему из config.telegram.testThread или в общую)
//
// Файл поста — social/queue/<ГГГГ-ММ-ДД>-<имя>.md:
//   ---
//   date: 2026-11-17            день публикации (по Москве); раньше этого дня пост не выйдет
//   channels: tg, vk            куда (по умолчанию оба, если есть текст)
//   images: post8.jpg           картинки из social/img через запятую (до 10)
//   thread: news                тема Telegram из config.telegram.threads (по умолчанию — default)
//   ---
//   ## tg
//   текст для Telegram
//   ## vk
//   текст для ВКонтакте
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DIR = path.join(ROOT, 'social');
const QUEUE = path.join(DIR, 'queue');
const IMG = path.join(DIR, 'img');
const STATE = path.join(DIR, 'published.json');
const config = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const mode = process.argv[2] ?? 'dry-run';
const report = [];
const log = (s) => {
  console.log(s);
  report.push(s);
};

/** Сегодня по Москве, ГГГГ-ММ-ДД */
function today() {
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}

function parsePost(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)}: нет шапки --- … ---`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const texts = {};
  let cur = null;
  for (const line of m[2].split('\n')) {
    const h = line.match(/^##\s*(tg|vk)\s*$/i);
    if (h) {
      cur = h[1].toLowerCase();
      texts[cur] = [];
    } else if (cur) texts[cur].push(line);
  }
  for (const k of Object.keys(texts)) texts[k] = texts[k].join('\n').trim();
  const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '')) throw new Error(`${path.basename(file)}: нет даты date: ГГГГ-ММ-ДД`);
  const channels = meta.channels ? list(meta.channels) : Object.keys(texts);
  const images = list(meta.images).map((f) => path.join(IMG, f));
  for (const f of images) if (!fs.existsSync(f)) throw new Error(`${path.basename(file)}: нет картинки ${path.relative(ROOT, f)}`);
  return { id: path.basename(file, '.md'), date: meta.date, channels, images, thread: meta.thread ?? 'default', texts };
}

function loadQueue() {
  if (!fs.existsSync(QUEUE)) return [];
  return fs
    .readdirSync(QUEUE)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map((f) => parsePost(path.join(QUEUE, f)));
}

const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

async function retry(what, fn) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Ошибки в самом запросе (неверный ключ, нет прав) повтором не лечатся
      if (e.fatal) break;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw new Error(`${what}: ${last.message}`);
}

// ——— Telegram ———
const TG = process.env.TG_BOT_TOKEN;

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TG}/${method}`, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  });
  const j = await res.json();
  if (!j.ok) {
    const e = new Error(`${method}: ${j.description}`);
    e.fatal = j.error_code >= 400 && j.error_code < 429;
    throw e;
  }
  return j.result;
}

function threadOf(name) {
  const t = config.telegram.threads?.[name];
  return t ? { message_thread_id: t } : {};
}

function blob(file) {
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return new Blob([fs.readFileSync(file)], { type });
}

/** Подпись к картинке в Telegram — до 1024 знаков; длиннее — картинки отдельно, текст следом */
async function postTelegram(p) {
  const chat_id = config.telegram.chat;
  const text = p.texts.tg;
  const where = threadOf(p.thread);
  const ids = [];
  if (!p.images.length) {
    const m = await tg('sendMessage', { chat_id, text, link_preview_options: { is_disabled: true }, ...where });
    return [m.message_id];
  }
  const caption = text.length <= 1024 ? text : undefined;
  if (p.images.length === 1) {
    const fd = new FormData();
    fd.set('chat_id', String(chat_id));
    if (where.message_thread_id) fd.set('message_thread_id', String(where.message_thread_id));
    if (caption) fd.set('caption', caption);
    fd.set('photo', blob(p.images[0]), path.basename(p.images[0]));
    ids.push((await tg('sendPhoto', fd)).message_id);
  } else {
    const fd = new FormData();
    fd.set('chat_id', String(chat_id));
    if (where.message_thread_id) fd.set('message_thread_id', String(where.message_thread_id));
    const media = p.images.slice(0, 10).map((f, i) => ({ type: 'photo', media: `attach://p${i}`, ...(i === 0 && caption ? { caption } : {}) }));
    fd.set('media', JSON.stringify(media));
    p.images.slice(0, 10).forEach((f, i) => fd.set(`p${i}`, blob(f), path.basename(f)));
    for (const m of await tg('sendMediaGroup', fd)) ids.push(m.message_id);
  }
  if (!caption) ids.push((await tg('sendMessage', { chat_id, text, link_preview_options: { is_disabled: true }, ...where })).message_id);
  return ids;
}

// ——— ВКонтакте ———
const VK = process.env.VK_TOKEN;
const VK_V = '5.199';

async function vk(method, params) {
  const body = new URLSearchParams({ ...params, access_token: VK, v: VK_V });
  const res = await fetch(`https://api.vk.ru/method/${method}`, { method: 'POST', body });
  const j = await res.json();
  if (j.error) {
    const e = new Error(`${method}: ${j.error.error_code} ${j.error.error_msg}`);
    e.fatal = ![6, 9, 10].includes(j.error.error_code); // 6 — слишком часто, 9 — флуд, 10 — сбой ВК
    throw e;
  }
  return j.response;
}

let vkGroup = null;
async function group() {
  if (vkGroup) return vkGroup;
  const r = await vk('groups.getById', { group_id: String(config.vk.group) });
  vkGroup = (r.groups ?? r)[0];
  return vkGroup;
}

async function upload(url, file) {
  const fd = new FormData();
  fd.set('photo', blob(file), path.basename(file));
  return (await fetch(url, { method: 'POST', body: fd })).json();
}

/** Фото для поста. Ключ сообщества не пускает к загрузке «на стену» — тогда грузим как фото для сообщений
 * сообщества: такое фото тоже прикрепляется к посту */
async function vkPhoto(file) {
  const g = await group();
  try {
    const up = await vk('photos.getWallUploadServer', { group_id: String(g.id) });
    const sent = await upload(up.upload_url, file);
    const [ph] = await vk('photos.saveWallPhoto', { group_id: String(g.id), photo: sent.photo, server: String(sent.server), hash: sent.hash });
    return `photo${ph.owner_id}_${ph.id}`;
  } catch (e) {
    if (!/\b27\b/.test(e.message)) throw e;
  }
  const up = await vk('photos.getMessagesUploadServer', { peer_id: '0' });
  const sent = await upload(up.upload_url, file);
  const [ph] = await vk('photos.saveMessagesPhoto', { photo: sent.photo, server: String(sent.server), hash: sent.hash });
  return `photo${ph.owner_id}_${ph.id}${ph.access_key ? `_${ph.access_key}` : ''}`;
}

async function postVk(p) {
  const g = await group();
  const attachments = [];
  for (const f of p.images.slice(0, 10)) attachments.push(await retry(`фото ${path.basename(f)}`, () => vkPhoto(f)));
  const r = await vk('wall.post', { owner_id: String(-g.id), from_group: '1', message: p.texts.vk, attachments: attachments.join(',') });
  return `https://vk.ru/wall-${g.id}_${r.post_id}`;
}

// ——— Режимы ———
async function publish(dry) {
  const now = today();
  const due = loadQueue().filter((p) => p.date <= now);
  log(`Сегодня ${now}. В очереди к публикации: ${due.length}`);
  let failed = 0;
  for (const p of due) {
    for (const ch of p.channels) {
      if (!p.texts[ch]) continue;
      if (state[p.id]?.[ch]) continue;
      if (ch === 'tg' && (!TG || !config.telegram.chat)) {
        log(`⏸ ${p.id} → Telegram: нет TG_BOT_TOKEN или telegram.chat в config.json`);
        continue;
      }
      if (ch === 'vk' && (!VK || !config.vk.group)) {
        log(`⏸ ${p.id} → ВК: нет VK_TOKEN или vk.group в config.json`);
        continue;
      }
      if (dry) {
        log(`• ${p.id} → ${ch === 'tg' ? 'Telegram' : 'ВК'} (${p.texts[ch].length} знаков, картинок: ${p.images.length})`);
        continue;
      }
      try {
        const res = ch === 'tg' ? await retry('Telegram', () => postTelegram(p)) : await postVk(p);
        state[p.id] = { ...state[p.id], [ch]: { at: new Date().toISOString(), result: res } };
        saveState();
        log(`✅ ${p.id} → ${ch === 'tg' ? 'Telegram' : 'ВК'} ${typeof res === 'string' ? res : ''}`);
      } catch (e) {
        failed++;
        log(`❌ ${p.id} → ${ch === 'tg' ? 'Telegram' : 'ВК'}: ${e.message}`);
      }
    }
  }
  const later = loadQueue().filter((p) => p.date > now);
  if (later.length) log(`Дальше: ${later.map((p) => `${p.date} ${p.id}`).join('; ')}`);
  return failed;
}

async function chats() {
  const me = await tg('getMe');
  log(`Бот: @${me.username}`);
  const ups = await tg('getUpdates', { allowed_updates: ['message', 'my_chat_member', 'channel_post'] });
  const seen = new Map();
  for (const u of ups) {
    const m = u.message ?? u.channel_post ?? u.my_chat_member;
    if (!m?.chat) continue;
    const c = m.chat;
    const key = `${c.id}:${m.message_thread_id ?? ''}`;
    const topic = m.reply_to_message?.forum_topic_created?.name ?? m.forum_topic_created?.name ?? '';
    seen.set(key, `чат «${c.title ?? c.username ?? c.first_name}» id ${c.id}${m.message_thread_id ? `, тема ${m.message_thread_id}${topic ? ` «${topic}»` : ''}` : ''}`);
  }
  if (!seen.size) log('Бот пока не видел ни одного сообщения. Добавьте его в группу админом и напишите что-нибудь в нужной теме, потом запустите снова.');
  for (const s of seen.values()) log(s);
  return 0;
}

async function check() {
  if (TG) {
    const me = await tg('getMe');
    log(`Telegram: бот @${me.username}`);
    if (config.telegram.chat) {
      const c = await tg('getChat', { chat_id: config.telegram.chat });
      const m = await tg('getChatMember', { chat_id: config.telegram.chat, user_id: me.id });
      log(`Telegram: группа «${c.title}», бот — ${m.status}${m.can_post_messages === false ? ', публиковать не может' : ''}`);
    }
  } else log('Telegram: нет TG_BOT_TOKEN');
  if (VK) {
    const g = await group();
    log(`ВК: группа «${g.name}» id ${g.id}`);
    try {
      await vk('photos.getWallUploadServer', { group_id: String(g.id) });
      log('ВК: загрузка фото на стену — доступна');
    } catch (e) {
      log(`ВК: загрузка фото на стену недоступна — ${e.message}`);
    }
    try {
      await vk('photos.getMessagesUploadServer', { peer_id: '0' });
      log('ВК: загрузка фото для сообщений — доступна (запасной путь для картинок)');
    } catch (e) {
      log(`ВК: загрузка фото для сообщений недоступна — ${e.message}`);
    }
    // Пустой пост ВК отвергнет и ничего не опубликует: по ошибке видно, пускает ли ключ к стене вообще
    try {
      await vk('wall.post', { owner_id: String(-g.id), from_group: '1' });
      log('ВК: публикация на стену — неожиданно прошла пустой пост, проверь стену');
    } catch (e) {
      log(/\b27\b|15\b|5\b/.test(e.message.split(':')[1] ?? '') && !/\b100\b/.test(e.message) ? `ВК: публикация на стену недоступна — ${e.message}` : `ВК: публикация на стену доступна (проверочная ошибка: ${e.message})`);
    }
  } else log('ВК: нет VK_TOKEN');
  return 0;
}

async function testTg() {
  const where = threadOf(config.telegram.testThread ?? 'default');
  const m = await tg('sendMessage', { chat_id: config.telegram.chat, text: '🔧 Проверка автопостинга «Города дела». Сообщение можно удалить.', ...where });
  log(`Telegram: пробное сообщение отправлено, id ${m.message_id}`);
  return 0;
}

const run = { publish: () => publish(false), 'dry-run': () => publish(true), chats, check, 'test-tg': testTg }[mode];
if (!run) {
  console.error(`Неизвестный режим ${mode}`);
  process.exit(2);
}
let code = 0;
try {
  code = await run();
} catch (e) {
  log(`❌ ${e.message}`);
  code = 1;
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Автопостинг: ${mode}\n\n${report.map((s) => `- ${s}`).join('\n')}\n`);
process.exit(code ? 1 : 0);
