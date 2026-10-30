/** Paint the existing landing's SVG assets and measured layout into a standard 2D texture. */
export function paintLanding(source: HTMLElement, canvas: HTMLCanvasElement, background: HTMLImageElement, ratio: number, gridMotion = {x: 0, y: 0}) {
  const scene = source.querySelector<HTMLElement>('.landing-scene')!;
  const bounds = scene.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width * ratio)), height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.textAlign = 'start';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(background, 0, 0, bounds.width, bounds.height);
  const rect = (element: Element) => {
    const r = element.getBoundingClientRect();
    return {x: r.left - bounds.left, y: r.top - bounds.top, width: r.width, height: r.height};
  };
  const drawImage = (image: HTMLImageElement) => {
    const r = rect(image);
    ctx.drawImage(image, r.x, r.y, r.width, r.height);
  };
  ctx.globalCompositeOperation = 'overlay';
  const grid = source.querySelector<HTMLImageElement>('.landing-grid')!;
  const gridRect = rect(grid);
  // Draw the vector directly at display resolution, including neighboring copies only
  // where drift uncovers an edge. Avoid a fixed-resolution raster pattern on Retina.
  const gridX = gridRect.x + gridMotion.x, gridY = gridRect.y + gridMotion.y;
  for (let y = gridY - Math.ceil(gridY / gridRect.height) * gridRect.height; y < bounds.height; y += gridRect.height) {
    for (let x = gridX - Math.ceil(gridX / gridRect.width) * gridRect.width; x < bounds.width; x += gridRect.width) {
      ctx.drawImage(grid, x, y, gridRect.width, gridRect.height);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  const scale = new DOMMatrixReadOnly(getComputedStyle(source.querySelector('.landing-design-plane')!).transform).a;
  // Preserve the DOM's painter order, including captions between the exported SVG layers.
  for (const layer of source.querySelectorAll<HTMLImageElement | HTMLSpanElement>('.landing-logo-layer,.landing-logo-caption')) {
    if (layer instanceof HTMLImageElement) {drawImage(layer);continue;}
    const r = rect(layer), style = getComputedStyle(layer);
    const gradient = ctx.createLinearGradient(r.x, r.y, r.x + r.width * 1.1143, r.y);
    gradient.addColorStop(0, layer.classList.contains('landing-logo-trademark') ? '#24282a70' : '#24282a');
    gradient.addColorStop(1, layer.classList.contains('landing-logo-trademark') ? '#7b8990ad' : '#7b8990');
    ctx.fillStyle = gradient;
    ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const text = layer.textContent || '', metrics = ctx.measureText(text);
    ctx.fillText(text, r.x, r.y + metrics.actualBoundingBoxAscent);
  }
  const button = source.querySelector<HTMLElement>('.landing-start-art')!;
  const r = rect(button), style = getComputedStyle(button);
  const border = parseFloat(style.borderTopWidth) * scale;
  const gradient = ctx.createLinearGradient(r.x, r.y, r.x + r.width, r.y - r.width * .177);
  for (const [offset, color] of [[0,'#fff0cd'],[.69887,'#fff0cd'],[.97746,'#f3bf46']] as const) gradient.addColorStop(offset, color);
  ctx.beginPath();
  ctx.roundRect(r.x + border/2, r.y + border/2, r.width - border, r.height - border, parseFloat(style.borderRadius) * scale);
  ctx.fillStyle = gradient;ctx.fill();ctx.lineWidth = border;ctx.strokeStyle = style.borderTopColor;ctx.stroke();
  ctx.fillStyle = style.color;
  ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
  ctx.textAlign = 'center';ctx.textBaseline = 'middle';
  ctx.fillText('START', r.x + r.width/2, r.y + r.height/2);
  for (const bar of source.querySelectorAll<HTMLElement>('.landing-metal-bar')) {
    const r = rect(bar), gradient = ctx.createLinearGradient(0, 0, bounds.width, 0);
    for (const [offset, color] of [[0,'#949eb7'],[.46016,'#adbcd3'],[.60708,'#d7e0f1'],[.71533,'#bbc9e3'],[1,'#62708a']] as const) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = '#0007';
    ctx.fillRect(r.x, bar.classList.contains('landing-metal-top') ? r.y + r.height - 2.932 : r.y, r.width, 2.932);
  }
}
