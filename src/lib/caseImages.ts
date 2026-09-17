/** Map selected case part names to photoreal preview images in /public/cases */
export function resolveCaseImage(caseName?: string | null): {
  src: string;
  label: string;
} {
  const n = (caseName || "").toLowerCase();

  if (n.includes("5000")) {
    return { src: "/cases/corsair-5000d.png", label: "Corsair 5000D Airflow" };
  }
  if (n.includes("4000") || (n.includes("corsair") && n.includes("airflow"))) {
    return { src: "/cases/corsair-4000d.png", label: "Corsair 4000D Airflow" };
  }
  if (n.includes("lancool") || n.includes("216")) {
    return { src: "/cases/lianli-lancool-216.png", label: "Lian Li Lancool 216" };
  }
  if (n.includes("o11")) {
    return { src: "/cases/lianli-o11.png", label: "Lian Li O11 Dynamic Evo" };
  }
  if (n.includes("meshify")) {
    return { src: "/cases/fractal-meshify.png", label: "Fractal Meshify 2 Compact" };
  }
  if (n.includes("north")) {
    return { src: "/cases/fractal-north.png", label: "Fractal North XL" };
  }
  if (n.includes("h5") || n.includes("nzxt")) {
    return { src: "/cases/nzxt-h5.png", label: "NZXT H5 Flow" };
  }
  if (n.includes("forge") || n.includes("mag") || n.includes("msi")) {
    return { src: "/cases/msi-forge.png", label: "MSI MAG Forge 100R" };
  }

  return { src: "/cases/corsair-4000d.png", label: caseName || "PC Case" };
}
