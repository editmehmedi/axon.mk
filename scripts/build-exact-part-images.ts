/**
 * Build one unique catalog image per part:
 * correct product-family photo + exact product name plate.
 *
 * Run: npx tsx scripts/build-exact-part-images.ts
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { CATALOG_PARTS, exactPartImagePath, partSlug } from "../src/lib/exactParts";
import { resolveCaseImage } from "../src/lib/caseImages";

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "parts", "exact");
const PARTS = path.join(ROOT, "public", "parts");
const CASES = path.join(ROOT, "public", "cases");
const ASSETS = path.join(
  process.env.USERPROFILE || "",
  ".cursor",
  "projects",
  "c-Users-editm-OneDrive-Desktop-Axon-mk",
  "assets"
);

function exists(p: string) {
  return fs.existsSync(p);
}

function pickBase(p: { brand: string; name: string; category: string }): string {
  const brand = p.brand.toLowerCase();
  const name = p.name.toLowerCase();
  const slug = partSlug(p.brand, p.name);

  // Prefer per-SKU photo (assets first, then public/parts)
  for (const c of [path.join(ASSETS, `${slug}.png`), path.join(PARTS, `${slug}.png`)]) {
    if (exists(c)) return c;
  }

  if (p.category === "CASE") {
    const c = resolveCaseImage(`${p.brand} ${p.name}`).src.replace(/^\//, "");
    return path.join(ROOT, "public", c);
  }

  if (p.category === "CPU") {
    if (name.includes("5600x") && exists(path.join(PARTS, "amd-ryzen-5-5600x.png")))
      return path.join(PARTS, "amd-ryzen-5-5600x.png");
    if (name.includes("5600") && exists(path.join(PARTS, "amd-ryzen-5-5600.png")))
      return path.join(PARTS, "amd-ryzen-5-5600.png");
    if (name.includes("5500") && exists(path.join(PARTS, "amd-ryzen-5-5500.png")))
      return path.join(PARTS, "amd-ryzen-5-5500.png");
    if (name.includes("5800") && exists(path.join(PARTS, "amd-ryzen-7-5800x.png")))
      return path.join(PARTS, "amd-ryzen-7-5800x.png");
    if (name.includes("7800") && exists(path.join(PARTS, "amd-ryzen-7-7800x3d.png")))
      return path.join(PARTS, "amd-ryzen-7-7800x3d.png");
    if (name.includes("13400") && exists(path.join(PARTS, "intel-core-i5-13400f.png")))
      return path.join(PARTS, "intel-core-i5-13400f.png");
    if (name.includes("14700") && exists(path.join(PARTS, "intel-core-i7-14700k.png")))
      return path.join(PARTS, "intel-core-i7-14700k.png");
    return path.join(PARTS, brand.includes("intel") ? "cpu-intel.png" : "cpu-amd.png");
  }

  if (p.category === "GPU") {
    if (name.includes("4060 ti") && exists(path.join(PARTS, "nvidia-rtx-4060-ti-8gb.png")))
      return path.join(PARTS, "nvidia-rtx-4060-ti-8gb.png");
    if (name.includes("7600") && exists(path.join(PARTS, "gpu-rx7600.png")))
      return path.join(PARTS, "gpu-rx7600.png");
    if (name.includes("4070 super") && !name.includes("ti") && exists(path.join(PARTS, "gpu-rtx4070s.png")))
      return path.join(PARTS, "gpu-rtx4070s.png");
    if (name.includes("5080") && exists(path.join(PARTS, "gpu-rtx5080.png")))
      return path.join(PARTS, "gpu-rtx5080.png");
    if (brand.includes("amd") || name.startsWith("rx")) return path.join(PARTS, "gpu-amd.png");
    return path.join(PARTS, "gpu-nvidia.png");
  }

  if (p.category === "MOTHERBOARD") {
    if (name.includes("strix") || name.includes("a gaming")) return path.join(PARTS, "mb-white.png");
    return path.join(PARTS, "mb-black.png");
  }

  if (p.category === "RAM") {
    if (name.includes("vengeance") && exists(path.join(PARTS, "ram-vengeance.png")))
      return path.join(PARTS, "ram-vengeance.png");
    if (name.includes("trident") || name.includes("fury")) return path.join(PARTS, "ram-rgb.png");
    return path.join(PARTS, "ram-black.png");
  }

  if (p.category === "PSU") return path.join(PARTS, "psu.png");
  if (p.category === "SSD") {
    if (name.includes("990") && exists(path.join(PARTS, "ssd-990pro.png")))
      return path.join(PARTS, "ssd-990pro.png");
    return path.join(PARTS, "ssd.png");
  }
  if (p.category === "COOLER") {
    if (name.includes("liquid") || name.includes("kraken") || name.includes("240") || name.includes("360"))
      return path.join(PARTS, "cooler-aio.png");
    return path.join(PARTS, "cooler-air.png");
  }

  return path.join(PARTS, "ssd.png");
}

function labelSvg(brand: string, name: string, width: number, height: number) {
  const title = `${brand} ${name}`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fontSize = title.length > 36 ? 22 : title.length > 28 ? 26 : 30;
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="55%" stop-color="#070b12" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#070b12" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="24" y="${height - 110}" width="${width - 48}" height="74" rx="16" fill="#0c1420" fill-opacity="0.88" stroke="#22d3ee" stroke-opacity="0.35"/>
  <text x="48" y="${height - 68}" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#67e8f9" font-weight="600">AXON.MK</text>
  <text x="48" y="${height - 40}" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" fill="#e8eef7" font-weight="700">${title}</text>
</svg>`;
}

async function paddedSquare(basePath: string, size = 1000, pad = 56) {
  const inner = size - pad * 2;
  const content = await sharp(basePath)
    .resize(inner, inner, { fit: "contain", background: "#070b12" })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: "#070b12",
    },
  })
    .composite([{ input: content, left: pad, top: pad }])
    .png()
    .toBuffer();
}

async function buildOne(p: { brand: string; name: string; category: string }) {
  const slug = partSlug(p.brand, p.name);
  const outFile = path.join(OUT, `${slug}.png`);
  const basePath = pickBase(p);
  if (!exists(basePath)) {
    console.warn("Missing base for", slug, basePath);
    return;
  }

  // Cases + CPU tray renders: keep full branding visible with safe margins (no crop/zoom)
  if (p.category === "CASE" || p.category === "CPU") {
    await sharp(await paddedSquare(basePath, 1000, p.category === "CPU" ? 64 : 40)).toFile(outFile);
    return;
  }

  // Other parts fill more of the frame, keep name plate
  const filled = await paddedSquare(basePath, 1000, 28);
  const overlay = Buffer.from(labelSvg(p.brand, p.name, 1000, 1000));
  await sharp(filled)
    .composite([{ input: await sharp(overlay).png().toBuffer(), top: 0, left: 0 }])
    .png()
    .toFile(outFile);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Include cases from seed as well
  const cases = [
    { brand: "Corsair", name: "4000D Airflow", category: "CASE" },
    { brand: "Corsair", name: "5000D Airflow", category: "CASE" },
    { brand: "Lian Li", name: "Lancool 216", category: "CASE" },
    { brand: "Lian Li", name: "O11 Dynamic Evo", category: "CASE" },
    { brand: "Fractal", name: "Meshify 2 Compact", category: "CASE" },
    { brand: "Fractal", name: "North XL", category: "CASE" },
    { brand: "NZXT", name: "H5 Flow", category: "CASE" },
    { brand: "MSI", name: "MAG Forge 100R", category: "CASE" },
  ];

  const all = [...CATALOG_PARTS, ...cases];
  for (const p of all) {
    await buildOne(p);
    console.log("built", exactPartImagePath(p.brand, p.name));
  }
  console.log(`Done: ${all.length} exact item images`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
