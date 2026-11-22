/**
 * Hexagon binning for lead density (the idea behind Uber's H3 grid, without
 * the dependency): every point falls into one flat-topped hexagon of a fixed
 * size, so areas can be compared by count.
 */
export interface HexCell {
  id: string;
  /** Centre as [lat, lng]. */
  center: [number, number];
  /** Six corners as [lat, lng]. */
  corners: number[][];
  count: number;
  itemIds: string[];
}

const M_PER_DEG_LAT = (6_371_000 * Math.PI) / 180;

function axialRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

/**
 * Group points into hexagons whose corners are `sizeM` metres from the centre
 * (≈ 2 × sizeM across). Returns occupied cells only, busiest first.
 */
export function hexBin(points: { id: string; latitude: number; longitude: number }[], sizeM = 600): HexCell[] {
  if (points.length === 0) return [];
  const refLat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const kx = Math.cos((refLat * Math.PI) / 180) * M_PER_DEG_LAT;
  const ky = M_PER_DEG_LAT;

  const cells = new Map<string, HexCell>();
  for (const p of points) {
    const x = p.longitude * kx;
    const y = p.latitude * ky;
    const [q, r] = axialRound(((2 / 3) * x) / sizeM, ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / sizeM);
    const id = `${q}:${r}`;
    let cell = cells.get(id);
    if (!cell) {
      const cx = sizeM * 1.5 * q;
      const cy = sizeM * Math.sqrt(3) * (r + q / 2);
      const corners: number[][] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        corners.push([(cy + sizeM * Math.sin(angle)) / ky, (cx + sizeM * Math.cos(angle)) / kx]);
      }
      cell = { id, center: [cy / ky, cx / kx], corners, count: 0, itemIds: [] };
      cells.set(id, cell);
    }
    cell.count += 1;
    cell.itemIds.push(p.id);
  }
  return Array.from(cells.values()).sort((a, b) => b.count - a.count);
}
