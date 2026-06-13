// Options panel: sliders applied live to the shared settings object.
import type { Settings } from '../settings/Settings';

/** Settings keys with numeric values (the toggle is rendered separately). */
type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

interface SliderSpec {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { key: 'musicVolume', label: 'Music', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'sfxVolume', label: 'Sound Effects', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'mouseSensitivity', label: 'Mouse Sensitivity', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'fov', label: 'FOV', min: 30, max: 110, step: 1, format: (v) => `${v}°` },
  { key: 'renderDistance', label: 'Render Distance', min: 2, max: 10, step: 1, format: (v) => `${v} chunks` },
];

export class OptionsMenu {
  onClose: (() => void) | null = null;
  onChanged: (() => void) | null = null;
  onButtonSound: (() => void) | null = null;

  private root: HTMLElement;

  constructor(container: HTMLElement, settings: Settings) {
    this.root = document.createElement('div');
    this.root.id = 'options-menu';
    this.root.style.display = 'none';

    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    const title = document.createElement('h2');
    title.textContent = 'Options';
    panel.appendChild(title);

    // Vibrant Visuals: a Bedrock-style ON/OFF toggle button.
    const vvRow = document.createElement('div');
    vvRow.className = 'option-row';
    const vvLabel = document.createElement('span');
    vvLabel.textContent = 'Vibrant Visuals';
    const vvButton = document.createElement('button');
    vvButton.className = 'mc-button';
    const renderVv = () => {
      vvButton.textContent = settings.vibrantVisuals ? 'ON' : 'OFF';
    };
    renderVv();
    vvButton.addEventListener('click', () => {
      settings.vibrantVisuals = !settings.vibrantVisuals;
      renderVv();
      this.onButtonSound?.();
      this.onChanged?.();
    });
    vvRow.append(vvLabel, vvButton);
    panel.appendChild(vvRow);

    for (const spec of SLIDERS) {
      const row = document.createElement('div');
      row.className = 'option-row';
      const label = document.createElement('span');
      const value = document.createElement('span');
      value.className = 'option-value';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(settings[spec.key]);
      label.textContent = spec.label;
      value.textContent = spec.format(settings[spec.key]);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        (settings[spec.key] as number) = v;
        value.textContent = spec.format(v);
        this.onChanged?.();
      });
      row.append(label, input, value);
      panel.appendChild(row);
    }

    const done = document.createElement('button');
    done.className = 'mc-button';
    done.textContent = 'Done';
    done.addEventListener('click', () => {
      this.onButtonSound?.();
      this.hide();
      this.onClose?.();
    });
    panel.appendChild(done);

    this.root.appendChild(panel);
    container.appendChild(this.root);
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
