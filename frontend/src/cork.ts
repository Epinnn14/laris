// A cork texture painted once on a canvas (the same recipe as the corkboard app), used as a
// repeating background. Falls back to a plain cork colour where canvas is missing.
let tile: string | null | undefined;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function corkTile(): string | null {
  if (tile !== undefined) return tile;
  tile = null;
  try {
    const size = 256;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return tile;
    c.width = c.height = size;
    const rnd = seeded(7);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const j = (rnd() - 0.5) * 34;
      img.data[i * 4] = 199 + j;
      img.data[i * 4 + 1] = 149 + j * 0.9;
      img.data[i * 4 + 2] = 89 + j * 0.8;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const speckle = (n: number, color: () => string, r: () => number) => {
      for (let i = 0; i < n; i++) {
        const x = rnd() * size, y = rnd() * size, rad = r(), rot = rnd() * Math.PI;
        ctx.fillStyle = color();
        for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, rad, rad * 0.7, rot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    speckle(1400, () => `rgba(${92 + rnd() * 30},${52 + rnd() * 20},20,${0.35 + rnd() * 0.4})`, () => 0.4 + rnd() * 1.4);
    speckle(700, () => `rgba(248,${214 + rnd() * 25},${160 + rnd() * 30},${0.3 + rnd() * 0.4})`, () => 0.4 + rnd() * 1.2);
    tile = c.toDataURL("image/png");
  } catch { /* plain colour then */ }
  return tile;
}
