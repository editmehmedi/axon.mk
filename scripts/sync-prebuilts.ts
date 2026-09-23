import { prisma } from "../src/lib/db";
import { buildPrebuiltLineup } from "../src/lib/prebuiltFromParts";

async function main() {
  const apply = process.argv.includes("--apply");
  const parts = await prisma.part.findMany({ where: { active: true } });
  const existing = await prisma.prebuilt.findMany({
    where: { condition: "new" },
    orderBy: { priceMkd: "asc" },
  });
  const lineup = buildPrebuiltLineup(parts, existing.length);

  console.log(`parts ${parts.length}  prebuilts ${existing.length}  builds ${lineup.length}`);
  lineup.forEach((pc, i) => {
    const slot = existing[i];
    console.log(
      `\n${i + 1}. ${slot?.name ?? "?"}  parts ${pc.partsCostMkd}  price ${pc.priceMkd}`,
    );
    console.log(`  CPU ${pc.cpuLabel}`);
    console.log(`  COOLER ${pc.coolerLabel}`);
    console.log(`  MB ${pc.motherboardLabel}`);
    console.log(`  RAM ${pc.ramLabel}`);
    console.log(`  GPU ${pc.gpuLabel}`);
    console.log(`  SSD ${pc.ssdLabel}`);
    console.log(`  PSU ${pc.psuLabel}`);
    console.log(`  CASE ${pc.caseLabel}`);
  });

  if (!apply) {
    console.log("\nDry run. Pass --apply to update the database.");
    return;
  }

  const count = Math.min(existing.length, lineup.length);
  for (let i = 0; i < count; i++) {
    const pc = lineup[i];
    await prisma.prebuilt.update({
      where: { id: existing[i].id },
      data: {
        cpuLabel: pc.cpuLabel,
        coolerLabel: pc.coolerLabel,
        motherboardLabel: pc.motherboardLabel,
        ramLabel: pc.ramLabel,
        gpuLabel: pc.gpuLabel,
        ssdLabel: pc.ssdLabel,
        psuLabel: pc.psuLabel,
        caseLabel: pc.caseLabel,
        imageUrl: pc.imageUrl,
        priceMkd: pc.priceMkd,
      },
    });
  }
  console.log(`\nUpdated ${count} prebuilt PCs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
