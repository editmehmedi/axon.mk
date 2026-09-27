"use client";

import { PrebuiltCatalog } from "@/components/PrebuiltCatalog";

export default function PrebuiltsPage() {
  return (
    <PrebuiltCatalog
      basePath="/prebuilts"
      titleKey="prebuilts.title"
      descKey="prebuilts.desc"
    />
  );
}
