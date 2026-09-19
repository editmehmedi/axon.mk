/**
 * Download Anhoch catalog photos from this machine (Vercel IPs get 403)
 * and store them under /public/anhoch, then rewrite DB imageUrl values.
 *
 *   npx tsx scripts/rehost-anhoch-images.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../src/generated/prisma";

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "anhoch");
const MAP_FILE = path.join(OUT, "map.json");
const ANOCH_HOSTS = new Set(["www.anhoch.com", "anhoch.com"]);
const APPLY = process.argv.includes("--apply");

function loadEnvFile(file: string, overwrite = false) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (overwrite || !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, ".env.seed"), true);

function isAnhochUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ANOCH_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function safeName(url: string, used: Set<string>): string {
  const u = new URL(url);
  const base = path.basename(u.pathname).replace(/[^\w.\-]+/g, "-") || "image.jpg";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const stamp = Buffer.from(url).toString("base64url").slice(0, 10);
  const ext = path.extname(base) || ".jpg";
  const name = `${path.basename(base, ext)}-${stamp}${ext}`;
  used.add(name);
  return name;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function download(url: string): Promise<{ bytes: Buffer; type: string } | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.anhoch.com/",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (res.status === 403 || res.status === 429) {
        await sleep(800 * attempt);
        continue;
      }
      if (!res.ok) {
        console.warn(`  skip ${res.status} ${url}`);
        return null;
      }
      const type = res.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) {
        console.warn(`  skip non-image ${type} ${url}`);
        return null;
      }
      return { bytes: Buffer.from(await res.arrayBuffer()), type };
    } catch (e) {
      console.warn(`  retry ${attempt} ${url} ${(e as Error).message}`);
      await sleep(800 * attempt);
    }
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing (.env.seed)");
  }

  fs.mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient();

  const [parts, prebuilts, listings] = await Promise.all([
    prisma.part.findMany({ select: { id: true, imageUrl: true } }),
    prisma.prebuilt.findMany({ select: { id: true, imageUrl: true } }),
    prisma.userListing.findMany({ select: { id: true, imageUrl: true } }),
  ]);

  const rows: { table: "part" | "prebuilt" | "listing"; id: string; url: string }[] = [];
  for (const p of parts) {
    if (p.imageUrl && isAnhochUrl(p.imageUrl)) rows.push({ table: "part", id: p.id, url: p.imageUrl });
  }
  for (const p of prebuilts) {
    if (p.imageUrl && isAnhochUrl(p.imageUrl)) {
      rows.push({ table: "prebuilt", id: p.id, url: p.imageUrl });
    }
  }
  for (const p of listings) {
    if (p.imageUrl && isAnhochUrl(p.imageUrl)) {
      rows.push({ table: "listing", id: p.id, url: p.imageUrl });
    }
  }

  const unique = [...new Set(rows.map((r) => r.url))];
  console.log(`Anhoch URLs: ${unique.length} unique across ${rows.length} rows`);

  const used = new Set<string>(fs.readdirSync(OUT).filter((f) => f !== "map.json"));
  const map: Record<string, string> = fs.existsSync(MAP_FILE)
    ? (JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) as Record<string, string>)
    : {};

  if (!APPLY) {
    let i = 0;
    for (const url of unique) {
      i += 1;
      if (map[url] && fs.existsSync(path.join(ROOT, "public", map[url].replace(/^\//, "")))) {
        if (i % 25 === 0 || i === unique.length) {
          console.log(`  ${i}/${unique.length}  (${Object.keys(map).length} saved)`);
        }
        continue;
      }
      const name = safeName(url, used);
      const dest = path.join(OUT, name);
      if (!fs.existsSync(dest)) {
        const file = await download(url);
        if (!file) continue;
        fs.writeFileSync(dest, file.bytes);
        await sleep(180);
      }
      map[url] = `/anhoch/${name}`;
      if (i % 25 === 0 || i === unique.length) {
        console.log(`  ${i}/${unique.length}  (${Object.keys(map).length} saved)`);
      }
    }
    fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
    console.log(`Downloaded. Run again with --apply after the files are on Vercel.`);
    await prisma.$disconnect();
    return;
  }

  if (!Object.keys(map).length) {
    throw new Error("No map.json — run without --apply first");
  }

  let updated = 0;
  for (const row of rows) {
    const next = map[row.url];
    if (!next) continue;
    if (row.table === "part") {
      await prisma.part.update({ where: { id: row.id }, data: { imageUrl: next } });
    } else if (row.table === "prebuilt") {
      await prisma.prebuilt.update({ where: { id: row.id }, data: { imageUrl: next } });
    } else {
      await prisma.userListing.update({ where: { id: row.id }, data: { imageUrl: next } });
    }
    updated += 1;
  }

  console.log(`Updated ${updated} rows. Files in public/anhoch: ${fs.readdirSync(OUT).length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
