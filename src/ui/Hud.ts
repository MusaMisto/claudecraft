// HUD: 9-slot hotbar with isometric block icons drawn from the atlas.
import { BlockId, blockDef, HOTBAR_BLOCKS } from '../world/Block';
import { TextureAtlas, TILE } from '../rendering/TextureAtlas';

const ICON = 48;

export class Hud {
  readonly root: HTMLElement;
  selectedIndex = 0;
  private slots: HTMLElement[] = [];
  private crosshair: HTMLElement;

  constructor(container: HTMLElement, atlas: TextureAtlas) {
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'crosshair';
    container.appendChild(this.crosshair);

    this.root = document.createElement('div');
    this.root.id = 'hotbar';
    HOTBAR_BLOCKS.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.title = blockDef(id)!.name;
      slot.appendChild(drawBlockIcon(atlas, id));
      this.root.appendChild(slot);
      this.slots.push(slot);
      slot.addEventListener('mousedown', () => this.select(i));
    });
    container.appendChild(this.root);
    this.select(0);
  }

  get selectedBlock(): BlockId {
    return HOTBAR_BLOCKS[this.selectedIndex];
  }

  select(i: number): void {
    this.selectedIndex = ((i % 9) + 9) % 9;
    this.slots.forEach((s, j) => s.classList.toggle('selected', j === this.selectedIndex));
  }

  scroll(delta: number): void {
    if (delta !== 0) this.select(this.selectedIndex + delta);
  }

  /** Handle Digit1..Digit9; returns true if consumed. */
  handleKey(code: string): boolean {
    const m = /^Digit([1-9])$/.exec(code);
    if (!m) return false;
    this.select(Number(m[1]) - 1);
    return true;
  }

  dispose(): void {
    this.root.remove();
    this.crosshair.remove();
  }
}

/** Fake-isometric cube icon: top diamond + two shaded side faces. */
function drawBlockIcon(atlas: TextureAtlas, id: BlockId): HTMLCanvasElement {
  const def = blockDef(id)!;
  const canvas = document.createElement('canvas');
  canvas.width = ICON;
  canvas.height = ICON;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const src = atlas.canvas;
  const tilePos = (name: Parameters<TextureAtlas['uvRect']>[0]) => {
    const p = atlas.pixelOrigin(name);
    return { sx: p.x, sy: p.y };
  };

  const w = 14; // half-width of the iso cube
  const h = 7; // half-height of the top diamond
  const cx = ICON / 2;
  const topY = 6;
  const midY = topY + 2 * h; // 20

  const drawFace = (
    name: Parameters<TextureAtlas['uvRect']>[0],
    transform: [number, number, number, number, number, number],
    shade: number,
  ) => {
    const { sx, sy } = tilePos(name);
    ctx.save();
    ctx.setTransform(...transform);
    ctx.drawImage(src, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    if (shade > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, 0, TILE, TILE);
    }
    ctx.restore();
  };

  // Left face: from W(cx-w, midY-h) down; Right face: from S(cx, midY) up-right.
  drawFace(def.faces.side, [w / TILE, h / TILE, 0, 14 / TILE, cx - w, midY - h], 0.25);
  drawFace(def.faces.side, [w / TILE, -h / TILE, 0, 14 / TILE, cx, midY], 0.4);
  // Top diamond: N(cx, topY) → E and W.
  drawFace(def.faces.top, [w / TILE, h / TILE, -w / TILE, h / TILE, cx, topY], 0);

  return canvas;
}
