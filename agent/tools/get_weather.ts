import { defineTool, type SessionContext } from "eve/tools";
import { z } from "zod";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

type GeocodeResponse = {
  results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[];
};

type ForecastResponse = {
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
  daily_units?: Record<string, string>;
  timezone?: string;
};

type WeatherResult = {
  found: boolean;
  place: string;
  timezone?: string;
  units?: { temperature: string; rainChance: string };
  outlook?: Array<{
    date: string;
    maxC: number | null;
    minC: number | null;
    rainChancePercent: number | null;
  }>;
  note?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One successful (or not-found) weather lookup per turn — stops model thrashing. */
const turnWeather = new Map<string, WeatherResult>();

function turnKey(ctx: SessionContext): string {
  return `${ctx.session.id}:${ctx.session.turn.id}`;
}

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function fetchJson<T>(url: string, what: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${what} lookup failed (${response.status}).`);
  return (await response.json()) as T;
}

export default defineTool({
  description:
    "Daily forecast (max/min temperature in °C and chance of rain) for a place and date range, via " +
    "Open-Meteo. Call at most once per turn, and only when you already know the place and the date " +
    "and layering or rain would change the outfit. Never guess a city. Skip for indoor office " +
    "meetings and generic shopping briefs. Open-Meteo forecasts roughly 16 days ahead.",
  inputSchema: z.object({
    place: z.string().min(1).describe("City or town name, e.g. 'Brighton' or 'Lisbon, Portugal'."),
    date: z.string().regex(ISO_DATE).optional().describe("First day as YYYY-MM-DD. Defaults to today."),
    days: z.number().int().min(1).max(7).optional().describe("How many days from `date`. Defaults to 1."),
  }),
  label: { start: ({ place }) => `Checking the weather in ${place}` },
  async execute({ place, date, days }, ctx) {
    const key = turnKey(ctx);
    const cached = turnWeather.get(key);
    if (cached) {
      return {
        ...cached,
        note:
          cached.note ??
          "Weather was already checked this turn. Use that result; do not call get_weather again.",
      };
    }

    const geocode = await fetchJson<GeocodeResponse>(
      `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
      "Place",
    );
    const location = geocode.results?.[0];
    if (!location) {
      const missing: WeatherResult = {
        found: false,
        place,
        note: `No place called "${place}" was found. Ask the user to confirm it. Do not call get_weather again this turn.`,
      };
      turnWeather.set(key, missing);
      return missing;
    }

    const startDate = date ?? isoDate();
    const endDate = addDays(startDate, Math.max(1, days ?? 1) - 1);
    const forecast = await fetchJson<ForecastResponse>(
      `${FORECAST_URL}?latitude=${location.latitude}&longitude=${location.longitude}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&start_date=${startDate}&end_date=${endDate}`,
      "Forecast",
    );

    const daily = forecast.daily;
    const dates = daily?.time ?? [];
    const outlook = dates.map((day, index) => ({
      date: day,
      maxC: daily?.temperature_2m_max?.[index] ?? null,
      minC: daily?.temperature_2m_min?.[index] ?? null,
      rainChancePercent: daily?.precipitation_probability_max?.[index] ?? null,
    }));

    const result: WeatherResult = {
      found: true,
      place: [location.name, location.admin1, location.country].filter(Boolean).join(", "),
      timezone: forecast.timezone,
      units: { temperature: "°C", rainChance: "%" },
      outlook,
      note:
        outlook.length === 0
          ? "Open-Meteo returned no days for that range — it is probably too far ahead to forecast."
          : "Do not call get_weather again this turn.",
    };
    turnWeather.set(key, result);
    // Bound memory if many sessions hit this isolate.
    if (turnWeather.size > 200) {
      const oldest = turnWeather.keys().next().value;
      if (oldest) turnWeather.delete(oldest);
    }
    return result;
  },
});
