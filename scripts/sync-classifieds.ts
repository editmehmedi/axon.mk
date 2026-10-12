import { loadClassifiedDrafts, refreshClassifiedListings } from "../src/lib/classifiedListings";

function summarize(label: string, ads: { category: string; name: string; priceMkd: number }[]) {
  const counts = new Map<string, number>();
  for (const ad of ads) counts.set(ad.category, (counts.get(ad.category) ?? 0) + 1);
  console.log(`\n${label}: ${ads.length}`);
  for (const [category, count] of [...counts.entries()].sort()) console.log(`  ${category} ${count}`);
  for (const ad of ads.slice(0, 8)) console.log(`  ${ad.priceMkd}  ${ad.category}  ${ad.name}`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) {
    const { reklama5, pazar3 } = await loadClassifiedDrafts();
    summarize("Reklama5", reklama5);
    summarize("Pazar3", pazar3);
    console.log("\nDry run. Pass --apply to save listings from the last 14 days.");
    return;
  }
  const result = await refreshClassifiedListings();
  console.log(result);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
