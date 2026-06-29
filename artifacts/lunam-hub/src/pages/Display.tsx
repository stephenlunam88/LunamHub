import { useEffect, useState, useCallback } from "react";
import { useGetSettings, useListScreensaverPhotos, getGetSettingsQueryKey, getListScreensaverPhotosQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

// WMO weather code → emoji + label
const WMO: Record<number, { emoji: string; label: string }> = {
  0:  { emoji: "☀️",  label: "Clear" },
  1:  { emoji: "🌤️", label: "Mainly clear" },
  2:  { emoji: "⛅",  label: "Partly cloudy" },
  3:  { emoji: "☁️",  label: "Overcast" },
  45: { emoji: "🌫️", label: "Foggy" },
  48: { emoji: "🌫️", label: "Foggy" },
  51: { emoji: "🌦️", label: "Light drizzle" },
  53: { emoji: "🌦️", label: "Drizzle" },
  55: { emoji: "🌧️", label: "Heavy drizzle" },
  61: { emoji: "🌧️", label: "Light rain" },
  63: { emoji: "🌧️", label: "Rain" },
  65: { emoji: "🌧️", label: "Heavy rain" },
  71: { emoji: "❄️",  label: "Light snow" },
  73: { emoji: "❄️",  label: "Snow" },
  75: { emoji: "❄️",  label: "Heavy snow" },
  77: { emoji: "❄️",  label: "Snow grains" },
  80: { emoji: "🌦️", label: "Rain showers" },
  81: { emoji: "🌧️", label: "Showers" },
  82: { emoji: "🌧️", label: "Heavy showers" },
  85: { emoji: "❄️",  label: "Snow showers" },
  86: { emoji: "❄️",  label: "Heavy snow showers" },
  95: { emoji: "⛈️",  label: "Thunderstorm" },
  96: { emoji: "⛈️",  label: "Thunderstorm + hail" },
  99: { emoji: "⛈️",  label: "Thunderstorm + hail" },
};

function wmoInfo(code: number) {
  return WMO[code] ?? { emoji: "🌡️", label: "" };
}

interface Weather {
  temp: number;
  code: number;
  city: string;
}

async function fetchWeather(city: string): Promise<Weather | null> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`,
    );
    const geo = await geoRes.json();
    if (!geo.results?.length) return null;
    const { latitude, longitude, name } = geo.results[0];
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`,
    );
    const wx = await wxRes.json();
    return { temp: Math.round(wx.current.temperature_2m), code: wx.current.weather_code, city: name };
  } catch {
    return null;
  }
}

export default function Display() {
  const [, navigate]  = useLocation();
  const [now, setNow] = useState(new Date());
  const [photoIdx, setPhotoIdx] = useState(0);
  const [fade, setFade]         = useState(true);
  const [weather, setWeather]   = useState<Weather | null>(null);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: photos = [] } = useListScreensaverPhotos({
    query: { queryKey: getListScreensaverPhotosQueryKey(), refetchInterval: 300_000 },
  });

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Photo crossfade every N seconds (from settings, default 15)
  const photoIntervalMs = (settings?.screensaverPhotoInterval ?? 15) * 1000;
  useEffect(() => {
    if (photos.length <= 1) return;
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPhotoIdx(i => (i + 1) % photos.length);
        setFade(true);
      }, 800);
    }, photoIntervalMs);
    return () => clearInterval(t);
  }, [photos.length, photoIntervalMs]);

  // Weather: fetch on mount + every 30 min
  useEffect(() => {
    const city = settings?.weatherCity;
    if (!city) return;
    fetchWeather(city).then(w => { if (w) setWeather(w); });
    const t = setInterval(() => fetchWeather(city).then(w => { if (w) setWeather(w); }), 30 * 60_000);
    return () => clearInterval(t);
  }, [settings?.weatherCity]);

  const dismiss = useCallback(() => navigate("/"), [navigate]);

  const currentPhoto = photos[photoIdx];
  const wx = weather ? wmoInfo(weather.code) : null;

  return (
    <div
      className="fixed inset-0 overflow-hidden cursor-pointer select-none bg-black"
      onClick={dismiss}
    >
      {/* ── Background ───────────────────────────────────────────────── */}
      {currentPhoto ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${currentPhoto.url})`,
            opacity: fade ? 1 : 0,
            transition: "opacity 800ms ease-in-out",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950" />
      )}

      {/* Dark scrim */}
      <div className="absolute inset-0 bg-black/55" />

      {/* ── Clock (centred) ──────────────────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        <div
          className="font-bold font-mono tabular-nums leading-none tracking-tight text-white"
          style={{ fontSize: "clamp(5rem, 18vw, 18rem)", textShadow: "0 4px 40px rgba(0,0,0,.7)" }}
        >
          {format(now, "h:mm")}
          <span className="text-white/55 ml-2" style={{ fontSize: "clamp(2rem, 8vw, 8rem)" }}>
            {format(now, "a")}
          </span>
        </div>
        <div
          className="text-white/75 font-light tracking-widest uppercase"
          style={{ fontSize: "clamp(1.1rem, 3.5vw, 3.5rem)", textShadow: "0 2px 16px rgba(0,0,0,.6)" }}
        >
          {format(now, "EEEE, MMMM do")}
        </div>
      </div>

      {/* ── Weather (bottom-left) ─────────────────────────────────────── */}
      {weather && wx && (
        <div className="absolute bottom-8 left-8 text-white pointer-events-none">
          <div className="flex items-center gap-4">
            <span style={{ fontSize: "clamp(2.5rem,5vw,4rem)" }}>{wx.emoji}</span>
            <div>
              <div className="font-bold" style={{ fontSize: "clamp(2rem,4vw,3.5rem)" }}>
                {weather.temp}°C
              </div>
              <div className="text-white/65" style={{ fontSize: "clamp(0.9rem,1.5vw,1.4rem)" }}>
                {wx.label}{weather.city ? ` · ${weather.city}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo dots (bottom-centre) ────────────────────────────────── */}
      {photos.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none">
          {photos.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === photoIdx ? "1.5rem" : "0.5rem",
                height: "0.5rem",
                backgroundColor: i === photoIdx ? "white" : "rgba(255,255,255,0.35)",
              }}
            />
          ))}
        </div>
      )}

      {/* ── Tap hint (bottom-right) ───────────────────────────────────── */}
      <div className="absolute bottom-8 right-8 text-white/30 text-sm pointer-events-none">
        Tap anywhere to return
      </div>
    </div>
  );
}
