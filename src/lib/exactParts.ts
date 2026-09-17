/** Exact per-product image paths under /public/parts/exact */

export function partSlug(brand: string, name: string): string {
  return `${brand}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function exactPartImagePath(brand: string, name: string): string {
  return `/parts/exact/${partSlug(brand, name)}.png`;
}

/** All catalog parts that need exact photos (mirrors seed). */
export const CATALOG_PARTS: { brand: string; name: string; category: string }[] = [
  { brand: "AMD", name: "Ryzen 5 5500", category: "CPU" },
  { brand: "AMD", name: "Ryzen 5 5600", category: "CPU" },
  { brand: "AMD", name: "Ryzen 5 5600X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 7 5700X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 7 5800X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 9 5900X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 5 7600", category: "CPU" },
  { brand: "AMD", name: "Ryzen 5 7600X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 7 7700", category: "CPU" },
  { brand: "AMD", name: "Ryzen 7 7800X3D", category: "CPU" },
  { brand: "AMD", name: "Ryzen 9 7900X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 5 9600X", category: "CPU" },
  { brand: "AMD", name: "Ryzen 7 9700X", category: "CPU" },
  { brand: "Intel", name: "Core i3-12100F", category: "CPU" },
  { brand: "Intel", name: "Core i5-12400F", category: "CPU" },
  { brand: "Intel", name: "Core i5-13400F", category: "CPU" },
  { brand: "Intel", name: "Core i5-14600KF", category: "CPU" },
  { brand: "Intel", name: "Core i7-13700K", category: "CPU" },
  { brand: "Intel", name: "Core i7-14700K", category: "CPU" },
  { brand: "Intel", name: "Core i9-14900K", category: "CPU" },
  { brand: "Intel", name: "Core Ultra 5 245K", category: "CPU" },
  { brand: "Intel", name: "Core Ultra 7 265K", category: "CPU" },
  { brand: "MSI", name: "B550M Pro-VDH WiFi", category: "MOTHERBOARD" },
  { brand: "MSI", name: "B550 Tomahawk", category: "MOTHERBOARD" },
  { brand: "Gigabyte", name: "X570 Aorus Elite", category: "MOTHERBOARD" },
  { brand: "MSI", name: "B650 Gaming Plus WiFi", category: "MOTHERBOARD" },
  { brand: "Gigabyte", name: "B650 Aorus Elite AX", category: "MOTHERBOARD" },
  { brand: "MSI", name: "X670E Tomahawk WiFi", category: "MOTHERBOARD" },
  { brand: "ASUS", name: "ROG Strix B650-A Gaming WiFi", category: "MOTHERBOARD" },
  { brand: "Gigabyte", name: "B760M DS3H DDR4", category: "MOTHERBOARD" },
  { brand: "MSI", name: "B760 Tomahawk WiFi", category: "MOTHERBOARD" },
  { brand: "ASUS", name: "Z790-P WiFi", category: "MOTHERBOARD" },
  { brand: "Gigabyte", name: "Z790 Aorus Elite AX", category: "MOTHERBOARD" },
  { brand: "MSI", name: "Z890 Gaming Plus WiFi", category: "MOTHERBOARD" },
  { brand: "AMD", name: "RX 6600", category: "GPU" },
  { brand: "AMD", name: "RX 7600", category: "GPU" },
  { brand: "AMD", name: "RX 7700 XT", category: "GPU" },
  { brand: "AMD", name: "RX 7800 XT", category: "GPU" },
  { brand: "AMD", name: "RX 7900 GRE", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 3050 8GB", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 4060 8GB", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 4060 Ti 8GB", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 4070", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 4070 Super", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 4070 Ti Super", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 4080 Super", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 5070", category: "GPU" },
  { brand: "NVIDIA", name: "RTX 5080", category: "GPU" },
  { brand: "Corsair", name: "Vengeance 16GB (2x8) 3200", category: "RAM" },
  { brand: "Kingston", name: "Fury Beast 16GB (2x8) 3200", category: "RAM" },
  { brand: "Corsair", name: "Vengeance 32GB (2x16) 3600", category: "RAM" },
  { brand: "Kingston", name: "Fury Beast 32GB (2x16) 3200", category: "RAM" },
  { brand: "Corsair", name: "Vengeance 16GB (2x8) 5600", category: "RAM" },
  { brand: "Corsair", name: "Vengeance 32GB (2x16) 5600", category: "RAM" },
  { brand: "Kingston", name: "Fury Beast 32GB (2x16) 6000", category: "RAM" },
  { brand: "G.Skill", name: "Trident Z5 32GB (2x16) 6000", category: "RAM" },
  { brand: "Corsair", name: "Vengeance 64GB (2x32) 6000", category: "RAM" },
  { brand: "Corsair", name: "CV650 650W Bronze", category: "PSU" },
  { brand: "Corsair", name: "RM750e 750W Gold", category: "PSU" },
  { brand: "Corsair", name: "RM850x 850W Gold", category: "PSU" },
  { brand: "Corsair", name: "RM1000x 1000W Gold", category: "PSU" },
  { brand: "Seasonic", name: "Focus GX-750 Gold", category: "PSU" },
  { brand: "Seasonic", name: "Focus GX-850 Gold", category: "PSU" },
  { brand: "MSI", name: "MAG A750GL PCIE5", category: "PSU" },
  { brand: "ASUS", name: "ROG Strix 850W Gold", category: "PSU" },
  { brand: "Samsung", name: "980 1TB NVMe", category: "SSD" },
  { brand: "Samsung", name: "990 EVO 1TB NVMe", category: "SSD" },
  { brand: "Samsung", name: "990 Pro 1TB NVMe", category: "SSD" },
  { brand: "Samsung", name: "990 Pro 2TB NVMe", category: "SSD" },
  { brand: "Kingston", name: "NV2 1TB NVMe", category: "SSD" },
  { brand: "Kingston", name: "NV3 2TB NVMe", category: "SSD" },
  { brand: "WD", name: "SN770 1TB NVMe", category: "SSD" },
  { brand: "WD", name: "SN850X 2TB NVMe", category: "SSD" },
  { brand: "Crucial", name: "P3 Plus 1TB NVMe", category: "SSD" },
  { brand: "Crucial", name: "T500 2TB NVMe", category: "SSD" },
  { brand: "Cooler Master", name: "Hyper 212 Black", category: "COOLER" },
  { brand: "Thermalright", name: "Peerless Assassin 120 SE", category: "COOLER" },
  { brand: "Noctua", name: "NH-D15", category: "COOLER" },
  { brand: "Arctic", name: "Liquid Freezer III 240", category: "COOLER" },
  { brand: "Arctic", name: "Liquid Freezer III 360", category: "COOLER" },
  { brand: "NZXT", name: "Kraken 240", category: "COOLER" },
];

export function promptForPart(p: { brand: string; name: string; category: string }): string {
  const product = `${p.brand} ${p.name}`;
  const base =
    "Photorealistic e-commerce catalog product photo, single product centered, dark seamless studio background, sharp focus, no watermark, no extra text overlays, exact product identity";
  switch (p.category) {
    case "CPU":
      return `${base}: ${product} desktop processor CPU chip in official retail packaging tray, top-down, clearly the ${product} model`;
    case "GPU":
      return `${base}: ${product} graphics card, three-quarter view, dual/triple fan cooler, clearly labeled as ${product}`;
    case "MOTHERBOARD":
      return `${base}: ${product} ATX/mATX motherboard, top-down view of the full board, clearly the ${product} model`;
    case "RAM":
      return `${base}: ${product} desktop memory kit, sticks standing, heatspreaders, clearly the ${product} kit`;
    case "PSU":
      return `${base}: ${product} PC power supply unit, three-quarter view, clearly the ${product} model`;
    case "SSD":
      return `${base}: ${product} M.2 NVMe SSD, angled product shot, clearly the ${product} drive`;
    case "COOLER":
      return `${base}: ${product} CPU cooler complete product, three-quarter view, clearly the ${product} cooler`;
    default:
      return `${base}: ${product}`;
  }
}
