import { prisma } from "@/lib/db";
import { HomeView } from "@/components/HomeView";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const prebuilts = await prisma.prebuilt.findMany({
    where: { active: true, condition: "new" },
    orderBy: { priceMkd: "asc" },
    take: 3,
  });
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const fee = settings?.assemblyFeeMkd ?? 2999;

  return <HomeView prebuilts={prebuilts} fee={fee} />;
}
