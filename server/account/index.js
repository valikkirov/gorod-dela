// Аккаунты игроков и облачное сохранение. Yandex Cloud Function (Node.js 22), без зависимостей.
// Аккаунт — свой id; вход в него — Telegram (позже почта, ВК): accounts/tg/<id telegram> → id аккаунта.
// Хранилище — закрытый бакет Object Storage (BUCKET), доступ — IAM-токеном сервисного аккаунта функции.
//
// Запросы (?action=…):
//   POST auth  {initData} из Telegram Mini App или {tg: {...}} из входа на сайте → {token, name}
//   GET  save  → {save, savedAt, day} или 404
//   PUT  save  {save, savedAt, day} → {ok}; прежнее сохранение остаётся копией saves/<id>.prev.json
//   DELETE save → {ok}
// Токен сессии — подпись HMAC, ключ выводится из токена бота: отдельный секрет не нужен.
'use strict';
const crypto = require('node:crypto');

const BOT = process.env.TG_BOT_TOKEN ?? '';
const BUCKET = process.env.BUCKET ?? 'gorod-dela-saves';
const S3 = 'https://storage.yandexcloud.net';
const ORIGINS = [
  'https://gorod-dela.ru',
  'https://www.gorod-dela.ru',
  'https://gorod-dela-play.website.yandexcloud.net',
  'http://localhost:5199',
  'http://localhost:5173',
];
const MAX_SAVE = 2_000_000;
const SESSION_DAYS = 180;

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const SESSION_KEY = hmac('gorod-dela-session', BOT);

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(SESSION_KEY, body).toString('base64url')}`;
}

function verifyToken(token) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const want = hmac(SESSION_KEY, body);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}

const safeEqualHex = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const fresh = (authDate) => Date.now() / 1000 - Number(authDate) < 86_400;

/** Данные запуска Mini App: подпись ключом HMAC("WebAppData", токен бота) */
function telegramFromInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const want = hmac(hmac('WebAppData', BOT), check).toString('hex');
  if (!/^[0-9a-f]{64}$/.test(hash) || !safeEqualHex(hash, want) || !fresh(params.get('auth_date'))) return null;
  const user = JSON.parse(params.get('user') ?? 'null');
  return user?.id ? { id: user.id, name: [user.first_name, user.last_name].filter(Boolean).join(' '), username: user.username ?? null } : null;
}

/** Вход через Telegram на сайте (oauth.telegram.org): подпись ключом SHA256(токен бота) */
function telegramFromWidget(tg) {
  const { hash, ...fields } = tg ?? {};
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const want = hmac(crypto.createHash('sha256').update(BOT).digest(), check).toString('hex');
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || !safeEqualHex(hash, want) || !fresh(fields.auth_date)) return null;
  return { id: fields.id, name: [fields.first_name, fields.last_name].filter(Boolean).join(' '), username: fields.username ?? null };
}

// ——— Хранилище ———
let iam = '';
async function s3(method, key, body) {
  const res = await fetch(`${S3}/${BUCKET}/${key}`, {
    method,
    headers: { 'X-YaCloud-SubjectToken': iam, ...(body ? { 'content-type': 'application/json' } : {}) },
    body,
  });
  if (method === 'GET' && res.status === 404) return null;
  if (!res.ok) throw new Error(`storage ${method} ${res.status}`);
  return method === 'GET' ? res.json() : true;
}

async function accountFor(tg) {
  const link = await s3('GET', `accounts/tg/${tg.id}.json`);
  if (link) {
    await s3('PUT', `accounts/${link.id}.json`, JSON.stringify({ id: link.id, tg, seen: Date.now() }));
    return link.id;
  }
  const id = crypto.randomUUID();
  await s3('PUT', `accounts/${id}.json`, JSON.stringify({ id, tg, created: Date.now(), seen: Date.now() }));
  await s3('PUT', `accounts/tg/${tg.id}.json`, JSON.stringify({ id }));
  return id;
}

// ——— Обработчик ———
function reply(origin, status, data) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'access-control-max-age': '86400',
      vary: 'origin',
    },
    body: JSON.stringify(data),
  };
}

async function handler(event, context) {
  const h = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const origin = ORIGINS.includes(h.origin) ? h.origin : ORIGINS[1];
  const method = event.httpMethod;
  if (method === 'OPTIONS') return reply(origin, 204, {});
  iam = context?.token?.access_token ?? '';
  const action = event.queryStringParameters?.action;
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString() : (event.body ?? '');
  if (raw.length > MAX_SAVE) return reply(origin, 413, { error: 'too-big' });
  try {
    if (action === 'auth' && method === 'POST') {
      const body = JSON.parse(raw || '{}');
      const tg = body.initData ? telegramFromInitData(body.initData) : telegramFromWidget(body.tg);
      if (!tg) return reply(origin, 401, { error: 'bad-signature' });
      const id = await accountFor(tg);
      return reply(origin, 200, { token: sign({ a: id, exp: Date.now() + SESSION_DAYS * 86_400_000 }), name: tg.username ? `@${tg.username}` : tg.name });
    }
    const session = verifyToken((h.authorization ?? '').replace(/^Bearer /, ''));
    if (!session) return reply(origin, 401, { error: 'no-session' });
    const key = `saves/${session.a}.json`;
    if (action === 'save' && method === 'GET') {
      const save = await s3('GET', key);
      return save ? reply(origin, 200, save) : reply(origin, 404, { error: 'none' });
    }
    if (action === 'save' && method === 'PUT') {
      const body = JSON.parse(raw);
      if (typeof body.save !== 'string' || !Number.isFinite(body.savedAt)) return reply(origin, 400, { error: 'bad-save' });
      const old = await s3('GET', key);
      if (old && old.savedAt > body.savedAt) return reply(origin, 409, { error: 'older', savedAt: old.savedAt });
      // Копия прошлого сохранения — на случай, если новое окажется не тем (другое устройство, «начать заново»)
      if (old && (!old.day || old.day !== body.day)) await s3('PUT', `saves/${session.a}.prev.json`, JSON.stringify(old));
      await s3('PUT', key, JSON.stringify({ save: body.save, savedAt: body.savedAt, day: Number(body.day) || 0 }));
      return reply(origin, 200, { ok: true });
    }
    if (action === 'save' && method === 'DELETE') {
      const old = await s3('GET', key);
      if (old) await s3('PUT', `saves/${session.a}.prev.json`, JSON.stringify(old));
      await s3('DELETE', key);
      return reply(origin, 200, { ok: true });
    }
    return reply(origin, 404, { error: 'unknown' });
  } catch (e) {
    console.error(e);
    return reply(origin, 500, { error: 'server' });
  }
}

module.exports = { handler, telegramFromInitData, telegramFromWidget, sign, verifyToken };
