import path from "path";
import { PrismaClient } from "../src/generated/prisma";
import { loadAnhochCoolers, coolerSupportsSocket } from "./anhochInventory";

const prisma = new PrismaClient();

async function main() {
  const fromCsv = loadAnhochCoolers(path.join(process.cwd(), "anhoch_coolers_fans.csv"));
  const dbCoolers = await prisma.part.findMany({ where: { category: "COOLER" } });
  let updated = 0;

  for (const db of dbCoolers) {
    if (db.brand === "OEM") continue;
    const match =
      fromCsv.find(
        (c) =>
          c.brand === db.brand &&
          c.priceMkd === db.priceMkd &&
          (c.name === db.name ||
            db.name.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()) ||
            c.name.toLowerCase().includes(db.name.split(" ")[0].toLowerCase())),
      ) ?? fromCsv.find((c) => c.brand === db.brand && c.priceMkd === db.priceMkd);

    if (!match) continue;
    await prisma.part.update({
      where: { id: db.id },
      data: {
        socket: match.socket ?? null,
        tdpWatts: match.tdpWatts ?? null,
      },
    });
    updated++;
  }

  const ck = await prisma.part.findMany({
    where: { category: "COOLER", name: { contains: "CK" } },
    select: { name: true, brand: true, socket: true, tdpWatts: true },
  });
  const cpu = await prisma.part.findFirst({
    where: { category: "CPU", name: { contains: "7500F" } },
    select: { name: true, socket: true, tdpWatts: true, includesCooler: true },
  });

  console.log(
    JSON.stringify(
      {
        updated,
        cpu,
        ck,
        ckFits7500F: ck.map((c) => ({
          name: c.name,
          socketOk: coolerSupportsSocket(c.socket, cpu?.socket),
          tdp: c.tdpWatts,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
