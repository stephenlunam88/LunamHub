import { Router } from "express";
import { XMLParser } from "fast-xml-parser";
import { db, settingsTable } from "@workspace/db";

const router = Router();

const BOM_PRODUCTS = [
  "IDD10207",
  "IDN11060",
  "IDQ11295",
  "IDS10044",
  "IDT16710",
  "IDV10753",
  "IDW14199",
] as const;

const CAPITAL_PRODUCTS: Record<string, (typeof BOM_PRODUCTS)[number]> = {
  adelaide: "IDS10044",
  brisbane: "IDQ11295",
  canberra: "IDN11060",
  darwin: "IDD10207",
  hobart: "IDT16710",
  melbourne: "IDV10753",
  perth: "IDW14199",
  sydney: "IDN11060",
};

type BomNode = Record<string, unknown>;
type ForecastDay = {
  date: string;
  min: number | null;
  max: number | null;
  summary: string;
  iconCode: number | null;
  rainChance: number | null;
  rainMin: number | null;
  rainMax: number | null;
};

type WeatherResponse = {
  configured: true;
  source: "Bureau of Meteorology";
  location: string;
  issuedAt: string | null;
  forecast: ForecastDay[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

let cache: { city: string; expiresAt: number; value: WeatherResponse } | null =
  null;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function child(node: BomNode | undefined, key: string): unknown {
  return node?.[key];
}

function valueFor(nodes: unknown, type: string): string | null {
  const match = asArray(nodes as BomNode[] | BomNode | undefined).find(
    (node) => String(node?.["@_type"] ?? "") === type,
  );
  if (!match) return null;
  const value = match["#text"];
  return value === undefined || value === null ? null : String(value);
}

function numberValue(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rainRange(value: string | null) {
  if (!value) return { rainMin: null, rainMax: null };
  const values = value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length === 0) return { rainMin: null, rainMax: null };
  return {
    rainMin: values[0] ?? null,
    rainMax: values[1] ?? values[0] ?? null,
  };
}

function findLocation(xml: string, requestedCity: string): WeatherResponse | null {
  const parsed = parser.parse(xml) as BomNode;
  const product = child(parsed, "product") as BomNode | undefined;
  const forecast = child(product, "forecast") as BomNode | undefined;
  const areas = asArray(child(forecast, "area") as BomNode[] | BomNode | undefined);
  const wanted = requestedCity.trim().toLocaleLowerCase("en-AU");
  const area =
    areas.find(
      (candidate) =>
        String(candidate["@_type"] ?? "") === "location" &&
        String(candidate["@_description"] ?? "").toLocaleLowerCase("en-AU") ===
          wanted,
    ) ??
    areas.find(
      (candidate) =>
        String(candidate["@_type"] ?? "") === "location" &&
        String(candidate["@_description"] ?? "")
          .toLocaleLowerCase("en-AU")
          .includes(wanted),
    );
  if (!area) return null;

  const days = asArray(
    child(area, "forecast-period") as BomNode[] | BomNode | undefined,
  )
    .map((period): ForecastDay | null => {
      const date = String(period["@_start-time-local"] ?? "").slice(0, 10);
      if (!date) return null;
      const elements = child(period, "element");
      const texts = child(period, "text");
      const rain = rainRange(valueFor(elements, "precipitation_range"));
      return {
        date,
        min: numberValue(valueFor(elements, "air_temperature_minimum")),
        max: numberValue(valueFor(elements, "air_temperature_maximum")),
        summary: valueFor(texts, "precis") ?? "Forecast available",
        iconCode: numberValue(valueFor(elements, "forecast_icon_code")),
        rainChance: numberValue(
          valueFor(elements, "probability_of_precipitation"),
        ),
        ...rain,
      };
    })
    .filter((day): day is ForecastDay => day !== null)
    .slice(0, 7);

  if (days.length === 0) return null;
  const amoc = child(product, "amoc") as BomNode | undefined;
  const issueTime =
    child(amoc, "issue-time-local") ?? child(amoc, "issue-time-utc") ?? null;
  return {
    configured: true,
    source: "Bureau of Meteorology",
    location: String(area["@_description"] ?? requestedCity),
    issuedAt: issueTime === null ? null : String(issueTime),
    forecast: days,
  };
}

async function fetchProduct(product: string, city: string) {
  const response = await fetch(
    `https://ftp.bom.gov.au/anon/gen/fwo/${product}.xml`,
    {
      headers: { "User-Agent": "LunamHub household display" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`BOM feed returned ${response.status}`);
  return findLocation(await response.text(), city);
}

async function loadForecast(city: string): Promise<WeatherResponse | null> {
  const capitalProduct = CAPITAL_PRODUCTS[city.trim().toLowerCase()];
  const products = capitalProduct
    ? [capitalProduct]
    : [...BOM_PRODUCTS];
  const results = await Promise.allSettled(
    products.map((product) => fetchProduct(product, city)),
  );
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("Every BOM forecast feed request failed");
  }
  return (
    results.find(
      (result): result is PromiseFulfilledResult<WeatherResponse> =>
        result.status === "fulfilled" && result.value !== null,
    )?.value ?? null
  );
}

router.get("/", async (_req, res) => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  const city = settings?.weatherCity?.trim();
  if (!city) {
    return res.json({
      configured: false,
      message: "Set Weather City in Parents → Display.",
    });
  }
  if (cache && cache.city === city && cache.expiresAt > Date.now()) {
    return res.json(cache.value);
  }
  try {
    const value = await loadForecast(city);
    if (!value) {
      return res.status(404).json({
        configured: true,
        message: `No BOM précis forecast location matched "${city}".`,
      });
    }
    cache = { city, expiresAt: Date.now() + 30 * 60_000, value };
    return res.json(value);
  } catch {
    if (cache?.city === city) return res.json(cache.value);
    return res.status(503).json({
      configured: true,
      message: "The Bureau of Meteorology feed is temporarily unavailable.",
    });
  }
});

export { router as weatherRouter };
