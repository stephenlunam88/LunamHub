import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, ExternalLink, Loader2, RefreshCw, ShieldCheck, Video, VideoOff, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type NestDevice = {
  id: string;
  name: string;
  type: string;
  protocols: string[];
  maxVideoResolution: { width?: number; height?: number } | null;
  online: boolean;
};

type NestStatus = { configured: boolean; connected: boolean };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Request failed");
  return response.json() as Promise<T>;
}

function CameraViewer({
  camera,
  open,
  onOpenChange,
}: {
  camera: NestDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    connection?.close();
    if (videoRef.current) videoRef.current.srcObject = null;
    if (camera && sessionRef.current) {
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
    if (!camera || !open) return;
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
  }, [camera, open, stop]);

  useEffect(() => {
    if (open) void start();
    return () => {
      void stop();
    };
  }, [open, start, stop]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void stop(); onOpenChange(next); }}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col rounded-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-2xl">
            <Video className="h-5 w-5 text-primary" /> {camera?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
          <video ref={videoRef} autoPlay playsInline muted={false} className="h-full w-full object-contain" />
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
              <Loader2 className="h-9 w-9 animate-spin" />
              <span>Connecting securely…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
              <VideoOff className="h-10 w-10 text-red-300" />
              <p>{error}</p>
              <Button onClick={() => void start()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-green-600" /> Live video is not stored by LunamHub.</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="mr-2 h-4 w-4" /> Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Cameras() {
  const [selected, setSelected] = useState<NestDevice | null>(null);
  const status = useQuery({
    queryKey: ["google-nest", "status"],
    queryFn: () => getJson<NestStatus>("/api/google-nest/status"),
  });
  const devices = useQuery({
    queryKey: ["google-nest", "devices"],
    queryFn: () => getJson<{ devices: NestDevice[] }>("/api/google-nest/devices"),
    enabled: status.data?.connected === true,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-5">
      <div>
        <PageHeader title="Cameras" />
        <p className="mt-1 text-muted-foreground">Tap a camera to view it live</p>
      </div>

      {status.isLoading ? (
        <Card className="rounded-3xl border-0"><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>
      ) : !status.data?.connected ? (
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
      ) : devices.isError ? (
        <Card className="rounded-3xl border-0"><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <p>{devices.error.message}</p>
          <Button onClick={() => devices.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Reload cameras</Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{devices.data?.devices.length ?? 0} camera{devices.data?.devices.length === 1 ? "" : "s"} available</p>
            <Button variant="outline" size="sm" onClick={() => devices.refetch()} disabled={devices.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${devices.isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(devices.data?.devices ?? []).map((device) => (
              <button key={device.id} onClick={() => setSelected(device)} disabled={!device.online || !device.protocols.includes("WEB_RTC")}
                className="group min-h-48 overflow-hidden rounded-3xl bg-slate-900 text-left text-white shadow-sm transition-transform enabled:active:scale-[0.98] disabled:opacity-60">
                <div className="flex h-full min-h-48 flex-col justify-between bg-gradient-to-br from-slate-800 to-slate-950 p-5">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Video className="h-6 w-6" /></span>
                  <div>
                    <h2 className="text-xl font-bold">{device.name}</h2>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-300">
                      <span className={`h-2.5 w-2.5 rounded-full ${device.online ? "bg-green-400" : "bg-slate-500"}`} />
                      {!device.online
                        ? "Live video unavailable"
                        : device.protocols.includes("WEB_RTC")
                          ? "Tap to view live"
                          : "This camera requires Google Home migration"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {devices.data?.devices.length === 0 && (
            <Card className="rounded-3xl border-0"><CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <Camera className="h-10 w-10 text-muted-foreground" />
              <p className="font-bold">No authorised cameras found</p>
              <p className="max-w-sm text-sm text-muted-foreground">Reconnect Google Nest and make sure the cameras are selected in Partner Connections Manager.</p>
              <a className="flex items-center gap-1 text-sm font-bold text-primary" href="https://nestservices.google.com/partnerconnections" target="_blank" rel="noreferrer">Manage Google access <ExternalLink className="h-4 w-4" /></a>
            </CardContent></Card>
          )}
        </>
      )}
      <CameraViewer camera={selected} open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} />
    </div>
  );
}
