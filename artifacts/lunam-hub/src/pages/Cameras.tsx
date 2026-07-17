import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, ExternalLink, Loader2, Minimize2, RefreshCw, ShieldCheck, VideoOff } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type NestDevice = {
  id: string;
  name: string;
  type: string;
  protocols: string[];
  maxVideoResolution: { width?: number; height?: number } | null;
  online: boolean;
};

type NestStatus = { configured: boolean; connected: boolean };

const CAMERA_CACHE_KEY = "lunamhub.nest.cameras";

function readCachedCameras(): NestDevice[] {
  try {
    const value = window.localStorage.getItem(CAMERA_CACHE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as NestDevice[]) : [];
  } catch {
    return [];
  }
}

function rememberCameras(cameras: NestDevice[]) {
  try {
    window.localStorage.setItem(CAMERA_CACHE_KEY, JSON.stringify(cameras));
  } catch {
    // Camera discovery still works when browser storage is unavailable.
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Request failed");
  return response.json() as Promise<T>;
}

function LiveCamera({ camera }: { camera: NestDevice }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const stop = useCallback(async () => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    connection?.close();
    if (videoRef.current) videoRef.current.srcObject = null;
    if (sessionRef.current) {
      const mediaSessionId = sessionRef.current;
      sessionRef.current = null;
      await fetch(`/api/google-nest/devices/${encodeURIComponent(camera.id)}/stop`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaSessionId }),
      }).catch(() => undefined);
    }
  }, [camera]);

  const start = useCallback(async () => {
    await stop();
    setLoading(true);
    setError(null);
    try {
      if (!camera.protocols.includes("WEB_RTC")) {
        throw new Error("This camera does not offer a browser-compatible WebRTC stream.");
      }
      const connection = new RTCPeerConnection();
      connectionRef.current = connection;
      connection.addTransceiver("audio", { direction: "recvonly" });
      connection.addTransceiver("video", { direction: "recvonly" });
      connection.createDataChannel("dataSendChannel");
      connection.ontrack = (event) => {
        if (videoRef.current) videoRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (connection.iceGatheringState === "complete") return resolve();
        const timeout = window.setTimeout(resolve, 3000);
        connection.addEventListener("icegatheringstatechange", () => {
          if (connection.iceGatheringState === "complete") {
            window.clearTimeout(timeout);
            resolve();
          }
        });
      });
      const offerSdp = connection.localDescription?.sdp;
      if (!offerSdp) throw new Error("The browser could not prepare the live stream.");

      const response = await fetch(
        `/api/google-nest/devices/${encodeURIComponent(camera.id)}/webrtc`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerSdp }),
        },
      );
      const data = (await response.json()) as {
        answerSdp?: string;
        mediaSessionId?: string;
        error?: string;
      };
      if (!response.ok || !data.answerSdp) throw new Error(data.error ?? "The camera stream could not be started.");
      sessionRef.current = data.mediaSessionId ?? null;
      await connection.setRemoteDescription({ type: "answer", sdp: data.answerSdp });
      await videoRef.current?.play().catch(() => undefined);
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "The camera stream could not be started.");
      await stop();
    } finally {
      setLoading(false);
    }
  }, [camera, stop]);

  useEffect(() => {
    void start();
    return () => {
      void stop();
    };
  }, [start, stop]);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Open ${camera.name} full screen`}
      onClick={() => setExpanded(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") setExpanded(true);
      }}
      className={expanded
        ? "fixed inset-0 z-[70] m-0 cursor-pointer overflow-hidden rounded-none border-0 bg-black shadow-none"
        : "cursor-pointer overflow-hidden rounded-3xl border-0 bg-slate-950 shadow-sm"}
    >
      <div className={expanded ? "relative h-full w-full bg-black" : "relative aspect-video bg-slate-950"}>
        <video ref={videoRef} autoPlay playsInline muted className={expanded ? "h-full w-full object-contain" : "h-full w-full object-cover"} />
        {expanded && (
          <Button
            size="icon"
            variant="secondary"
            aria-label="Exit full screen"
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 h-12 w-12 rounded-full"
            onClick={(event) => { event.stopPropagation(); setExpanded(false); }}
          >
            <Minimize2 className="h-6 w-6" />
          </Button>
        )}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Starting live stream…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-white">
            <VideoOff className="h-9 w-9 text-red-300" />
            <p className="text-sm">{error}</p>
            <Button size="sm" onClick={(event) => { event.stopPropagation(); void start(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 text-white">
          <div>
            <h2 className="font-bold">{camera.name}</h2>
            <p className="flex items-center gap-1.5 text-xs text-white/75">
              <span className="h-2 w-2 rounded-full bg-green-400" /> Live · muted · tap for full screen
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Cameras() {
  const cachedCamerasRef = useRef<NestDevice[]>(readCachedCameras());
  const status = useQuery({
    queryKey: ["google-nest", "status"],
    queryFn: () => getJson<NestStatus>("/api/google-nest/status"),
  });
  const devices = useQuery({
    queryKey: ["google-nest", "devices"],
    queryFn: async () => {
      const result = await getJson<{ devices: NestDevice[] }>("/api/google-nest/devices");
      rememberCameras(result.devices);
      return result;
    },
    enabled: status.data?.connected === true,
    initialData: cachedCamerasRef.current.length
      ? { devices: cachedCamerasRef.current }
      : undefined,
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
  });
  const cameraList = devices.data?.devices ?? cachedCamerasRef.current;

  return (
    <div className="space-y-5">
      <div>
        <PageHeader title="Cameras" />
        <p className="mt-1 text-muted-foreground">All available cameras start live automatically</p>
      </div>

      {status.isLoading && cameraList.length === 0 ? (
        <Card className="rounded-3xl border-0"><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>
      ) : status.data && !status.data.connected ? (
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"><Camera className="h-8 w-8" /></span>
            <div>
              <h2 className="font-serif text-2xl font-bold">Connect Google Nest</h2>
              <p className="mt-1 max-w-md text-muted-foreground">
                A parent needs to connect the Google account that owns your Nest home.
              </p>
            </div>
            <Button asChild className="h-12 rounded-xl px-6"><Link href="/admin">Open Parent settings</Link></Button>
          </CardContent>
        </Card>
      ) : devices.isError && cameraList.length === 0 ? (
        <Card className="rounded-3xl border-0"><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <p>{devices.error.message}</p>
          <Button onClick={() => devices.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Reload cameras</Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {cameraList.length} camera{cameraList.length === 1 ? "" : "s"} available
              {devices.isFetching && cameraList.length > 0 ? " · refreshing…" : ""}
            </p>
            <Button variant="outline" size="sm" onClick={() => devices.refetch()} disabled={devices.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${devices.isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cameraList.map((device) =>
              device.online && device.protocols.includes("WEB_RTC") ? (
                <LiveCamera key={device.id} camera={device} />
              ) : (
                <Card key={device.id} className="overflow-hidden rounded-3xl border-0 bg-slate-900 text-white shadow-sm opacity-70">
                  <CardContent className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
                    <VideoOff className="h-9 w-9 text-slate-400" />
                    <div>
                      <h2 className="font-bold">{device.name}</h2>
                      <p className="mt-1 text-sm text-slate-300">
                        {device.online ? "Google Home migration required" : "Live video unavailable"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ),
            )}
          </div>
          {cameraList.length === 0 && (
            <Card className="rounded-3xl border-0"><CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <Camera className="h-10 w-10 text-muted-foreground" />
              <p className="font-bold">No authorised cameras found</p>
              <p className="max-w-sm text-sm text-muted-foreground">Reconnect Google Nest and make sure the cameras are selected in Partner Connections Manager.</p>
              <a className="flex items-center gap-1 text-sm font-bold text-primary" href="https://nestservices.google.com/partnerconnections" target="_blank" rel="noreferrer">Manage Google access <ExternalLink className="h-4 w-4" /></a>
            </CardContent></Card>
          )}
        </>
      )}
      {cameraList.length > 0 && status.data?.connected && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-green-600" /> Live video is not stored by LunamHub. Streams stop when you leave this page.
        </p>
      )}
    </div>
  );
}
