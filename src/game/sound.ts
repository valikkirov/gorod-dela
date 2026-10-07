// Звук: фон улицы и музыка по времени суток, короткие звуки событий и интерфейса.
// По умолчанию выключен — включается кнопкой в шапке, выбор запоминается в браузере.
// Файлы — src/game/sound/*.mp3 (сгенерированы в Magnific, обрезаны и выровнены по громкости,
// фон и музыка склеены в петли без шва). На расчёты игры звук никак не влияет.

const URLS = import.meta.glob('./sound/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string): string => URLS[`./sound/${name}.mp3`];

const KEY = 'gorod-dela:sound';
const MIX_KEY = 'gorod-dela:sound-mix';

/** Громкость групп: фон улицы, музыка, короткие звуки */
const BUS = { amb: 0.55, music: 0.28, sfx: 0.75 } as const;
export type Bus = keyof typeof BUS;

/** Громкость, которую выставил игрок: 0–1 для каждой группы */
export type Mix = Record<Bus, number>;
export const BUS_LABEL: Record<Bus, string> = { amb: 'Звуки города', music: 'Музыка', sfx: 'Эффекты' };

/** Сколько миллисекунд звук не повторяется — чтобы на ×4 касса не трещала */
const THROTTLE: Record<string, number> = {
  'sfx-sale': 220,
  'sfx-coffee': 2500,
  'sfx-extra': 900,
  'sfx-car-pass': 4500,
  'sfx-door': 1500,
  'ui-click': 60,
};

/** Какие петли звучат в это время суток */
function scenery(minute: number): { amb: string; music: string } {
  const h = minute / 60;
  const amb = h >= 6 && h < 10 ? 'amb-morning' : h >= 10 && h < 18 ? 'amb-day' : h >= 18 && h < 22 ? 'amb-evening' : 'amb-night';
  const music = h >= 7 && h < 19 ? 'music-day' : 'music-evening';
  return { amb, music };
}

interface Loop {
  name: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

class SoundSystem {
  enabled = readEnabled();
  mix: Mix = readMix();
  private ctx: AudioContext | null = null;
  private buses = {} as Record<Bus, GainNode>;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private last = new Map<string, number>();
  /** Петли по слотам: фон, дождь, праздник, музыка */
  private loops = new Map<string, Loop>();
  private lastScene = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  /** Включить или выключить. Вызывается из нажатия — браузер разрешает звук только после жеста */
  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? '1' : '0');
    } catch {
      /* без хранилища просто не запомним */
    }
    if (this.enabled) this.start();
    else {
      for (const slot of [...this.loops.keys()]) this.stopLoop(slot, 0.3);
      void this.ctx?.suspend();
    }
    return this.enabled;
  }

  /** Громкость группы; на нуле её петли останавливаются и не грузятся */
  setLevel(bus: Bus, level: number): void {
    this.mix[bus] = Math.min(1, Math.max(0, level));
    try {
      localStorage.setItem(MIX_KEY, JSON.stringify(this.mix));
    } catch {
      /* без хранилища — до перезагрузки */
    }
    const g = this.buses[bus];
    if (g && this.ctx) g.gain.setTargetAtTime(BUS[bus] * this.mix[bus], this.ctx.currentTime, 0.05);
    this.lastScene = 0;
  }

  /** Первый жест на странице: если звук был включён в прошлый раз — запускаем */
  resumeIfEnabled(): void {
    if (this.enabled) this.start();
  }

  private start(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      for (const bus of Object.keys(BUS) as Bus[]) {
        const g = this.ctx.createGain();
        g.gain.value = BUS[bus] * this.mix[bus];
        g.connect(this.ctx.destination);
        this.buses[bus] = g;
      }
      // Короткие звуки загружаем сразу, петли — когда понадобятся
      for (const name of Object.keys(URLS)) {
        const n = name.replace('./sound/', '').replace('.mp3', '');
        if ((n.startsWith('sfx-') || n.startsWith('ui-')) && n !== 'sfx-festival') void this.buffer(n);
      }
    }
    void this.ctx.resume();
    this.lastScene = 0;
  }

  private buffer(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const ctx = this.ctx!;
      p = fetch(url(name))
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }

  /** Короткий звук. volume — доля от громкости группы */
  play(name: string, volume = 1): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || this.mix.sfx === 0) return;
    const key = name.replace(/-\d$/, '');
    const now = performance.now();
    if (now - (this.last.get(key) ?? -1e9) < (THROTTLE[key] ?? 0)) return;
    this.last.set(key, now);
    const ctx = this.ctx;
    void this.buffer(name).then((buf) => {
      if (!buf || !this.enabled) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(this.buses[name.startsWith('ui-') || name.startsWith('sfx-') ? 'sfx' : 'amb']);
      src.start();
    });
  }

  /** Продажа: два варианта кассы вперемешку */
  sale(): void {
    this.play(Math.random() < 0.5 ? 'sfx-sale-1' : 'sfx-sale-2', 0.8);
  }

  /** Раз в секунду: какие петли должны звучать сейчас */
  update(minute: number, rain: boolean, festival: boolean): void {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastScene < 1000) return;
    this.lastScene = now;
    const s = scenery(minute);
    const amb = this.mix.amb > 0;
    this.setLoop('amb', amb ? s.amb : null, 'amb', 1);
    this.setLoop('music', this.mix.music > 0 ? s.music : null, 'music', 1);
    this.setLoop('rain', amb && rain ? 'amb-rain' : null, 'amb', 0.9);
    this.setLoop('festival', amb && festival ? 'sfx-festival' : null, 'amb', 0.7);
  }

  private setLoop(slot: string, name: string | null, bus: Bus, volume: number): void {
    const cur = this.loops.get(slot);
    if (cur?.name === name) return;
    if (cur) this.stopLoop(slot, 3);
    if (!name || !this.ctx) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.buses[bus]);
    const source = ctx.createBufferSource();
    source.loop = true;
    this.loops.set(slot, { name, source, gain });
    void this.buffer(name).then((buf) => {
      if (!buf || this.loops.get(slot)?.source !== source) return;
      source.buffer = buf;
      source.connect(gain);
      source.start();
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 1);
    });
  }

  private stopLoop(slot: string, fade: number): void {
    const cur = this.loops.get(slot);
    if (!cur || !this.ctx) return;
    this.loops.delete(slot);
    const t = this.ctx.currentTime;
    cur.gain.gain.setTargetAtTime(0, t, fade / 3);
    try {
      cur.source.stop(t + fade);
    } catch {
      /* петля ещё не успела загрузиться и не стартовала */
    }
  }
}

function readMix(): Mix {
  const mix: Mix = { amb: 1, music: 1, sfx: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(MIX_KEY) ?? '{}') as Partial<Mix>;
    for (const k of Object.keys(mix) as Bus[]) if (typeof saved[k] === 'number') mix[k] = Math.min(1, Math.max(0, saved[k]!));
  } catch {
    /* по умолчанию всё на максимуме */
  }
  return mix;
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const sound = new SoundSystem();
