const VIEW = 360;
const OUTPUT = 512;
const MIN_SIZE = 72;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Square {
  x: number;
  y: number;
  size: number;
}

interface Drag {
  mode: "move" | "resize";
  originX: number;
  originY: number;
  start: Square;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("image"));
    };
    image.src = url;
  });
}

/**
 * Квадратный кроп на canvas.
 * Рамку нельзя собрать отдельными div: на проде CSP запрещает inline-стили.
 */
export class AvatarCrop {
  private imageBox: Frame = { x: 0, y: 0, w: 0, h: 0 };
  private crop: Square = { x: 0, y: 0, size: 0 };
  private drag: Drag | null = null;
  private locked = false;
  private readonly onDown = (event: PointerEvent): void => {
    this.pointerDown(event);
  };
  private readonly onMove = (event: PointerEvent): void => {
    this.pointerMove(event);
  };
  private readonly onUp = (event: PointerEvent): void => {
    this.pointerUp(event);
  };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly image: HTMLImageElement,
    private readonly url: string,
    private readonly fileName: string,
    private readonly mime: string
  ) {}

  /**
   * Читает файл и рисует его в переданном canvas.
   *
   * @param canvas Элемент `[data-avatar-crop]`.
   * @param file Выбранный JPEG, PNG или WebP.
   * @returns Кроппер или `null`, если файл не декодируется.
   */
  static async open(canvas: HTMLCanvasElement, file: File): Promise<AvatarCrop | null> {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      if (image.naturalWidth < 1 || image.naturalHeight < 1) {
        URL.revokeObjectURL(url);
        return null;
      }
      const mime =
        file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp"
          ? file.type
          : "image/png";
      const crop = new AvatarCrop(canvas, ctx, image, url, file.name || "avatar", mime);
      crop.layout();
      crop.bind();
      crop.draw();
      return crop;
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  }

  /** Отключает перетаскивание на время загрузки. */
  lock(): void {
    this.locked = true;
    this.drag = null;
    delete this.canvas.dataset.cursor;
  }

  /** Снимает блокировку, если сохранение не удалось. */
  unlock(): void {
    this.locked = false;
  }

  /** Убирает слушатели и объектный URL. */
  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    delete this.canvas.dataset.cursor;
    URL.revokeObjectURL(this.url);
  }

  /**
   * Отдаёт квадрат 512×512 в том же формате, что и исходный файл.
   *
   * @returns Файл для `updateAvatar` или `null`, если холст не смог собрать blob.
   */
  async toFile(): Promise<File | null> {
    const scale = this.image.naturalWidth / this.imageBox.w;
    let sx = (this.crop.x - this.imageBox.x) * scale;
    let sy = (this.crop.y - this.imageBox.y) * scale;
    let size = this.crop.size * scale;
    sx = clamp(sx, 0, Math.max(0, this.image.naturalWidth - 1));
    sy = clamp(sy, 0, Math.max(0, this.image.naturalHeight - 1));
    size = Math.max(1, Math.min(size, this.image.naturalWidth - sx, this.image.naturalHeight - sy));

    const out = document.createElement("canvas");
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.image, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT);

    const blob = await new Promise<Blob | null>((resolve) => {
      out.toBlob(resolve, this.mime, 0.92);
    });
    if (!blob) {
      return null;
    }
    return new File([blob], this.fileName, { type: this.mime });
  }

  private layout(): void {
    const pad = 12;
    const maxSide = VIEW - pad * 2;
    const scale = Math.min(maxSide / this.image.naturalWidth, maxSide / this.image.naturalHeight);
    const w = this.image.naturalWidth * scale;
    const h = this.image.naturalHeight * scale;
    this.imageBox = { x: (VIEW - w) / 2, y: (VIEW - h) / 2, w, h };
    const size = Math.min(w, h);
    this.crop = {
      x: this.imageBox.x + (w - size) / 2,
      y: this.imageBox.y + (h - size) / 2,
      size,
    };
  }

  private bind(): void {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
  }

  private point(event: PointerEvent): { x: number; y: number } | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      return null;
    }
    return {
      x: ((event.clientX - box.left) / box.width) * VIEW,
      y: ((event.clientY - box.top) / box.height) * VIEW,
    };
  }

  private hit(x: number, y: number): "move" | "resize" | null {
    const centerX = this.crop.x + this.crop.size / 2;
    const centerY = this.crop.y + this.crop.size / 2;
    const radius = this.crop.size / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    if (Math.abs(distance - radius) <= 14) {
      return "resize";
    }
    if (distance < radius - 14) {
      return "move";
    }
    return null;
  }

  private pointerDown(event: PointerEvent): void {
    if (this.locked || event.button !== 0) {
      return;
    }
    const point = this.point(event);
    if (!point) {
      return;
    }
    const mode = this.hit(point.x, point.y);
    if (!mode) {
      return;
    }
    event.preventDefault();
    this.drag = {
      mode,
      originX: point.x,
      originY: point.y,
      start: { ...this.crop },
    };
    this.canvas.dataset.cursor = mode;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Указатель уже отпущен: сдвиг всё равно считается по событиям холста.
    }
  }

  private pointerMove(event: PointerEvent): void {
    const point = this.point(event);
    if (!point) {
      return;
    }
    if (!this.drag) {
      if (this.locked) {
        return;
      }
      const mode = this.hit(point.x, point.y);
      if (mode) {
        this.canvas.dataset.cursor = mode;
      } else {
        delete this.canvas.dataset.cursor;
      }
      return;
    }
    if (this.drag.mode === "move") {
      this.moveBy(point.x - this.drag.originX, point.y - this.drag.originY);
    } else {
      this.resizeTo(point.x, point.y);
    }
    this.draw();
  }

  private pointerUp(event: PointerEvent): void {
    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Захват уже снят.
    }
    this.drag = null;
  }

  private moveBy(dx: number, dy: number): void {
    const start = this.drag?.start;
    if (!start) {
      return;
    }
    const maxX = this.imageBox.x + this.imageBox.w - start.size;
    const maxY = this.imageBox.y + this.imageBox.h - start.size;
    this.crop = {
      x: clamp(start.x + dx, this.imageBox.x, maxX),
      y: clamp(start.y + dy, this.imageBox.y, maxY),
      size: start.size,
    };
  }

  private resizeTo(x: number, y: number): void {
    const start = this.drag?.start;
    if (!start) {
      return;
    }
    const centerX = start.x + start.size / 2;
    const centerY = start.y + start.size / 2;
    const maxByBox = Math.min(
      (centerX - this.imageBox.x) * 2,
      (this.imageBox.x + this.imageBox.w - centerX) * 2,
      (centerY - this.imageBox.y) * 2,
      (this.imageBox.y + this.imageBox.h - centerY) * 2,
      this.imageBox.w,
      this.imageBox.h
    );
    const size = clamp(
      Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) * 2,
      MIN_SIZE,
      maxByBox
    );
    this.crop = { x: centerX - size / 2, y: centerY - size / 2, size };
  }

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const pixels = Math.round(VIEW * dpr);
    if (this.canvas.width !== pixels || this.canvas.height !== pixels) {
      this.canvas.width = pixels;
      this.canvas.height = pixels;
    }
    const ctx = this.ctx;
    ctx.setTransform(pixels / VIEW, 0, 0, pixels / VIEW, 0, 0);
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.fillStyle = "#e8eef6";
    ctx.fillRect(0, 0, VIEW, VIEW);
    ctx.drawImage(this.image, this.imageBox.x, this.imageBox.y, this.imageBox.w, this.imageBox.h);

    const centerX = this.crop.x + this.crop.size / 2;
    const centerY = this.crop.y + this.crop.size / 2;
    const radius = this.crop.size / 2;
    ctx.beginPath();
    ctx.rect(0, 0, VIEW, VIEW);
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(15, 33, 64, 0.55)";
    ctx.fill("evenodd");
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX + radius, centerY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#73b0ff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
