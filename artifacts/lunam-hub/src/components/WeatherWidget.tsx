import { useQuery } from "@tanstack/react-query";
import { CloudRain, MapPin } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

export type WeatherDay = {
  date: string;
  min: number | null;
  max: number | null;
  summary: string;
  iconCode: number | null;
  rainChance: number | null;
  rainMin: number | null;
  rainMax: number | null;
};

export type BomWeather = {
  configured: boolean;
  source?: "Bureau of Meteorology";
  location?: string;
  issuedAt?: string | null;
  forecast?: WeatherDay[];
  message?: string;
};

export function bomWeatherIcon(code: number | null) {
  if (code === null) return "🌤️";
  if ([1, 2].includes(code)) return "☀️";
  if (code === 3) return "⛅";
  if (code === 4) return "☁️";
  if ([6, 10].includes(code)) return "🌫️";
  if ([8, 11, 17].includes(code)) return "🌦️";
  if ([12, 18].includes(code)) return "🌧️";
  if (code === 15) return "❄️";
  if (code === 16) return "⛈️";
  if (code === 19) return "🌀";
  return "🌤️";
}

export async function getBomWeather(): Promise<BomWeather> {
  const response = await fetch("/api/weather", { credentials: "include" });
  const data = (await response.json().catch(() => ({}))) as BomWeather;
  if (!response.ok) throw new Error(data.message ?? "Weather unavailable");
  return data;
}

function rainLabel(day: WeatherDay) {
  if (day.rainMin === null && day.rainMax === null) return "0 mm";
  if (day.rainMin === day.rainMax) return `${day.rainMin ?? day.rainMax} mm`;
  return `${day.rainMin ?? 0}–${day.rainMax ?? 0} mm`;
}

export function WeatherWidget({ compact = false }: { compact?: boolean }) {
  const weather = useQuery({
    queryKey: ["bom-weather"],
    queryFn: getBomWeather,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
  const today = weather.data?.forecast?.[0];

  if (weather.isLoading) {
    return (
      <Card className="shrink-0 rounded-3xl border-0 bg-sky-50 shadow-sm">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Loading weather…
        </CardContent>
      </Card>
    );
  }

  if (!weather.data?.configured || weather.isError || !today) {
    return (
      <Card className="shrink-0 rounded-3xl border-0 bg-sky-50 shadow-sm">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="text-2xl">🌤️</span>
          <div className="min-w-0 flex-1">
            <b className="block">Weather</b>
            <small className="text-muted-foreground">
              {weather.error instanceof Error
                ? weather.error.message
                : weather.data?.message ?? "Set a Weather City in Parents."}
            </small>
          </div>
          <Link href="/admin" className="text-xs font-bold text-primary">
            Set up
          </Link>
        </CardContent>
      </Card>
    );
  }

  const followingDays = weather.data.forecast?.slice(1, compact ? 3 : 4) ?? [];
  return (
    <Card className="shrink-0 overflow-hidden rounded-3xl border-0 bg-sky-50 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{bomWeatherIcon(today.iconCode)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <MapPin className="h-3 w-3" /> {weather.data.location}
            </div>
            <b className="block truncate">{today.summary}</b>
            <span className="text-sm">
              {today.min !== null ? `${today.min}° / ` : ""}
              {today.max !== null ? `${today.max}°` : ""}
            </span>
          </div>
          <div className="rounded-2xl bg-blue-100 px-3 py-2 text-right text-blue-900">
            <span className="flex items-center justify-end gap-1 text-xs font-bold">
              <CloudRain className="h-3.5 w-3.5" />
              {today.rainChance ?? 0}%
            </span>
            <b className="whitespace-nowrap text-sm">{rainLabel(today)}</b>
          </div>
        </div>
        {!compact && followingDays.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-sky-100 pt-3">
            {followingDays.map((day) => (
              <div key={day.date} className="text-center text-xs">
                <b className="block">
                  {new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(
                    new Date(`${day.date}T00:00:00`),
                  )}
                </b>
                <span className="text-lg">{bomWeatherIcon(day.iconCode)}</span>
                <span className="block text-muted-foreground">
                  {day.max !== null ? `${day.max}°` : "—"} · {rainLabel(day)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Bureau of Meteorology
        </p>
      </CardContent>
    </Card>
  );
}
