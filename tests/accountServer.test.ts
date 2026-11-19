// @ts-nocheck — тест сервера (Node), типов Node в проекте нет
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Сервер аккаунтов (server/account): подписи Telegram, сессия, сохранение. Хранилище — в памяти
const BOT = '123456:TEST-token';
process.env.TG_BOT_TOKEN = BOT;
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../server/account/index.js');

const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string, init: { method: string; body?: string }) => {
    const key = url.split('/').slice(4).join('/');
    if (init.method === 'GET') return store.has(key) ? new Response(store.get(key)) : new Response('', { status: 404 });
    if (init.method === 'PUT') store.set(key, init.body ?? '');
    if (init.method === 'DELETE') store.delete(key);
    return new Response('');
  });
});

const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac('sha256', key).update(data).digest();

function initData(user: object, authDate = Math.floor(Date.now() / 1000)): string {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: 'q1', user: JSON.stringify(user) });
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  p.set('hash', hmac(hmac('WebAppData', BOT), check).toString('hex'));
  return p.toString();
}

function widget(fields: Record<string, string | number>): Record<string, string | number> {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  return { ...fields, hash: hmac(crypto.createHash('sha256').update(BOT).digest(), check).toString('hex') };
}

const call = (method: string, action: string, body?: unknown, token?: string) =>
  api.handler(
    {
      httpMethod: method,
      queryStringParameters: { action },
      headers: { Origin: 'https://www.gorod-dela.ru', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? '' : JSON.stringify(body),
    },
    { token: { access_token: 'iam' } },
  );

describe('Сервер аккаунтов', () => {
  it('принимает подписанные данные Mini App и отвергает подделку', () => {
    const data = initData({ id: 42, first_name: 'Валя', username: 'valya' });
    expect(api.telegramFromInitData(data)).toMatchObject({ id: 42, username: 'valya' });
    expect(api.telegramFromInitData(data.replace('42', '43'))).toBeNull();
    // Старые данные запуска (больше суток) не годятся
    expect(api.telegramFromInitData(initData({ id: 42 }, Math.floor(Date.now() / 1000) - 2 * 86_400))).toBeNull();
  });

  it('принимает вход через Telegram на сайте', () => {
    const tg = widget({ id: 42, first_name: 'Валя', auth_date: Math.floor(Date.now() / 1000) });
    expect(api.telegramFromWidget(tg)).toMatchObject({ id: 42 });
    expect(api.telegramFromWidget({ ...tg, id: 7 })).toBeNull();
  });

  it('тот же игрок из Mini App и с сайта попадает в один аккаунт и видит своё сохранение', async () => {
    const a = JSON.parse((await call('POST', 'auth', { initData: initData({ id: 77, first_name: 'Аня' }) })).body);
    expect(a.token).toBeTruthy();
    expect((await call('GET', 'save', undefined, a.token)).statusCode).toBe(404);
    expect((await call('PUT', 'save', { save: 'abc', savedAt: 100, day: 5 }, a.token)).statusCode).toBe(200);
    const b = JSON.parse((await call('POST', 'auth', { tg: widget({ id: 77, first_name: 'Аня', auth_date: Math.floor(Date.now() / 1000) }) })).body);
    const got = await call('GET', 'save', undefined, b.token);
    expect(JSON.parse(got.body)).toMatchObject({ save: 'abc', day: 5 });
    // Более старое сохранение не затирает новое
    expect((await call('PUT', 'save', { save: 'old', savedAt: 50, day: 4 }, b.token)).statusCode).toBe(409);
    // Новый день — прошлое сохранение остаётся копией
    await call('PUT', 'save', { save: 'new', savedAt: 200, day: 6 }, b.token);
    expect([...store.keys()].some((k) => k.endsWith('.prev.json'))).toBe(true);
  });

  it('без сессии или с поддельной — отказ', async () => {
    expect((await call('GET', 'save')).statusCode).toBe(401);
    const forged = api.sign({ a: 'x', exp: Date.now() + 1000 }).replace(/.$/, 'A');
    expect((await call('GET', 'save', undefined, forged)).statusCode).toBe(401);
  });
});
