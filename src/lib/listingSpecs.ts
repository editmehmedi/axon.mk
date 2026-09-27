export type ListingPartSpecs = {
  socket: string | null;
  ramType: string | null;
  formFactor: string | null;
};

/** DDR generation written in a title, including "DDR4" and "DDR 4". */
export function inferDdrGeneration(text: string): string | null {
  const match = text.match(/\bDDR\s*-?\s*([2-5])\b/i);
  return match ? `DDR${match[1]}` : null;
}

function namedSocket(text: string): string | null {
  const match = text.match(
    /\b(AM5|AM4|FM2\+|LGA\s*1851|LGA\s*1700|LGA\s*1200|LGA\s*1151|LGA\s*1150|LGA\s*1155|LGA\s*1156)\b/i,
  );
  return match ? match[1].replace(/\s+/g, "").toUpperCase() : null;
}

/** Chipset → socket and RAM. LGA1700 boards exist as DDR4 or DDR5, so RAM stays unset. */
const CHIPSETS: { re: RegExp; socket: string; ramType: string | null }[] = [
  { re: /\b(?:X870E|X870|B850|B840|X670E|X670|B650E|B650|A620)\b/i, socket: "AM5", ramType: "DDR5" },
  { re: /\b(?:X570|B550|A520|X470|B450|X370|B350|A320)\b/i, socket: "AM4", ramType: "DDR4" },
  { re: /\b(?:Z890|B860|H810)\b/i, socket: "LGA1851", ramType: "DDR5" },
  { re: /\b(?:Z790|H770|B760|Z690|H670|B660|H610)\b/i, socket: "LGA1700", ramType: null },
  { re: /\b(?:Z590|H570|B560|H510|Z490|H470|B460|H410)\b/i, socket: "LGA1200", ramType: "DDR4" },
  { re: /\b(?:Z390|Z370|H370|B365|B360|H310|Z270|H270|B250|Z170|H170|B150|H110)\b/i, socket: "LGA1151", ramType: "DDR4" },
  { re: /\b(?:Z97|H97|Z87|H87|B85|H81)\b/i, socket: "LGA1150", ramType: "DDR3" },
  { re: /\b(?:Z77|Z75|Z68|H77|H67|B75|H61)\b/i, socket: "LGA1155", ramType: "DDR3" },
];

function inferFormFactor(text: string): string | null {
  if (/\b(?:mini[-\s]?itx|itx)\b/i.test(text)) return "ITX";
  if (
    /\b(?:micro[-\s]?atx|m-?atx)\b/i.test(text) ||
    /\b[A-Z]\d{3,4}M\b/i.test(text) ||
    /\b[A-Z]\d{3,4}\s+M\b/i.test(text)
  ) {
    return "mATX";
  }
  if (/\be-?atx\b/i.test(text)) return "EATX";
  if (/\batx\b/i.test(text)) return "ATX";
  return null;
}

function inferMotherboard(text: string): ListingPartSpecs {
  const chip = CHIPSETS.find((row) => row.re.test(text));
  const socket = namedSocket(text) ?? chip?.socket ?? null;
  const ramType = inferDdrGeneration(text) ?? chip?.ramType ?? null;
  return { socket, ramType, formFactor: inferFormFactor(text) };
}

/** Specs a used listing title implies, so the builder can filter RAM and sockets. */
export function inferListingPartSpecs(
  category: string,
  name: string,
  description = "",
): ListingPartSpecs {
  const text = `${name} ${description}`.trim();
  const cat = category.toUpperCase();
  if (cat === "MOTHERBOARD") return inferMotherboard(text);
  if (cat === "RAM") return { socket: null, ramType: inferDdrGeneration(text), formFactor: null };
  if (cat === "CPU") return { socket: namedSocket(text), ramType: null, formFactor: null };
  if (cat === "CASE") return { socket: null, ramType: null, formFactor: inferFormFactor(text) };
  return { socket: null, ramType: null, formFactor: null };
}
