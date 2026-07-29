/**
 * Browser-side helpers for element-sized SVG displacement and specular maps.
 * Copy or import this module, then connect its data URLs to SVG <feImage> nodes.
 */

export function createLiquidGlassMaps(width, height, options = {}) {
  const cssWidth = Math.max(1, Math.round(width));
  const cssHeight = Math.max(1, Math.round(height));
  const resolution = clamp(options.resolution ?? Math.min(window.devicePixelRatio || 1, 2), 1, 2);
  const pixelWidth = Math.max(1, Math.round(cssWidth * resolution));
  const pixelHeight = Math.max(1, Math.round(cssHeight * resolution));
  const displacementCanvas = createCanvas(pixelWidth, pixelHeight);
  const specularCanvas = createCanvas(pixelWidth, pixelHeight);
  const activeSpecularCanvas = createCanvas(pixelWidth, pixelHeight);
  const displacementContext = displacementCanvas.getContext("2d");
  const specularContext = specularCanvas.getContext("2d");
  const activeSpecularContext = activeSpecularCanvas.getContext("2d");

  if (!displacementContext || !specularContext || !activeSpecularContext) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const displacement = displacementContext.createImageData(pixelWidth, pixelHeight);
  const specular = specularContext.createImageData(pixelWidth, pixelHeight);
  const activeSpecular = activeSpecularContext.createImageData(pixelWidth, pixelHeight);
  const halfWidth = cssWidth / 2;
  const halfHeight = cssHeight / 2;
  const radius = Math.max(1, Math.min(options.radius ?? halfHeight - 1, halfHeight));
  const bezel = Math.max(1, options.bezel ?? Math.min(13, cssHeight * 0.29));
  const lightX = options.lightX ?? 0.5;
  const lightY = options.lightY ?? -0.866;
  const normalAlpha = options.specularAlpha ?? 34;
  const activeAlpha = options.activeSpecularAlpha ?? 54;

  fillNeutralDisplacement(displacement.data);

  for (let py = 0; py < pixelHeight; py += 1) {
    for (let px = 0; px < pixelWidth; px += 1) {
      const x = (px + 0.5) / resolution - halfWidth;
      const y = (py + 0.5) / resolution - halfHeight;
      const distance = roundedRectDistance(x, y, halfWidth, halfHeight, radius);
      if (distance > 0) continue;

      const rim = 1 - smoothStep(0, bezel, -distance);
      if (rim <= 0) continue;

      const gradientX =
        roundedRectDistance(x + 0.5, y, halfWidth, halfHeight, radius) -
        roundedRectDistance(x - 0.5, y, halfWidth, halfHeight, radius);
      const gradientY =
        roundedRectDistance(x, y + 0.5, halfWidth, halfHeight, radius) -
        roundedRectDistance(x, y - 0.5, halfWidth, halfHeight, radius);
      const gradientLength = Math.hypot(gradientX, gradientY) || 1;
      const normalX = gradientX / gradientLength;
      const normalY = gradientY / gradientLength;
      const strength = Math.pow(rim, options.rimExponent ?? 1.35);
      const offset = (py * pixelWidth + px) * 4;

      displacement.data[offset] = Math.round(128 - normalX * strength * 127);
      displacement.data[offset + 1] = Math.round(128 - normalY * strength * 127);

      const light = Math.pow(Math.max(0, normalX * lightX + normalY * lightY), 1.8);
      const highlight = Math.pow(rim, 1.5) * light;
      writeSpecular(specular.data, offset, highlight, normalAlpha);
      writeSpecular(activeSpecular.data, offset, highlight, activeAlpha);
    }
  }

  displacementContext.putImageData(displacement, 0, 0);
  specularContext.putImageData(specular, 0, 0);
  activeSpecularContext.putImageData(activeSpecular, 0, 0);

  return {
    width: cssWidth,
    height: cssHeight,
    displacement: displacementCanvas.toDataURL("image/png"),
    specular: specularCanvas.toDataURL("image/png"),
    activeSpecular: activeSpecularCanvas.toDataURL("image/png"),
  };
}

export function applyLiquidGlassMaps(maps, nodes) {
  for (const filter of [nodes.filter, nodes.activeFilter]) {
    filter?.setAttribute("width", String(maps.width));
    filter?.setAttribute("height", String(maps.height));
  }

  for (const image of [nodes.map, nodes.activeMap, nodes.specular, nodes.activeSpecular]) {
    image?.setAttribute("width", String(maps.width));
    image?.setAttribute("height", String(maps.height));
  }

  setImageHref(nodes.map, maps.displacement);
  setImageHref(nodes.activeMap, maps.displacement);
  setImageHref(nodes.specular, maps.specular);
  setImageHref(nodes.activeSpecular, maps.activeSpecular);
}

export function observeLiquidGlassElement(element, update, options) {
  let lastWidth = 0;
  let lastHeight = 0;

  const refresh = () => {
    const { width, height } = element.getBoundingClientRect();
    const roundedWidth = Math.max(1, Math.round(width));
    const roundedHeight = Math.max(1, Math.round(height));
    if (roundedWidth === lastWidth && roundedHeight === lastHeight) return;
    lastWidth = roundedWidth;
    lastHeight = roundedHeight;
    update(createLiquidGlassMaps(roundedWidth, roundedHeight, options));
  };

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(refresh) : null;
  observer?.observe(element);
  window.addEventListener("resize", refresh, { passive: true });
  refresh();

  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", refresh);
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fillNeutralDisplacement(pixels) {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 128;
    pixels[offset + 1] = 128;
    pixels[offset + 2] = 128;
    pixels[offset + 3] = 255;
  }
}

function roundedRectDistance(x, y, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x) - halfWidth + radius;
  const qy = Math.abs(y) - halfHeight + radius;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

function smoothStep(minimum, maximum, value) {
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function writeSpecular(pixels, offset, strength, maximumAlpha) {
  pixels[offset] = 218;
  pixels[offset + 1] = 236;
  pixels[offset + 2] = 242;
  pixels[offset + 3] = Math.round(strength * maximumAlpha);
}

function setImageHref(image, value) {
  image?.setAttribute("href", value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
