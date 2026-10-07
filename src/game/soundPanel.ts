// Настройки звука: кнопка над масштабом открывает панель — общий выключатель
// и громкость трёх групп (город, музыка, эффекты). Ноль у группы — она выключена.
import { BUS_LABEL, sound, type Bus } from './sound';

const NB = ' ';

export function initSoundPanel(): void {
  const btn = document.getElementById('sound')!;
  const panel = document.createElement('div');
  panel.id = 'sound-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Настройки звука');
  panel.hidden = true;
  document.getElementById('game')!.append(panel);

  const render = () => {
    panel.innerHTML = `
      <label class="sound-on"><b>Звук</b>
        <input type="checkbox" data-sound="on" ${sound.enabled ? 'checked' : ''} />
        <span class="toggle" aria-hidden="true"></span>
      </label>
      ${(Object.keys(BUS_LABEL) as Bus[])
        .map((bus) => {
          const v = Math.round(sound.mix[bus] * 100);
          return `<label class="sound-row ${sound.enabled ? '' : 'off'}">
            <span>${BUS_LABEL[bus]}</span>
            <input type="range" min="0" max="100" step="5" value="${v}" data-bus="${bus}" ${sound.enabled ? '' : 'disabled'} aria-label="${BUS_LABEL[bus]}" />
            <small data-level="${bus}">${v ? `${v}${NB}%` : 'выкл.'}</small>
          </label>`;
        })
        .join('')}`;
    btn.textContent = sound.enabled ? '🔊' : '🔇';
    btn.classList.toggle('active', sound.enabled);
    btn.setAttribute('aria-label', 'Настройки звука');
  };
  render();

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });
  panel.addEventListener('click', (ev) => ev.stopPropagation());
  panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => {
    panel.hidden = true;
  });

  panel.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.dataset.sound === 'on') {
      if (el.checked !== sound.enabled) sound.toggle();
      render();
    }
    if (el.dataset.bus === 'sfx') sound.play('ui-click');
  });
  panel.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement;
    const bus = el.dataset.bus as Bus | undefined;
    if (!bus) return;
    const v = Number(el.value);
    sound.setLevel(bus, v / 100);
    const label = panel.querySelector(`[data-level="${bus}"]`);
    if (label) label.textContent = v ? `${v}${NB}%` : 'выкл.';
  });
}
