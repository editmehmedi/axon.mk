import path from "path";
import { PrismaClient } from "../src/generated/prisma";
import { loadAnhochCpus } from "./anhochCpus";
import { STOCK_COOLER_PART } from "./anhochInventory";

const prisma = new PrismaClient();

async function main() {
  const cpus = loadAnhochCpus(path.join(process.cwd(), "anhoch_cpus.csv"));
  const existing = await prisma.part.findMany({ where: { category: "CPU" } });
  let updated = 0;

  for (const p of existing) {
    const base = p.name.split(" (")[0].trim();
    const match = cpus.find(
      (c) =>
        c.brand === p.brand &&
        c.priceMkd === p.priceMkd &&
        (c.name === p.name || c.name.startsWith(base)),
    );
    if (!match) continue;
    if (p.name !== match.name || p.includesCooler !== match.includesCooler) {
      await prisma.part.update({
        where: { id: p.id },
        data: { name: match.name, includesCooler: match.includesCooler },
      });
      updated++;
    }
  }

  const stock = await prisma.part.findFirst({
    where: { brand: "OEM", name: "Included stock cooler" },
  });
  if (!stock) {
    await prisma.part.create({ data: { ...STOCK_COOLER_PART, active: true } });
    console.log("created stock cooler");
  }

  const withCooler = await prisma.part.count({
    where: { category: "CPU", includesCooler: true },
  });
  const noCooler = await prisma.part.count({
    where: { category: "CPU", includesCooler: false },
  });
  const sample = await prisma.part.findMany({
    where: { category: "CPU", name: { contains: "Ryzen 5" } },
    select: { name: true, includesCooler: true },
    orderBy: { name: "asc" },
  });
  console.log(JSON.stringify({ updated, withCooler, noCooler, sample }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
