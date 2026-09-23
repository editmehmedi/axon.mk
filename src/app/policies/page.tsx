import { PoliciesView } from "@/components/PoliciesView";
import { prisma } from "@/lib/db";
import { publicPhone } from "@/lib/shopContact";

export default async function PoliciesPage() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return (
    <PoliciesView
      companyName={settings?.companyName?.trim() || "AXON.MK"}
      phone={publicPhone(settings?.supportPhone)}
      viber={publicPhone(settings?.supportViber)}
    />
  );
}
