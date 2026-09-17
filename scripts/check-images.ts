import { PrismaClient } from "../src/generated/prisma";

async function main() {
  const p = new PrismaClient();
  const gpus = await p.part.findMany({
    where: { category: "GPU" },
    select: { brand: true, name: true, imageUrl: true },
    orderBy: { name: "asc" },
  });
  for (const g of gpus) {
    console.log(`${g.brand} ${g.name} -> ${g.imageUrl}`);
  }
  const bad = await p.part.count({
    where: { NOT: { imageUrl: { startsWith: "/parts/exact/" } } },
  });
  console.log("parts not on /parts/exact:", bad);
  await p.$disconnect();
}

main();
