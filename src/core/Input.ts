// Keyboard/mouse state and pointer lock for the game canvas.

export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private keyDownHandlers = new Set<(code: string) => void>();
  private mouseDownHandlers = new Set<(button: number) => void>();
  private disposers: Array<() => void> = [];

  constructor(private element: HTMLElement) {
    const listen = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement | Document,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };

    listen(window, 'keydown', (e) => {
      // Keep game keys from triggering browser actions (search, scroll).
      if (e.code === 'F3' || (this.pointerLocked && (e.code === 'Space' || e.code.startsWith('Control')))) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const h of this.keyDownHandlers) h(e.code);
    });
    listen(window, 'keyup', (e) => this.keys.delete(e.code));
    listen(window, 'blur', () => this.keys.clear());
    listen(window, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    listen(this.element, 'mousedown', (e) => {
      for (const h of this.mouseDownHandlers) h((e as MouseEvent).button);
    });
    listen(this.element, 'wheel', (e) => {
      this.wheel += Math.sign((e as WheelEvent).deltaY);
      (e as WheelEvent).preventDefault();
    });
    listen(this.element, 'contextmenu', (e) => e.preventDefault());
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  requestPointerLock(): void {
    if (!this.pointerLocked) this.element.requestPointerLock();
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  onKeyDown(handler: (code: string) => void): () => void {
    this.keyDownHandlers.add(handler);
    return () => this.keyDownHandlers.delete(handler);
  }

  onMouseDown(handler: (button: number) => void): () => void {
    this.mouseDownHandlers.add(handler);
    return () => this.mouseDownHandlers.delete(handler);
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.keyDownHandlers.clear();
    this.mouseDownHandlers.clear();
    this.keys.clear();
  }
}
