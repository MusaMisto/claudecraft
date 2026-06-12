// Pause overlay: Back to Game, Options, Quit to Title.
export class PauseMenu {
  onBack: (() => void) | null = null;
  onOptions: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  onButtonSound: (() => void) | null = null;

  private root: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'pause-menu';
    this.root.style.display = 'none';

    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    const title = document.createElement('h2');
    title.textContent = 'Game Paused';
    panel.appendChild(title);

    const mkButton = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'mc-button';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.onButtonSound?.();
        fn();
      });
      panel.appendChild(b);
    };
    mkButton('Back to Game', () => this.onBack?.());
    mkButton('Options', () => this.onOptions?.());
    mkButton('Quit to Title', () => this.onQuit?.());

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
