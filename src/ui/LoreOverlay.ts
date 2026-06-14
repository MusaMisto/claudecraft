export class LoreOverlay {
  private readonly element: HTMLElement;
  private hideTimer = 0;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.id = 'lore-overlay';
    container.appendChild(this.element);
  }

  show(text: string): void {
    window.clearTimeout(this.hideTimer);
    this.element.textContent = text;
    this.element.classList.add('visible');
    this.hideTimer = window.setTimeout(() => this.element.classList.remove('visible'), 4200);
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    this.element.remove();
  }
}
