import path from "path";
import crypto from "crypto";
import { PrismaClient, Role, OrderStatus } from "../src/generated/prisma";
import bcrypt from "bcryptjs";
import { exactPartImagePath } from "../src/lib/exactParts";
import { loadAllAnhochParts } from "./anhochInventory";

const prisma = new PrismaClient();

async function main() {
  await prisma.statusEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.userListing.deleteMany();
  await prisma.part.deleteMany();
  await prisma.prebuilt.deleteMany();
  await prisma.user.deleteMany();
  await prisma.siteSettings.deleteMany();

  await prisma.siteSettings.create({
    data: {
      id: 1,
      assemblyFeeMkd: 2999,
      currency: "MKD",
      companyName: "AXON.MK",
      supportPhone: "+389 70 123 456",
      supportViber: "+389 70 123 456",
    },
  });

  const seedPassword = process.env.SEED_PASSWORD || crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  await prisma.user.create({
    data: {
      email: "owner@axon.mk",
      name: "Head Admin",
      phone: "+38970111111",
      passwordHash,
      role: Role.head_admin,
      isHeadAdmin: true,
    },
  });

  await prisma.user.create({
    data: {
      email: "admin@axon.mk",
      name: "Store Admin",
      phone: "+38970222222",
      passwordHash,
      role: Role.admin,
    },
  });

  await prisma.user.create({
    data: {
      email: "user@axon.mk",
      name: "Demo User",
      phone: "+38970333333",
      passwordHash,
      role: Role.user,
    },
  });

  const root = process.cwd();
  const parts = loadAllAnhochParts({
    cpus: path.join(root, "anhoch_cpus.csv"),
    extraCpus: [
      path.join(root, "setec_cpus.csv"),
      path.join(root, "gjirafa_cpus.csv"),
      path.join(root, "neptun_cpus.csv"),
    ],
    motherboards: path.join(root, "anhoch_motherboards.csv"),
    gpus: path.join(root, "anhoch_gpus.csv"),
    extraGpus: [
      path.join(root, "setec_gpus.csv"),
      path.join(root, "gjirafa_gpus.csv"),
      path.join(root, "neptun_gpus.csv"),
    ],
    rams: path.join(root, "anhoch_rams.csv"),
    extraRams: [
      path.join(root, "setec_rams.csv"),
      path.join(root, "gjirafa_rams.csv"),
      path.join(root, "neptun_rams.csv"),
    ],
    psus: path.join(root, "anhoch_psus.csv"),
    cases: path.join(root, "anhoch_cases.csv"),
    ssds: path.join(root, "anhoch_ssds.csv"),
    hdds: path.join(root, "anhoch_hdds.csv"),
    coolers: path.join(root, "anhoch_coolers_fans.csv"),
  });

  console.log(
    `Seeding ${parts.length} parts (CPU/GPU/RAM merged cheapest across Anhoch+Setec+Gjirafa+Neptun)`,
  );

  for (const part of parts) {
    const { source: _source, ...rest } = part;
    await prisma.part.create({
      data: {
        ...rest,
        imageUrl: rest.imageUrl || exactPartImagePath(rest.brand, rest.name),
      },
    });
  }

  // 20 ready-to-ship builds, cheapest → most expensive (MKD)
  const prebuilts = [
    {
      slug: "axon-office-lite",
      name: "Axon Office Lite",
      description: "Quiet everyday PC for browsing, Office and school work.",
      cpuLabel: "Athlon 3000G",
      coolerLabel: "Stock cooler",
      motherboardLabel: "A320M AM4",
      ramLabel: "8GB DDR4-2666",
      gpuLabel: "Radeon Vega 3 (iGPU)",
      ssdLabel: "256GB SATA SSD",
      psuLabel: "400W 80+ Bronze",
      caseLabel: "Fury Shobo SH4 RGB",
      imageUrl: "https://www.anhoch.com/storage/media/nfo-2153.jpg",
      priceMkd: 18990,
      stock: 10,
      deliveryHours: 24,
    },
    {
      slug: "axon-study-basic",
      name: "Axon Study Basic",
      description: "Budget APU build for Zoom, documents and light multitasking.",
      cpuLabel: "Ryzen 3 3200G",
      coolerLabel: "Stock Wraith Stealth",
      motherboardLabel: "B450M AM4",
      ramLabel: "16GB DDR4-3200",
      gpuLabel: "Radeon Vega 8 (iGPU)",
      ssdLabel: "512GB SATA SSD",
      psuLabel: "450W 80+ Bronze",
      caseLabel: "White Shark Warhead ARGB",
      imageUrl: "https://www.anhoch.com/storage/media/gcc-2401b.jpg",
      priceMkd: 24990,
      stock: 8,
      deliveryHours: 24,
    },
    {
      slug: "axon-home-essentials",
      name: "Axon Home Essentials",
      description: "Entry discrete GPU for casual games and media at 1080p.",
      cpuLabel: "Core i3-12100F",
      coolerLabel: "Stock Intel cooler",
      motherboardLabel: "H610M LGA1700",
      ramLabel: "16GB DDR4-3200",
      gpuLabel: "GT 710 2GB",
      ssdLabel: "512GB NVMe",
      psuLabel: "450W 80+ Bronze",
      caseLabel: "Genesis Irid 503 V2",
      imageUrl: "https://www.anhoch.com/storage/media/npc1558.jpg",
      priceMkd: 28990,
      stock: 7,
      deliveryHours: 24,
    },
    {
      slug: "axon-starter",
      name: "Axon Starter",
      description: "Ideal first gaming PC — solid 1080p and everyday work.",
      cpuLabel: "Ryzen 5 5500",
      coolerLabel: "Tower air cooler 120mm",
      motherboardLabel: "B550M AM4",
      ramLabel: "16GB DDR4-3200",
      gpuLabel: "RTX 3050 6GB",
      ssdLabel: "1TB NVMe",
      psuLabel: "550W 80+ Bronze",
      caseLabel: "Deepcool CH260 Black",
      imageUrl: "https://www.anhoch.com/storage/media/r-ch260-bkngm0-g-1-01.jpg",
      priceMkd: 39990,
      stock: 6,
      deliveryHours: 24,
    },
    {
      slug: "axon-1080p-gamer",
      name: "Axon 1080p Gamer",
      description: "Smooth 1080p gaming with ray tracing and DLSS.",
      cpuLabel: "Ryzen 5 5500",
      coolerLabel: "Tower air cooler 120mm",
      motherboardLabel: "B550 AM4",
      ramLabel: "16GB DDR4-3600",
      gpuLabel: "RTX 5050 8GB",
      ssdLabel: "1TB NVMe",
      psuLabel: "650W 80+ Gold",
      caseLabel: "Thermaltake S200 TG ARGB",
      imageUrl: "https://www.anhoch.com/storage/media/ca1x200m1wn00.jpg",
      priceMkd: 45990,
      stock: 6,
      deliveryHours: 24,
    },
    {
      slug: "axon-value-fighter",
      name: "Axon Value Fighter",
      description: "Best bang-for-buck midrange for modern titles at 1080p/1440p.",
      cpuLabel: "Core i5-14400F",
      coolerLabel: "Dual-tower air cooler",
      motherboardLabel: "B760M LGA1700",
      ramLabel: "32GB DDR5-5600",
      gpuLabel: "RTX 5050 8GB",
      ssdLabel: "1TB NVMe Gen4",
      psuLabel: "650W 80+ Gold",
      caseLabel: "Thermaltake View 200 TG ARGB",
      imageUrl: "https://www.anhoch.com/storage/media/ca1x300m1wn00.jpg",
      priceMkd: 52990,
      stock: 5,
      deliveryHours: 24,
    },
    {
      slug: "axon-esports-entry",
      name: "Axon Esports Entry",
      description: "High-FPS competitive gaming with fast AM5 platform.",
      cpuLabel: "Ryzen 5 7500F",
      coolerLabel: "Dual-tower air cooler",
      motherboardLabel: "B650M AM5",
      ramLabel: "32GB DDR5-6000",
      gpuLabel: "RTX 5060 8GB",
      ssdLabel: "1TB NVMe Gen4",
      psuLabel: "650W 80+ Gold",
      caseLabel: "Deepcool CH270 Digital Black",
      imageUrl: "https://www.anhoch.com/storage/media/r-ch270-bkndm0-g-1.jpg",
      priceMkd: 58990,
      stock: 5,
      deliveryHours: 24,
    },
    {
      slug: "axon-esports-pro",
      name: "Axon Esports Pro",
      description: "High FPS competitive gaming at 1440p with RTX 5060 Ti.",
      cpuLabel: "Core i5-14400F",
      coolerLabel: "240mm AIO liquid cooler",
      motherboardLabel: "B760 LGA1700",
      ramLabel: "32GB DDR5-5600",
      gpuLabel: "RTX 5060 Ti 8GB",
      ssdLabel: "1TB NVMe Gen4",
      psuLabel: "750W 80+ Gold",
      caseLabel: "Genesis Irid 505 V2 ARGB",
      imageUrl: "https://www.anhoch.com/storage/media/npc1518.jpg",
      priceMkd: 64990,
      stock: 4,
      deliveryHours: 24,
    },
    {
      slug: "axon-1440p-pulse",
      name: "Axon 1440p Pulse",
      description: "Balanced 1440p gaming and streaming without compromise.",
      cpuLabel: "Ryzen 5 7600",
      coolerLabel: "240mm AIO liquid cooler",
      motherboardLabel: "B650 AM5",
      ramLabel: "32GB DDR5-6000",
      gpuLabel: "RTX 5060 Ti 8GB",
      ssdLabel: "1TB NVMe Gen4",
      psuLabel: "750W 80+ Gold",
      caseLabel: "Corsair 3000D Airflow White",
      imageUrl: "https://www.anhoch.com/storage/media/cc9011252ww_1.jpg",
      priceMkd: 71990,
      stock: 4,
      deliveryHours: 24,
    },
    {
      slug: "axon-creator-draft",
      name: "Axon Creator Draft",
      description: "AMD gaming + light creation with 16GB VRAM headroom.",
      cpuLabel: "Ryzen 7 8700F",
      coolerLabel: "240mm AIO liquid cooler",
      motherboardLabel: "B650 AM5",
      ramLabel: "32GB DDR5-6000",
      gpuLabel: "RX 9060 XT 16GB",
      ssdLabel: "2TB NVMe Gen4",
      psuLabel: "750W 80+ Gold",
      caseLabel: "NZXT H5 Flow Black",
      imageUrl: "https://www.anhoch.com/storage/media/cc-h52fb-01.jpg",
      priceMkd: 78990,
      stock: 4,
      deliveryHours: 24,
    },
    {
      slug: "axon-stream-ready",
      name: "Axon Stream Ready",
      description: "Dual-duty rig for gaming and live streaming at 1440p.",
      cpuLabel: "Ryzen 7 8700F",
      coolerLabel: "280mm AIO liquid cooler",
      motherboardLabel: "B650 AM5 Wi-Fi",
      ramLabel: "32GB DDR5-6000",
      gpuLabel: "RTX 5070 12GB",
      ssdLabel: "2TB NVMe Gen4",
      psuLabel: "850W 80+ Gold",
      caseLabel: "Corsair 3000D RGB Airflow White",
      imageUrl: "https://www.anhoch.com/storage/media/cc9011256ww_1.jpg",
      priceMkd: 89990,
      stock: 3,
      deliveryHours: 24,
    },
    {
      slug: "axon-workstation",
      name: "Axon Workstation",
      description: "Powerful build for content creation, streaming and 3D work.",
      cpuLabel: "Core i7-14700K",
      coolerLabel: "360mm AIO liquid cooler",
      motherboardLabel: "Z790 LGA1700",
      ramLabel: "32GB DDR5-6000",
      gpuLabel: "RTX 5070 12GB",
      ssdLabel: "2TB NVMe Gen4",
      psuLabel: "850W 80+ Gold",
      caseLabel: "Thermaltake S250 TG ARGB Snow",
      imageUrl: "https://www.anhoch.com/storage/media/ca-1y6-00m6wn-00.jpg",
      priceMkd: 98990,
      stock: 3,
      deliveryHours: 24,
    },
    {
      slug: "axon-high-refresh",
      name: "Axon High Refresh",
      description: "X3D CPU for maximum FPS in competitive and AAA titles.",
      cpuLabel: "Ryzen 7 9800X3D",
      coolerLabel: "360mm AIO liquid cooler",
      motherboardLabel: "X870 AM5",
      ramLabel: "32GB DDR5-6000 CL30",
      gpuLabel: "RTX 5070 12GB",
      ssdLabel: "2TB NVMe Gen4",
      psuLabel: "850W 80+ Platinum",
      caseLabel: "NZXT H5 Flow RGB Black",
      imageUrl: "https://www.anhoch.com/storage/media/cc-h52fb-r1.jpg",
      priceMkd: 109990,
      stock: 3,
      deliveryHours: 24,
    },
    {
      slug: "axon-ultra-1440p",
      name: "Axon Ultra 1440p",
      description: "Maxed 1440p / entry 4K gaming with 16GB GDDR7.",
      cpuLabel: "Ryzen 7 9800X3D",
      coolerLabel: "360mm AIO liquid cooler",
      motherboardLabel: "X870 AM5 Wi-Fi",
      ramLabel: "64GB DDR5-6000",
      gpuLabel: "RTX 5070 Ti 16GB",
      ssdLabel: "2TB NVMe Gen4",
      psuLabel: "850W 80+ Platinum",
      caseLabel: "Thermaltake View 380 TG ARGB Snow",
      imageUrl: "https://www.anhoch.com/storage/media/ca-1z2-00m6wn-00.jpg",
      priceMkd: 124990,
      stock: 2,
      deliveryHours: 24,
    },
    {
      slug: "axon-content-pro",
      name: "Axon Content Pro",
      description: "Creator workstation for Premiere, Blender and Unreal.",
      cpuLabel: "Core i7-14700K",
      coolerLabel: "360mm AIO liquid cooler",
      motherboardLabel: "Z790 LGA1700 Wi-Fi",
      ramLabel: "64GB DDR5-6000",
      gpuLabel: "RTX 5070 Ti 16GB",
      ssdLabel: "2TB NVMe Gen4",
      psuLabel: "1000W 80+ Platinum",
      caseLabel: "NZXT H6 Flow Black RGB",
      imageUrl: "https://www.anhoch.com/storage/media/cch61fbr1_3.jpg",
      priceMkd: 134990,
      stock: 2,
      deliveryHours: 24,
    },
    {
      slug: "axon-4k-entry",
      name: "Axon 4K Entry",
      description: "Serious 4K gaming and heavy multitasking.",
      cpuLabel: "Ryzen 9 9900X",
      coolerLabel: "360mm AIO liquid cooler",
      motherboardLabel: "X870E AM5",
      ramLabel: "64GB DDR5-6000",
      gpuLabel: "RTX 5080 16GB",
      ssdLabel: "2TB NVMe Gen5",
      psuLabel: "1000W 80+ Platinum",
      caseLabel: "Corsair 4000X ARGB White",
      imageUrl: "https://www.anhoch.com/storage/media/cc9011205ww_1.jpg",
      priceMkd: 159990,
      stock: 2,
      deliveryHours: 24,
    },
    {
      slug: "axon-apex-gamer",
      name: "Axon Apex Gamer",
      description: "Top-tier gaming: X3D + RTX 5080 for ultra settings everywhere.",
      cpuLabel: "Ryzen 7 9800X3D",
      coolerLabel: "360mm AIO liquid cooler",
      motherboardLabel: "X870E AM5 Wi-Fi",
      ramLabel: "64GB DDR5-6000 CL30",
      gpuLabel: "RTX 5080 16GB",
      ssdLabel: "2TB NVMe Gen5",
      psuLabel: "1000W 80+ Platinum",
      caseLabel: "Thermaltake Level 20 HT Snow",
      imageUrl: "https://www.anhoch.com/storage/media/ca-1p6-00f6wn-00.jpg",
      priceMkd: 174990,
      stock: 2,
      deliveryHours: 24,
    },
    {
      slug: "axon-studio-max",
      name: "Axon Studio Max",
      description: "Flagship creator PC for 4K timelines and complex 3D scenes.",
      cpuLabel: "Core i9-14900K",
      coolerLabel: "420mm AIO liquid cooler",
      motherboardLabel: "Z790 Extreme LGA1700",
      ramLabel: "64GB DDR5-6400",
      gpuLabel: "RTX 5080 16GB",
      ssdLabel: "4TB NVMe Gen4",
      psuLabel: "1200W 80+ Platinum",
      caseLabel: "NZXT H7 Flow RGB Black",
      imageUrl: "https://www.anhoch.com/storage/media/cm-h72fb-r1.jpg",
      priceMkd: 194990,
      stock: 1,
      deliveryHours: 24,
    },
    {
      slug: "axon-flagship",
      name: "Axon Flagship",
      description: "No-compromise AMD flagship for gaming and production.",
      cpuLabel: "Ryzen 9 9950X3D",
      coolerLabel: "420mm AIO liquid cooler",
      motherboardLabel: "X870E Extreme AM5",
      ramLabel: "96GB DDR5-6000",
      gpuLabel: "RTX 5080 16GB",
      ssdLabel: "4TB NVMe Gen5",
      psuLabel: "1200W 80+ Titanium",
      caseLabel: "Thermaltake The Tower 500 Snow",
      imageUrl: "https://www.anhoch.com/storage/media/ca1x100m6wn0.jpg",
      priceMkd: 229990,
      stock: 1,
      deliveryHours: 24,
    },
    {
      slug: "axon-titan-extreme",
      name: "Axon Titan Extreme",
      description: "Absolute peak — 32GB VRAM for AI, 8K and extreme workloads.",
      cpuLabel: "Ryzen 9 9950X3D",
      coolerLabel: "Custom loop ready 360mm AIO",
      motherboardLabel: "X870E Extreme AM5 Wi-Fi",
      ramLabel: "128GB DDR5-6000",
      gpuLabel: "RTX 5090 32GB",
      ssdLabel: "4TB NVMe Gen5",
      psuLabel: "1600W 80+ Titanium",
      caseLabel: "Thermaltake The Tower 300 Racing Green",
      imageUrl: "https://www.anhoch.com/storage/media/ca-1y4-00scwn-00.jpg",
      priceMkd: 389990,
      stock: 1,
      deliveryHours: 24,
    },
  ];

  for (const pc of prebuilts) {
    await prisma.prebuilt.create({
      data: {
        ...pc,
        imageUrl: pc.imageUrl,
        condition: "new",
      },
    });
  }

  const usedPcs = [
    {
      slug: "used-ryzen5-rtx3060",
      name: "Used Axon Pulse 3060",
      description: "Clean used gaming PC — tested, wiped, ready for COD delivery.",
      cpuLabel: "Ryzen 5 5600",
      coolerLabel: "Stock AMD cooler",
      motherboardLabel: "B550 AM4",
      ramLabel: "16GB DDR4-3200",
      gpuLabel: "RTX 3060 12GB",
      ssdLabel: "512GB NVMe",
      psuLabel: "650W 80+ Bronze",
      caseLabel: "Fractal Meshify C",
      imageUrl: "https://www.anhoch.com/storage/media/ca1x100m6wn0.jpg",
      priceMkd: 28990,
      stock: 1,
      deliveryHours: 24,
      condition: "used",
      conditionGrade: "Excellent",
    },
    {
      slug: "used-i5-rtx4060",
      name: "Used Axon Forge 4060",
      description: "Lightly used 1440p build — full stress test passed.",
      cpuLabel: "Intel Core i5-13400F",
      coolerLabel: "Tower air cooler",
      motherboardLabel: "B760 DDR4",
      ramLabel: "32GB DDR4-3200",
      gpuLabel: "RTX 4060 8GB",
      ssdLabel: "1TB NVMe",
      psuLabel: "750W 80+ Gold",
      caseLabel: "Corsair 4000D",
      imageUrl: "https://www.anhoch.com/storage/media/ca-1y4-00scwn-00.jpg",
      priceMkd: 44990,
      stock: 1,
      deliveryHours: 24,
      condition: "used",
      conditionGrade: "Very Good",
    },
    {
      slug: "used-ryzen7-rx6700",
      name: "Used Axon Arc 6700XT",
      description: "Solid mid-range used system for esports and creative work.",
      cpuLabel: "Ryzen 7 5700X",
      coolerLabel: "120mm tower cooler",
      motherboardLabel: "B550 AM4",
      ramLabel: "32GB DDR4-3600",
      gpuLabel: "RX 6700 XT 12GB",
      ssdLabel: "1TB NVMe",
      psuLabel: "750W 80+ Bronze",
      caseLabel: "NZXT H510",
      imageUrl: "https://www.anhoch.com/storage/media/ca1x100m6wn0.jpg",
      priceMkd: 39990,
      stock: 2,
      deliveryHours: 24,
      condition: "used",
      conditionGrade: "Good",
    },
  ];

  for (const pc of usedPcs) {
    await prisma.prebuilt.create({ data: pc });
  }
  // Demo order for tracker widget
  const demoOrder = await prisma.order.create({
    data: {
      trackingCode: "AXN-DEMO01",
      type: "PREBUILT",
      status: OrderStatus.BUILDING,
      customerName: "Demo User",
      customerPhone: "+38970333333",
      customerEmail: "user@axon.mk",
      customerAddress: "Булевар Партизански Одреди 1",
      city: "Скопје",
      partsCostMkd: 39990,
      assemblyFeeMkd: 0,
      totalMkd: 39990,
      paymentMethod: "COD",
      verifiedAt: new Date(),
      statusHistory: {
        create: [
          { status: OrderStatus.VERIFICATION, note: "Нарачката е примена — чека телефонска верификација." },
          { status: OrderStatus.PARTS_SOURCED, note: "Деловите се подготвени од залиха." },
          { status: OrderStatus.BUILDING, note: "PC е во склопување и stress testing." },
        ],
      },
    },
  });

  const byCat = parts.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Seed complete. Parts:", parts.length, byCat);
  console.log("Prebuilts:", prebuilts.length, "Used:", usedPcs.length);
  console.log("Demo order:", demoOrder.trackingCode);
  console.log(
    `Seed logins: owner@axon.mk / admin@axon.mk / user@axon.mk — password: ${seedPassword}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
