import { useEffect, useState, useCallback } from "react";
import { useGetSettings, useListScreensaverPhotos, getGetSettingsQueryKey, getListScreensaverPhotosQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import {
  bomWeatherIcon,
  getBomWeather,
  type BomWeather,
} from "@/components/WeatherWidget";

export default function Display() {
  const [, navigate]  = useLocation();
  const [now, setNow] = useState(new Date());
  const [photoIdx, setPhotoIdx] = useState(0);
  const [fade, setFade]         = useState(true);
  const [weather, setWeather]   = useState<BomWeather | null>(null);

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
    if (!settings?.weatherCity) return;
    getBomWeather().then(setWeather).catch(() => undefined);
    const t = setInterval(
      () => getBomWeather().then(setWeather).catch(() => undefined),
      30 * 60_000,
    );
    return () => clearInterval(t);
  }, [settings?.weatherCity]);

  // Force black background on html/body and theme-color while on display page
  // so iOS Safari's bottom toolbar area and safe-area gaps show black, not white.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevTheme  = themeMeta?.getAttribute("content") ?? null;
    html.style.backgroundColor = "black";
    body.style.backgroundColor = "black";
    themeMeta?.setAttribute("content", "#000000");
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      if (prevTheme !== null) themeMeta?.setAttribute("content", prevTheme);
    };
  }, []);

  const dismiss = useCallback(() => navigate("/"), [navigate]);

  const currentPhoto = photos[photoIdx];
  const todayWeather = weather?.forecast?.[0];

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
      {weather?.configured && todayWeather && (
        <div className="absolute bottom-8 left-8 text-white pointer-events-none">
          <div className="flex items-center gap-4">
            <span style={{ fontSize: "clamp(2.5rem,5vw,4rem)" }}>
              {bomWeatherIcon(todayWeather.iconCode)}
            </span>
            <div>
              <div className="font-bold" style={{ fontSize: "clamp(2rem,4vw,3.5rem)" }}>
                {todayWeather.min !== null ? `${todayWeather.min}° / ` : ""}
                {todayWeather.max !== null ? `${todayWeather.max}°` : ""}
              </div>
              <div className="text-white/65" style={{ fontSize: "clamp(0.9rem,1.5vw,1.4rem)" }}>
                {todayWeather.summary}
                {weather.location ? ` · ${weather.location}` : ""}
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
