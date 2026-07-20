import { Router } from "express";
import { XMLParser } from "fast-xml-parser";
import { Client } from "basic-ftp";
import { Writable } from "node:stream";
import { db, settingsTable } from "@workspace/db";

const router = Router();

const BOM_PRODUCTS = [
  "IDD10207",
  "IDN10064",
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
  sydney: "IDN10064",
};

const LOCATION_ALIASES: Record<string, string> = {
  cranebrook: "Penrith",
};

const OBSERVATION_FEEDS: Record<string, string> = {
  penrith: "https://www.bom.gov.au/fwo/IDN60801/IDN60801.94763.json",
};

type BomNode = Record<string, unknown>;
type ForecastDay = {
  date: string;
  min: number | null;
  max: number | null;
  summary: string;
  iconCode: number | null;
};

type WeatherResponse = {
  configured: true;
  source: "Bureau of Meteorology";
  location: string;
  issuedAt: string | null;
  currentTemp: number | null;
  observedAt: string | null;
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
      return {
        date,
        min: numberValue(valueFor(elements, "air_temperature_minimum")),
        max: numberValue(valueFor(elements, "air_temperature_maximum")),
        summary: valueFor(texts, "precis") ?? "Forecast available",
        iconCode: numberValue(valueFor(elements, "forecast_icon_code")),
      };
    })
    .filter((day): day is ForecastDay => day !== null)
    .slice(0, 7);

  if (days.length === 0) return null;
  const amoc = child(product, "amoc") as BomNode | undefined;
  const issueTime =
    child(amoc, "issue-time-local") ?? child(amoc, "issue-time-utc") ?? null;
  const issuedAt =
    typeof issueTime === "object" && issueTime !== null
      ? String((issueTime as BomNode)["#text"] ?? "")
      : issueTime === null
        ? null
        : String(issueTime);
  return {
    configured: true,
    source: "Bureau of Meteorology",
    location: String(area["@_description"] ?? requestedCity),
    issuedAt: issuedAt || null,
    currentTemp: null,
    observedAt: null,
    forecast: days,
  };
}

async function loadCurrentObservation(city: string) {
  const url = OBSERVATION_FEEDS[city.trim().toLowerCase()];
  if (!url) return null;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LunamHub/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    observations?: {
      data?: Array<{
        air_temp?: number | null;
        local_date_time_full?: string | null;
      }>;
    };
  };
  const latest = payload.observations?.data?.[0];
  return typeof latest?.air_temp === "number" &&
    Number.isFinite(latest.air_temp)
    ? {
        currentTemp: latest.air_temp,
        observedAt: latest.local_date_time_full ?? null,
      }
    : null;
}

async function fetchProduct(product: string, city: string) {
  const client = new Client(15_000);
  const chunks: Buffer[] = [];
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  try {
    await client.access({
      host: "ftp.bom.gov.au",
      user: "anonymous",
      password: "lunamhub@localhost",
      secure: false,
    });
    await client.downloadTo(output, `/anon/gen/fwo/${product}.xml`);
    return findLocation(Buffer.concat(chunks).toString("utf8"), city);
  } finally {
    client.close();
  }
}

async function loadForecast(city: string): Promise<WeatherResponse | null> {
  const alias = LOCATION_ALIASES[city.trim().toLowerCase()];
  const lookupCity = alias ?? city;
  const capitalProduct = CAPITAL_PRODUCTS[lookupCity.trim().toLowerCase()];
  const products = capitalProduct
    ? [capitalProduct]
    : [...BOM_PRODUCTS];
  const results = await Promise.allSettled(
    products.map((product) => fetchProduct(product, lookupCity)),
  );
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("Every BOM forecast feed request failed");
  }
  const value =
    results.find(
      (result): result is PromiseFulfilledResult<WeatherResponse> =>
        result.status === "fulfilled" && result.value !== null,
    )?.value ?? null;
  if (value && alias) {
    value.location = `${city} (${value.location} forecast)`;
  }
  if (value) {
    const observation = await loadCurrentObservation(lookupCity).catch(
      () => null,
    );
    if (observation) Object.assign(value, observation);
  }
  return value;
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
