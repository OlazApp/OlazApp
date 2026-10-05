/**
 * Rasterises an inline SVG (by element id) to a PNG and downloads it.
 * Images inside the SVG are inlined as data URLs first, since an SVG drawn
 * through <img> may not fetch anything on its own.
 */
export async function downloadSvgAsPng(id: string, filename: string, width = 1080) {
  const svg = document.getElementById(id) as SVGSVGElement | null;
  if (!svg) throw new Error("Art not found");
  // Work on the serialized markup so the live element is never touched.
  let text = new XMLSerializer().serializeToString(svg);
  const hrefs = Array.from(new Set(Array.from(svg.querySelectorAll("image"), (img) => img.getAttribute("href") ?? "")));
  for (const href of hrefs) {
    if (!href || href.startsWith("data:")) continue;
    const blob = await (await fetch(href)).blob();
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    text = text.split(`href="${href}"`).join(`href="${data}"`);
  }
  const [, , vw, vh] = (svg.getAttribute("viewBox") ?? "0 0 600 750").split(" ").map(Number);
  const height = Math.round((width * vh) / vw);
  text = text.replace("<svg", `<svg width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"),
    );
    return { blob: png, save: () => save(png, filename) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function save(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
