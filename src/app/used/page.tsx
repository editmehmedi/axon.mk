"use client";

import { PrebuiltCatalog } from "@/components/PrebuiltCatalog";

export default function UsedPcsPage() {
  return (
    <PrebuiltCatalog
      condition="used"
      basePath="/used"
      titleKey="used.title"
      descKey="used.desc"
    />
  );
}
