interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Even-odd outer background rectangle with expanded overlap holes. */
export function backgroundClipPath(
  lens: Box,
  covers: Box[],
  margin: number,
  seam = 0.5,
): string {
  const width = lens.right - lens.left + margin * 2;
  const height = lens.bottom - lens.top + margin * 2;
  const parts = [`M0 0H${width}V${height}H0Z`];
  for (const cover of covers) {
    const left = Math.max(lens.left, cover.left);
    const top = Math.max(lens.top, cover.top);
    const right = Math.min(lens.right, cover.right);
    const bottom = Math.min(lens.bottom, cover.bottom);
    if (right <= left || bottom <= top) continue;
    const x1 = Math.max(0, left - lens.left + margin - seam);
    const y1 = Math.max(0, top - lens.top + margin - seam);
    const x2 = Math.min(width, right - lens.left + margin + seam);
    const y2 = Math.min(height, bottom - lens.top + margin + seam);
    parts.push(`M${x1} ${y1}H${x2}V${y2}H${x1}Z`);
  }
  return parts.join("");
}
