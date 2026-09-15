export const OUTER_R = 160;
export const INNER_R = 54;
export const ICON_R = 108;
export const GAP = (Math.PI / 180) * 3;

export type Wedge = {
  index: number;
  a0: number;
  a1: number;
  mid: number;
  iconX: number;
  iconY: number;
};

export function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

export function wedgePath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function layoutWedges(count: number): Wedge[] {
  const n = Math.max(count, 1);
  const sweep = (Math.PI * 2) / n;
  const gap = n === 1 ? 0.04 : Math.min(GAP, sweep * 0.18);
  return Array.from({ length: n }, (_, i) => {
    const start = -Math.PI / 2 - sweep / 2 + i * sweep;
    const a0 = start + gap / 2;
    const a1 = start + sweep - gap / 2;
    const mid = (a0 + a1) / 2;
    const [iconX, iconY] = polar(0, 0, ICON_R, mid);
    return { index: i, a0, a1, mid, iconX, iconY };
  });
}

export function hitWedge(
  x: number,
  y: number,
  cx: number,
  cy: number,
  wedges: Wedge[],
): number | null {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < INNER_R || dist > OUTER_R + 18) return null;
  let angle = Math.atan2(dy, dx);
  for (const w of wedges) {
    let a0 = w.a0;
    let a1 = w.a1;
    let a = angle;
    while (a < a0) a += Math.PI * 2;
    while (a0 > a1) a1 += Math.PI * 2;
    if (a >= a0 && a <= a1) return w.index;
  }
  return null;
}

export function hitCenter(x: number, y: number, cx: number, cy: number): boolean {
  return Math.hypot(x - cx, y - cy) <= INNER_R - 4;
}
