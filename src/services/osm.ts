export type SpeedLimitResult = {
  speedLimitKph: number | null;
  source: "osm:maxspeed" | "osm:implicit" | "none";
  raw?: any;
};

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// Builds an Overpass QL query to find the nearest road around a coordinate and return its tags
function buildOverpassQuery(latitude: number, longitude: number): string {
  const radiusMeters = 60; // small radius to find the nearest way
  // We first define a center node to allow the around.center syntax (slightly more accurate)
  return `
[out:json][timeout:25];
node(around:${radiusMeters}, ${latitude}, ${longitude})->.center;
way(around.center:${radiusMeters})["highway"];
out tags center 1;
`;
}

export async function fetchSpeedLimit(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<SpeedLimitResult> {
  try {
    const query = buildOverpassQuery(latitude, longitude);
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal,
    });

    if (!response.ok) {
      return { speedLimitKph: null, source: "none" };
    }

    const data = await response.json();
    const elements = Array.isArray(data?.elements) ? data.elements : [];

    // Find the first way with an explicit maxspeed tag
    const wayWithMaxspeed = elements.find(
      (el: any) =>
        el.type === "way" &&
        el.tags &&
        (el.tags.maxspeed || el.tags["maxspeed:advisory"])
    );

    if (wayWithMaxspeed) {
      const maxspeedTag: string =
        wayWithMaxspeed.tags.maxspeed ||
        wayWithMaxspeed.tags["maxspeed:advisory"];
      const parsed = parseMaxspeed(maxspeedTag);
      if (parsed !== null) {
        return {
          speedLimitKph: parsed,
          source: "osm:maxspeed",
          raw: wayWithMaxspeed,
        };
      }
    }

    // If no explicit maxspeed, look for implicit hints like maxspeed:type (e.g., DE:urban)
    const wayWithType = elements.find(
      (el: any) =>
        el.type === "way" &&
        el.tags &&
        (el.tags["maxspeed:type"] || el.tags.highway)
    );
    if (wayWithType) {
      const inferred = inferDefaultSpeedKph(
        wayWithType.tags["maxspeed:type"],
        wayWithType.tags.highway,
        wayWithType.tags.country || wayWithType.tags["addr:country"]
      );
      return {
        speedLimitKph: inferred,
        source: inferred === null ? "none" : "osm:implicit",
        raw: wayWithType,
      };
    }

    return { speedLimitKph: null, source: "none", raw: data };
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      return { speedLimitKph: null, source: "none" };
    }
    return { speedLimitKph: null, source: "none" };
  }
}

// Parses common maxspeed strings (e.g., "50", "50 km/h", "30 mph", "signals", "walk") into kph
function parseMaxspeed(value: string): number | null {
  const v = String(value).trim().toLowerCase();
  if (!v) return null;

  // Known non-numeric values
  if (v === "walk" || v === "none" || v === "signals" || v === "variable")
    return null;

  // Extract number and unit
  const match = v.match(/^(\d{1,3})(?:\s*(km\/h|kph|kmh|mph))?$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = (match[2] || "kph").toLowerCase();
    if (Number.isNaN(num)) return null;
    if (unit === "mph") return Math.round(num * 1.60934);
    return num; // assume kph if unit missing or kmh variants
  }

  // Values like "50;70" (conditional) -> pick the first numeric
  const parts = v.split(";").map((s) => s.trim());
  for (const p of parts) {
    const num = parseInt(p, 10);
    if (!Number.isNaN(num)) return num;
  }

  return null;
}

// Very light heuristic defaults if explicit maxspeed is absent.
// Note: This is intentionally conservative and limited; expand as needed.
function inferDefaultSpeedKph(
  maxspeedType?: string,
  highway?: string,
  country?: string
): number | null {
  const type = (maxspeedType || "").toLowerCase();
  const hw = (highway || "").toLowerCase();
  const cc = (country || "").toUpperCase();

  // Country specific symbolic defaults
  if (type.includes(":urban")) {
    if (cc === "DE") return 50;
    if (cc === "FR") return 50;
    if (cc === "ES") return 50;
    if (cc === "IT") return 50;
    if (cc === "SE") return 50;
    if (cc === "NO") return 50;
    if (cc === "DK") return 50;
    if (cc === "GB" || cc === "UK") return 48; // 30 mph
  }
  if (type.includes(":rural")) {
    if (cc === "DE") return 100;
    if (cc === "FR") return 80;
    if (cc === "ES") return 90;
    if (cc === "IT") return 90;
    if (cc === "SE") return 70;
    if (cc === "NO") return 80;
    if (cc === "DK") return 80;
    if (cc === "GB" || cc === "UK") return 96; // 60 mph
  }

  // Fallback by highway class (very rough, last resort)
  switch (hw) {
    case "motorway":
      return 110;
    case "trunk":
      return 90;
    case "primary":
    case "secondary":
    case "tertiary":
      return 80;
    case "residential":
    case "living_street":
      return 30;
    default:
      return null;
  }
}
