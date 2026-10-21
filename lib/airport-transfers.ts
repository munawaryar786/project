/**
 * Phase 1 Drivo airport-transfer presets. These are real destination airports,
 * not similarly named taxi companies in Slovakia. Coordinates are intentionally
 * NOT supplied: the route provider must resolve the airport access/terminal
 * rather than navigate to a runway reference point.
 *
 * Other services retain their Slovakia-only autocomplete behavior.
 */
export type AirportTransferPreset = {
  code: "BTS" | "VIE" | "BUD" | "PRG";
  description: string;
  mainText: string;
  secondaryText: string;
  aliases: readonly string[];
};

export const AIRPORT_TRANSFER_PRESETS: readonly AirportTransferPreset[] = [
  {
    code: "BTS",
    description: "Bratislava Airport (BTS), Ivanská cesta, Bratislava, Slovakia",
    mainText: "Bratislava Airport (BTS)",
    secondaryText: "Ivanská cesta, Bratislava, Slovakia",
    aliases: ["bratislava airport", "airport bratislava", "letisko bratislava", "m r stefanik airport", "bts"],
  },
  {
    code: "VIE",
    description: "Vienna International Airport (VIE), 1300 Schwechat, Austria",
    mainText: "Vienna International Airport (VIE)",
    secondaryText: "Schwechat, Austria",
    aliases: ["vienna airport", "vienna international airport", "wien airport", "flughafen wien", "schwechat airport", "airport vienna", "vie"],
  },
  {
    code: "BUD",
    description: "Budapest Ferenc Liszt International Airport (BUD), Budapest, Hungary",
    mainText: "Budapest Ferenc Liszt International Airport (BUD)",
    secondaryText: "Budapest, Hungary",
    aliases: ["budapest airport", "budapest ferenc liszt international airport", "ferenc liszt airport", "liszt ferenc repuloter", "airport budapest", "bud"],
  },
  {
    code: "PRG",
    description: "Václav Havel Airport Prague (PRG), Praha 6, Czechia",
    mainText: "Václav Havel Airport Prague (PRG)",
    secondaryText: "Prague, Czechia",
    aliases: ["prague airport", "prague international airport", "vaclav havel airport", "vaclav havel airport prague", "praha airport", "letiste vaclava havla", "airport prague", "prg"],
  },
];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function airportTransferPresetsFor(query: string): AirportTransferPreset[] {
  const q = normalize(query);
  if (q.length < 3) return [];
  return AIRPORT_TRANSFER_PRESETS.filter((preset) => {
    const searchable = [preset.description, preset.mainText, preset.secondaryText, ...preset.aliases];
    return searchable.some((candidate) => normalize(candidate).includes(q) || q.includes(normalize(candidate)));
  });
}

/** Map only explicit airport names or IATA codes; do not map city names to airports. */
export function canonicalAirportTransferAddress(input: string, serviceType: string) {
  if (serviceType.toLowerCase() !== "airport") return input;
  const q = normalize(input);
  const preset = AIRPORT_TRANSFER_PRESETS.find((airport) =>
    normalize(airport.description) === q ||
    normalize(airport.mainText) === q ||
    airport.aliases.some((alias) => normalize(alias) === q)
  );
  return preset?.description ?? input;
}
