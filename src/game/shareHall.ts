// «Показать свой зал»: картинка 1080×1350 с залом игрока в рамке Бренда 3.0 и отправка — куда умеет площадка.
// Зал берём из того, что на экране (.hall): фон комнаты, отделка, мебель, гости и надписи на доске —
// ровно так, как игрок его видит.
import { getLang, L, tr } from '../sim/i18n';
import logoRu from './art/logo-ru.webp';
import logoEn from './art/logo-en.webp';
import { goal, visitor } from './metrika';
import { PLATFORM } from './platform';
import { isTelegram } from './telegram';

const W = 1080;
const H = 1350;
const CHOCO = '#4A2E1E';
const CREAM = '#FFEED3';
const SITE = 'gorod-dela.ru';

/** Ссылка, по которой пришедший друг попадёт в игру, а мы увидим источник и кто позвал */
export function shareLink(medium: string): string {
  const ref = visitor().id;
  return `https://www.${SITE}/?utm_source=share&utm_medium=${medium}&ref=${ref}`;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Нарисовать зал с экрана на холст: каждая картинка и строчка доски — на своём месте и в своём порядке */
async function drawHall(hall: HTMLElement, ctx: CanvasRenderingContext2D, x: number, y: number, w: number): Promise<number> {
  const box = hall.getBoundingClientRect();
  const k = w / box.width;
  const h = box.height * k;
  const bg = getComputedStyle(hall).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1];
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.clip();
  ctx.fillStyle = CREAM;
  ctx.fillRect(x, y, w, h);
  if (bg) ctx.drawImage(await load(bg), x, y, w, h);
  // Порядок наложения — как на экране: z-index, при равном — порядок в разметке
  const layers = [...hall.querySelectorAll<HTMLElement>('img, .hall-board')]
    .filter((el) => !el.closest('.hall-slot'))
    .map((el, i) => ({ el, i, z: Number(getComputedStyle(el).zIndex) || 0 }))
    .sort((a, b) => a.z - b.z || a.i - b.i);
  for (const { el } of layers) {
    const r = el.getBoundingClientRect();
    const lx = x + (r.left - box.left) * k;
    const ly = y + (r.top - box.top) * k;
    if (el instanceof HTMLImageElement) {
      if (!el.complete || !el.naturalWidth) continue;
      ctx.drawImage(el, lx, ly, r.width * k, r.height * k);
      continue;
    }
    // Доска меню: свой фон (перекрывает нарисованное меню) и строки — тем же шрифтом, цветом и регистром, что на экране
    const cs = getComputedStyle(el);
    const grad = ctx.createRadialGradient(lx + r.width * k * 0.4, ly + r.height * k * 0.35, 0, lx + r.width * k * 0.4, ly + r.height * k * 0.35, r.width * k * 0.7);
    const dark = el.classList.contains('bistro');
    grad.addColorStop(0, dark ? '#2f3330' : '#4a3a27');
    grad.addColorStop(1, dark ? '#232624' : '#3e3021');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(lx, ly, r.width * k, r.height * k, parseFloat(cs.borderTopLeftRadius) * k || 3);
    ctx.fill();
    const upper = (t: string, st: CSSStyleDeclaration) => (st.textTransform === 'uppercase' ? t.toUpperCase() : t);
    for (const c of el.querySelectorAll<HTMLElement>('li > *, .board-head > *, .board-head:not(:has(*))')) {
      const cr = c.getBoundingClientRect();
      if (!cr.width) continue;
      const st = getComputedStyle(c);
      ctx.fillStyle = st.color;
      ctx.font = `${st.fontWeight} ${parseFloat(st.fontSize) * k}px ${st.fontFamily}`;
      ctx.textBaseline = 'middle';
      // Имя слева, цена справа: как в строке на экране
      const right = c.tagName === 'B' && c.parentElement?.tagName === 'LI';
      ctx.textAlign = right ? 'right' : 'left';
      let text = upper(c.textContent ?? '', st);
      const maxW = cr.width * k;
      if (!right) while (text.length > 1 && ctx.measureText(text).width > maxW) text = `${text.slice(0, -2)}…`;
      const tx = x + ((right ? cr.right : cr.left) - box.left) * k;
      ctx.fillText(text, tx, y + (cr.top + cr.height / 2 - box.top) * k);
    }
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = CHOCO;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.stroke();
  return h;
}

/** Картинка зала: рамка, логотип, зал, название, адрес */
export async function hallCard(hall: HTMLElement, title: string, line: string): Promise<Blob> {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  // Фон и рамка
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 28;
  ctx.strokeStyle = CHOCO;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  // Логотип
  const logo = await load(getLang() === 'en' ? logoEn : logoRu);
  const lh = 190;
  const lw = (logo.width / logo.height) * lh;
  ctx.drawImage(logo, (W - lw) / 2, 70, lw, lh);
  // Зал
  const pad = 70;
  const hh = await drawHall(hall, ctx, pad, 300, W - pad * 2);
  // Название и строка про зал
  const font = getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = CHOCO;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let size = 76;
  ctx.font = `800 ${size}px ${font}`;
  while (ctx.measureText(title).width > W - 160 && size > 40) ctx.font = `800 ${(size -= 4)}px ${font}`;
  const ty = 300 + hh + 120;
  ctx.fillText(title, W / 2, ty);
  ctx.font = `500 36px ${font}`;
  ctx.fillStyle = '#7a5a44';
  ctx.fillText(line, W / 2, ty + 62);
  // Адрес внизу
  ctx.font = `700 40px ${font}`;
  ctx.fillStyle = CHOCO;
  ctx.fillText(SITE, W / 2, H - 70);
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}

const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(b);
  });

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export type ShareResult = 'shared' | 'story' | 'downloaded' | 'cancelled';

/**
 * Поделиться картинкой. ВК — история с картинкой и ссылкой на игру; телефон с «Поделиться» (сайт, Telegram) —
 * системное меню с файлом; иначе картинка скачивается, а ссылка копируется.
 */
export async function shareHall(hall: HTMLElement, title: string, line: string): Promise<ShareResult> {
  const blob = await hallCard(hall, title, line);
  const file = `gorod-dela-${Date.now()}.png`;
  let result: ShareResult = 'downloaded';
  if (PLATFORM === 'vk') {
    try {
      const { default: bridge } = await import('@vkontakte/vk-bridge');
      await bridge.send('VKWebAppShowStoryBox', {
        background_type: 'image',
        blob: await blobToDataUrl(blob),
        attachment: { text: 'go_to', type: 'url', url: 'https://vk.com/app54881745' },
      });
      result = 'story';
    } catch {
      result = 'cancelled';
    }
  } else if (PLATFORM === 'web') {
    const url = shareLink(isTelegram() ? 'hall_tg' : 'hall');
    const text = tr`Мой зал в «Городе дела». Заходи — открой своё кафе: ${url}`;
    const f = new File([blob], file, { type: 'image/png' });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], text, title: L('Город дела') });
        result = 'shared';
      } catch {
        result = 'cancelled';
      }
    } else {
      download(blob, file);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* буфер недоступен — картинка всё равно скачалась */
      }
    }
  } else {
    // Площадки без внешних ссылок: только картинка
    download(blob, file);
  }
  if (result !== 'cancelled') goal('share_hall', { how: result, platform: PLATFORM });
  return result;
}
