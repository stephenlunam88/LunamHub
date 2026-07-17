import { useEffect, useRef, useState } from "react";
import {
  useGetSettings, useVerifyPin, useUpdateSettings,
  useCreateFamilyMember, useDeleteFamilyMember, useListFamilyMembers,
  useSetFamilyMemberPin, useSetFamilyMemberAvatar,
  useRequestUploadUrl,
  useListRewards, useCreateReward, useUpdateReward, useDeleteReward,
  useListStreakMilestones, useCreateStreakMilestone, useUpdateStreakMilestone, useDeleteStreakMilestone,
  useListScreensaverPhotos, useCreateScreensaverPhoto, useDeleteScreensaverPhoto,
  useUpdateFamilyMember,
  useListPointMilestones, useCreatePointMilestone, useUpdatePointMilestone, useDeletePointMilestone,
  useListChoreMilestones, useCreateChoreMilestone, useUpdateChoreMilestone, useDeleteChoreMilestone,
  useAwardBonusPoints,
  useListPointTransactions,
  useDeletePointTransaction,
  getGetSettingsQueryKey, getListFamilyMembersQueryKey,
  getListRewardsQueryKey, getListStreakMilestonesQueryKey, getListScreensaverPhotosQueryKey,
  getListPointMilestonesQueryKey, getListChoreMilestonesQueryKey,
  getListPointTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberOption } from "@/components/MemberAvatar";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useToast } from "@/hooks/use-toast";
import { Lock, Plus, Trash2, Pencil, Eye, EyeOff, Shield, Users, Settings as SettingsIcon, Key, Gift, Upload, CalendarDays, Flame, ImagePlay, Star, ListChecks, History, TrendingUp, TrendingDown, Minus, LogOut, UserRound, Monitor, Plug, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useGetGoogleCalendarStatus,
  useDisconnectGoogleCalendar,
  getGetGoogleCalendarStatusQueryKey,
} from "@workspace/api-client-react";
import type { FamilyMemberInput, FamilyMemberUpdate, RewardInput, RewardUpdate, Reward, StreakMilestone, StreakMilestoneInput, ScreensaverPhoto, PointMilestone, PointMilestoneInput, ChoreMilestone, ChoreMilestoneInput } from "@workspace/api-client-react";

export default function Admin() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);

  const verifyPin = useVerifyPin({
    mutation: {
      onSuccess: (data) => {
        if (data.valid) { setUnlocked(true); setPinError(false); }
        else { setPinError(true); setPin(""); }
      }
    }
  });

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-in fade-in duration-300">
        <Card className="rounded-3xl border-0 shadow-lg w-full max-w-sm">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-serif">Parent Area</CardTitle>
            <p className="text-muted-foreground mt-1">Enter your PIN to continue</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={e => { setPin(e.target.value); setPinError(false); }}
              onKeyDown={e => { if (e.key === "Enter") verifyPin.mutate({ data: { pin } }); }}
              placeholder="••••"
              className={`rounded-2xl h-16 text-2xl text-center tracking-[0.5em] ${pinError ? "border-red-500 bg-red-50" : ""}`}
            />
            {pinError && <p className="text-red-600 text-center text-sm">Incorrect PIN — try again</p>}
            <Button className="w-full h-14 rounded-2xl text-lg" onClick={() => verifyPin.mutate({ data: { pin } })} disabled={!pin || verifyPin.isPending}>
              {verifyPin.isPending ? "Checking…" : "Unlock"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminPanel onLock={() => setUnlocked(false)} />;
}

function ProfileAvatar({ name, avatarUrl, className = "h-12 w-12" }: { name: string; avatarUrl?: string | null; className?: string }) {
  return (
    <Avatar className={`${className} border-2 border-background shadow-sm`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={`${name}'s profile`} className="object-cover" />}
      <AvatarFallback className="bg-primary/10 text-primary">
        <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
        <span className="sr-only">No profile photo for {name}</span>
      </AvatarFallback>
    </Avatar>
  );
}

function SetPinDialog({ memberId, memberName, hasPin }: { memberId: number; memberName: string; hasPin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const setPinMutation = useSetFamilyMemberPin({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setNewPin(""); setConfirm(""); setMismatch(false);
      }
    }
  });

  const handleSave = () => {
    if (newPin !== confirm) { setMismatch(true); return; }
    setPinMutation.mutate({ id: memberId, data: { pin: newPin } });
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); setNewPin(""); setConfirm(""); setMismatch(false); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
          <Key className="w-3.5 h-3.5" />
          {hasPin ? "Change PIN" : "Set PIN"}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif flex items-center gap-2">
            <Key className="w-5 h-5" /> {hasPin ? "Change" : "Set"} PIN for {memberName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>New PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={e => { setNewPin(e.target.value); setMismatch(false); }}
              placeholder="Enter new PIN"
              className="rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1"
            />
          </div>
          <div>
            <Label>Confirm PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setMismatch(false); }}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              placeholder="Repeat new PIN"
              className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${mismatch ? "border-red-500 bg-red-50" : ""}`}
            />
            {mismatch && <p className="text-red-600 text-sm mt-1">PINs don't match</p>}
          </div>
          <Button
            className="w-full h-12 rounded-xl"
            onClick={handleSave}
            disabled={!newPin || !confirm || setPinMutation.isPending}
          >
            {setPinMutation.isPending ? "Saving…" : "Save PIN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AvatarUploadButton({ memberId, currentAvatarUrl }: { memberId: number; currentAvatarUrl?: string | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestUrl = useRequestUploadUrl();
  const setAvatar = useSetFamilyMemberAvatar({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() }) }
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { uploadURL, objectPath } = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject }
        );
      });
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const avatarUrl = `/api/storage${objectPath}`;
      setAvatar.mutate({ id: memberId, data: { avatarUrl } });
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {currentAvatarUrl && (
        <img src={currentAvatarUrl} alt="avatar" className="w-10 h-10 rounded-full object-cover border-2 border-muted" />
      )}
      <Button
        size="sm"
        variant="outline"
        className="rounded-xl gap-1.5"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5" />
        {uploading ? "Uploading…" : currentAvatarUrl ? "Change photo" : "Add photo"}
      </Button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function GoogleCalendarCard() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useGetGoogleCalendarStatus();
  const connected = status?.connected ?? false;
  const oauthAvailable = status?.oauthAvailable ?? false;

  // Show feedback when returning from the Google OAuth redirect
  const [gcalMsg, setGcalMsg] = useState<"connected" | "error" | null>(() => {
    const p = new URLSearchParams(window.location.search).get("gcal");
    return p === "connected" || p === "error" ? p : null;
  });

  useEffect(() => {
    if (!gcalMsg) return;
    // Invalidate status so the card re-checks connection
    qc.invalidateQueries({ queryKey: getGetGoogleCalendarStatusQueryKey() });
    // Clean the URL param without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete("gcal");
    window.history.replaceState({}, "", url.toString());
    const t = setTimeout(() => setGcalMsg(null), 6000);
    return () => clearTimeout(t);
  }, [gcalMsg, qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetGoogleCalendarStatusQueryKey() });
  const disconnect = useDisconnectGoogleCalendar({ mutation: { onSuccess: invalidate } });

  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5" /> Google Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {gcalMsg === "error" && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            Google authorisation failed — please try again.
          </div>
        )}
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Checking connection…</p>
        ) : connected ? (
          /* ── State 3: Connected and active ── */
          <>
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-4">
              <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-green-800">Connected</div>
                <p className="text-sm text-green-700 mt-0.5">
                  Events sync automatically when you open the Calendar page. Events added in LunamHub are also pushed to Google Calendar.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-xl h-11 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect Google Calendar"}
            </Button>
          </>
        ) : oauthAvailable ? (
          /* ── State 2: OAuth client configured — ready to authorise ── */
          <>
            <div className="flex items-center gap-3 bg-muted rounded-2xl p-4">
              <span className="w-3 h-3 rounded-full bg-gray-400 shrink-0" />
              <div>
                <div className="font-semibold">Not connected</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Click below to sign in with Google and grant calendar access.
                </p>
              </div>
            </div>
            <Button
              className="w-full rounded-xl h-11"
              onClick={() => { window.open("/api/auth/google/init", "_blank", "noopener"); }}
            >
              Connect with Google
            </Button>
          </>
        ) : (
          /* ── State 1: OAuth client credentials not configured ── */
          <>
            <div className="flex items-center gap-3 bg-muted rounded-2xl p-4">
              <span className="w-3 h-3 rounded-full bg-gray-400 shrink-0" />
              <div>
                <div className="font-semibold">Not configured</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Google Calendar sync requires OAuth credentials in your environment.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-border p-4 space-y-3 text-sm">
              <p className="font-semibold">Setup instructions:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                <li>Go to <span className="font-medium text-foreground">Google Cloud Console → APIs &amp; Services → Credentials</span>.</li>
                <li>Create an <span className="font-medium text-foreground">OAuth 2.0 Client ID</span> (type: Web application) and enable the <span className="font-medium text-foreground">Google Calendar API</span>.</li>
                <li>Add <code className="bg-muted-foreground/10 px-1 rounded">http://&lt;your-nas&gt;:3000/api/auth/google/callback</code> as an Authorised redirect URI.</li>
                <li>Set <code className="bg-muted-foreground/10 px-1 rounded">GOOGLE_OAUTH_CLIENT_ID</code>, <code className="bg-muted-foreground/10 px-1 rounded">GOOGLE_OAUTH_CLIENT_SECRET</code>, and <code className="bg-muted-foreground/10 px-1 rounded">GOOGLE_OAUTH_REDIRECT_URI</code> in your <code className="bg-muted-foreground/10 px-1 rounded">.env</code> file, then restart the API.</li>
              </ol>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleNestCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"connected" | "error" | null>(() => {
    const value = new URLSearchParams(window.location.search).get("nest");
    return value === "connected" || value === "error" ? value : null;
  });
  const status = useQuery({
    queryKey: ["google-nest", "status"],
    queryFn: async () => {
      const response = await fetch("/api/google-nest/status", { credentials: "include" });
      if (!response.ok) throw new Error("Could not check Google Nest connection");
      return response.json() as Promise<{ configured: boolean; connected: boolean }>;
    },
  });

  useEffect(() => {
    if (!message) return;
    void status.refetch();
    const url = new URL(window.location.href);
    url.searchParams.delete("nest");
    window.history.replaceState({}, "", url.toString());
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/google-nest/disconnect", {
        method: "POST",
        credentials: "include",
      });
      await status.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" /> Google Nest cameras
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {message === "connected" && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Google Nest connected successfully.
          </div>
        )}
        {message === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Google Nest authorisation failed. Please try again.
          </div>
        )}
        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking connection…</p>
        ) : status.data?.connected ? (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
              <span className="h-3 w-3 shrink-0 rounded-full bg-green-500" />
              <div>
                <div className="font-semibold text-green-800">Connected</div>
                <p className="mt-0.5 text-sm text-green-700">
                  Authorised cameras are available from the Cameras screen. Live video is opened only when requested.
                </p>
              </div>
            </div>
            <Button asChild className="h-11 w-full rounded-xl">
              <a href="/cameras">View cameras</a>
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl border-destructive/30 text-destructive"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              {busy ? "Disconnecting…" : "Disconnect Google Nest"}
            </Button>
          </>
        ) : status.data?.configured ? (
          <>
            <div className="rounded-2xl bg-muted p-4">
              <div className="font-semibold">Ready to connect</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in with the Google account that owns your Nest home, then choose which cameras LunamHub may access.
              </p>
            </div>
            <Button className="h-12 w-full rounded-xl" onClick={() => { window.location.href = "/api/google-nest/connect"; }}>
              Connect Google Nest
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-muted p-4">
              <div className="font-semibold">Device Access setup required</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a personal Google Device Access project, then add its details to LunamHub’s environment.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border p-4 text-sm text-muted-foreground">
              <p>Set <code className="rounded bg-muted px-1 text-foreground">NEST_DEVICE_ACCESS_PROJECT_ID</code> and <code className="rounded bg-muted px-1 text-foreground">NEST_OAUTH_REDIRECT_URI</code>.</p>
              <p>The redirect URI should be <code className="rounded bg-muted px-1 text-foreground">http://&lt;your-nas&gt;:3000/api/google-nest/callback</code>.</p>
              <p>You may reuse the existing Google OAuth client or provide dedicated <code className="rounded bg-muted px-1 text-foreground">NEST_OAUTH_CLIENT_ID</code> and secret values.</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MilestoneForm({ form, setForm }: { form: StreakMilestoneInput; setForm: React.Dispatch<React.SetStateAction<StreakMilestoneInput>> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Days threshold</Label>
          <Input type="number" min={1} value={form.days} onChange={e => setForm(f => ({ ...f, days: Number(e.target.value) }))} className="rounded-xl h-12" />
        </div>
        <div>
          <Label>Emoji</Label>
          <Input value={form.emoji ?? "🔥"} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} className="rounded-xl h-12" />
        </div>
      </div>
      <div>
        <Label>Title</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 7-Day Streak" className="rounded-xl h-12" />
      </div>
      <div>
        <Label>Description (optional)</Label>
        <Input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="rounded-xl h-12" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Tier</Label>
          <Select value={form.tier ?? "bronze"} onValueChange={v => setForm(f => ({ ...f, tier: v as StreakMilestoneInput["tier"] }))}>
            <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bronze">🥉 Bronze</SelectItem>
              <SelectItem value="silver">🥈 Silver</SelectItem>
              <SelectItem value="gold">🥇 Gold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bonus points</Label>
          <Input type="number" min={0} value={form.bonusPoints ?? 0} onChange={e => setForm(f => ({ ...f, bonusPoints: Number(e.target.value) }))} className="rounded-xl h-12" />
        </div>
      </div>
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-slate-100 text-slate-700",
  gold:   "bg-yellow-100 text-yellow-800",
};

const BLANK_MILESTONE: StreakMilestoneInput = { days: 7, title: "", emoji: "🔥", tier: "bronze", bonusPoints: 10, active: true };
const BLANK_POINT_MILESTONE: PointMilestoneInput = { threshold: 100, title: "", emoji: "⭐", tier: "bronze", bonusPoints: 10, active: true };
const BLANK_CHORE_MILESTONE: ChoreMilestoneInput = { threshold: 10, title: "", emoji: "🎯", tier: "bronze", bonusPoints: 15, active: true };

function ThresholdMilestoneForm<T extends { threshold: number; title: string; description?: string; emoji?: string; tier?: string; bonusPoints?: number; active?: boolean }>({
  form, setForm, label,
}: { form: T; setForm: React.Dispatch<React.SetStateAction<T>>; label: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>{label} threshold</Label>
          <Input type="number" min={1} value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))} className="rounded-xl h-12" />
        </div>
        <div>
          <Label>Emoji</Label>
          <Input value={form.emoji ?? ""} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} className="rounded-xl h-12" />
        </div>
      </div>
      <div>
        <Label>Title</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Point Collector" className="rounded-xl h-12" />
      </div>
      <div>
        <Label>Description (optional)</Label>
        <Input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="rounded-xl h-12" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Tier</Label>
          <Select value={form.tier ?? "bronze"} onValueChange={v => setForm(f => ({ ...f, tier: v as "bronze" | "silver" | "gold" }))}>
            <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bronze">🥉 Bronze</SelectItem>
              <SelectItem value="silver">🥈 Silver</SelectItem>
              <SelectItem value="gold">🥇 Gold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bonus points</Label>
          <Input type="number" min={0} value={form.bonusPoints ?? 0} onChange={e => setForm(f => ({ ...f, bonusPoints: Number(e.target.value) }))} className="rounded-xl h-12" />
        </div>
      </div>
    </div>
  );
}

const TX_TYPE_CONFIG: Record<string, { label: string; chipClass: string; icon: React.ReactNode; sign: string }> = {
  chore_earned: { label: "Chore earned",      chipClass: "bg-green-100 text-green-800",   icon: <TrendingUp className="w-3.5 h-3.5" />,   sign: "+" },
  bonus:        { label: "Bonus",             chipClass: "bg-blue-100 text-blue-800",     icon: <Star className="w-3.5 h-3.5" />,         sign: "+" },
  reward_spent: { label: "Reward redeemed",   chipClass: "bg-purple-100 text-purple-800", icon: <TrendingDown className="w-3.5 h-3.5" />, sign: "-" },
  adjustment:   { label: "Adjustment",        chipClass: "bg-gray-100 text-gray-700",     icon: <Minus className="w-3.5 h-3.5" />,        sign: "" },
};

function PointsHistoryCard({ members }: { members: { id: number; name: string; avatarUrl?: string | null; role: string }[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const memberId = selectedId ? Number(selectedId) : undefined;
  const qc = useQueryClient();

  const { data: txns = [], isLoading } = useListPointTransactions(
    { memberId: memberId ?? null },
    { query: { enabled: !!memberId, queryKey: getListPointTransactionsQueryKey({ memberId: memberId ?? null }) } }
  );

  const { mutate: deleteTxn, isPending: isDeleting } = useDeletePointTransaction({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPointTransactionsQueryKey({ memberId: memberId ?? null }) });
        qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() });
        setConfirmDeleteId(null);
      },
    },
  });

  const sorted = [...txns].reverse();
  const children = members.filter(m => m.role === "child");

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const totalPoints = txns.reduce((sum, t) => sum + t.amount, 0);
  const confirmTx = confirmDeleteId !== null ? txns.find(t => t.id === confirmDeleteId) : null;

  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Points History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">View every points transaction for a child — chores earned, bonuses awarded, and rewards spent.</p>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select a child…" /></SelectTrigger>
          <SelectContent>
            {children.map(m => (
              <SelectItem key={m.id} value={String(m.id)}><MemberOption name={m.name} avatarUrl={m.avatarUrl} /></SelectItem>
            ))}
          </SelectContent>
        </Select>

        {memberId && (
          <>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading transactions…</p>
            ) : sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">No transactions yet for this child.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm px-1">
                  <span className="text-muted-foreground">{sorted.length} transaction{sorted.length !== 1 ? "s" : ""}</span>
                  <span className={`font-semibold ${totalPoints >= 0 ? "text-green-700" : "text-red-600"}`}>
                    Total: {totalPoints >= 0 ? "+" : ""}{totalPoints} pts
                  </span>
                </div>
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {sorted.map(tx => {
                    const cfg = TX_TYPE_CONFIG[tx.type] ?? TX_TYPE_CONFIG["adjustment"];
                    const amountStr = `${cfg.sign}${Math.abs(tx.amount)} pts`;
                    const isPositive = tx.amount > 0;
                    const isDeletable = tx.type === "bonus" || tx.type === "adjustment";
                    return (
                      <div key={tx.id} className="flex items-start gap-3 rounded-2xl bg-muted/50 px-4 py-3">
                        <div className="mt-0.5 shrink-0">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.chipClass}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{tx.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(tx.createdAt)}</p>
                        </div>
                        <span className={`text-sm font-bold shrink-0 ${isPositive ? "text-green-700" : "text-red-600"}`}>
                          {amountStr}
                        </span>
                        {isDeletable && (
                          <button
                            onClick={() => setConfirmDeleteId(tx.id)}
                            className="shrink-0 ml-1 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Delete transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
          <DialogContent className="rounded-3xl max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete transaction?</DialogTitle>
            </DialogHeader>
            {confirmTx && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will permanently remove the <strong>{TX_TYPE_CONFIG[confirmTx.type]?.label ?? confirmTx.type}</strong> transaction
                  {" "}"{confirmTx.description}" ({confirmTx.amount > 0 ? "+" : ""}{confirmTx.amount} pts) and reverse its effect on the member's balance.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" className="rounded-xl" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    className="rounded-xl"
                    disabled={isDeleting}
                    onClick={() => deleteTxn({ id: confirmTx.id })}
                  >
                    {isDeleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function AdminPanel({ onLock }: { onLock: () => void }) {
  const [adminSection, setAdminSection] = useState<"family" | "rewards" | "milestones" | "display" | "connections" | "security">("family");
  const [milestoneSection, setMilestoneSection] = useState<"streaks" | "points" | "chores">("streaks");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const [settingsForm, setSettingsForm] = useState({
    appName: "LunamHub",
    weatherCity: "",
    screensaverTimeout: 5,
    screensaverPhotoInterval: 15,
  });
  const { data: members = [] } = useListFamilyMembers();
  const { data: rewards = [] } = useListRewards();
  const { data: milestones = [] } = useListStreakMilestones();
  const { data: ssPhotos = [] } = useListScreensaverPhotos();
  const { data: pointMilestones = [] } = useListPointMilestones();
  const { data: choreMilestones = [] } = useListChoreMilestones();
  const [newPin, setNewPin] = useState("");
  const [ssUploading, setSsUploading] = useState(false);
  const ssFileRef = useRef<HTMLInputElement>(null);
  const [memberForm, setMemberForm] = useState<FamilyMemberInput>({ name: "", emoji: "😊", color: "#6366f1", role: "child" });
  const [newMemberPhoto, setNewMemberPhoto] = useState<File | null>(null);
  const [newMemberPhotoPreview, setNewMemberPhotoPreview] = useState<string | null>(null);
  const [newMemberPhotoError, setNewMemberPhotoError] = useState<string | null>(null);
  const [newMemberPhotoUploading, setNewMemberPhotoUploading] = useState(false);
  const newMemberPhotoRef = useRef<HTMLInputElement>(null);
  const [newMemberPin, setNewMemberPin] = useState("");
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardForm, setRewardForm] = useState<RewardInput>({ title: "", pointsCost: 100 });
  const [editRewardOpen, setEditRewardOpen] = useState(false);
  const [editRewardTarget, setEditRewardTarget] = useState<Reward | null>(null);
  const [editRewardForm, setEditRewardForm] = useState<RewardUpdate>({ title: "", pointsCost: 100 });
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState<StreakMilestoneInput>(BLANK_MILESTONE);
  const [editMilestoneOpen, setEditMilestoneOpen] = useState(false);
  const [editMilestoneTarget, setEditMilestoneTarget] = useState<StreakMilestone | null>(null);
  const [editMilestoneForm, setEditMilestoneForm] = useState<StreakMilestoneInput>(BLANK_MILESTONE);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [editMemberTarget, setEditMemberTarget] = useState<{ id: number; name: string } | null>(null);
  const [editMemberForm, setEditMemberForm] = useState<FamilyMemberUpdate>({});
  const [pointMilestoneOpen, setPointMilestoneOpen] = useState(false);
  const [pointMilestoneForm, setPointMilestoneForm] = useState<PointMilestoneInput>(BLANK_POINT_MILESTONE);
  const [editPointMilestoneOpen, setEditPointMilestoneOpen] = useState(false);
  const [editPointMilestoneTarget, setEditPointMilestoneTarget] = useState<PointMilestone | null>(null);
  const [editPointMilestoneForm, setEditPointMilestoneForm] = useState<PointMilestoneInput>(BLANK_POINT_MILESTONE);
  const [choreMilestoneOpen, setChoreMilestoneOpen] = useState(false);
  const [choreMilestoneForm, setChoreMilestoneForm] = useState<ChoreMilestoneInput>(BLANK_CHORE_MILESTONE);
  const [editChoreMilestoneOpen, setEditChoreMilestoneOpen] = useState(false);
  const [editChoreMilestoneTarget, setEditChoreMilestoneTarget] = useState<ChoreMilestone | null>(null);
  const [editChoreMilestoneForm, setEditChoreMilestoneForm] = useState<ChoreMilestoneInput>(BLANK_CHORE_MILESTONE);
  const [bonusChildId, setBonusChildId] = useState<string>("");
  const [bonusMode, setBonusMode] = useState<"award" | "deduct">("award");
  const [bonusAmount, setBonusAmount] = useState<number>(10);
  const [bonusReason, setBonusReason] = useState<string>("");
  const [bonusSuccess, setBonusSuccess] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSettingsForm({
      appName: settings.appName ?? "LunamHub",
      weatherCity: settings.weatherCity ?? "",
      screensaverTimeout: settings.screensaverTimeout ?? 5,
      screensaverPhotoInterval: settings.screensaverPhotoInterval ?? 15,
    });
  }, [settings]);

  const invalidateRewards = () => qc.invalidateQueries({ queryKey: getListRewardsQueryKey() });
  const invalidateMilestones = () => qc.invalidateQueries({ queryKey: getListStreakMilestonesQueryKey() });
  const invalidatePhotos = () => qc.invalidateQueries({ queryKey: getListScreensaverPhotosQueryKey() });
  const createPhoto = useCreateScreensaverPhoto({ mutation: { onSuccess: invalidatePhotos } });
  const deletePhoto = useDeleteScreensaverPhoto({ mutation: {
    onSuccess: () => { invalidatePhotos(); toast({ title: "Photo deleted" }); },
    onError: () => toast({ title: "Could not delete photo", description: "Please try again.", variant: "destructive" }),
  } });
  const requestUrl = useRequestUploadUrl();

  const handleSsPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSsUploading(true);
    try {
      const { uploadURL, objectPath } = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUrl.mutate({ data: { name: file.name, size: file.size, contentType: file.type } }, { onSuccess: resolve, onError: reject });
      });
      const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      createPhoto.mutate({ data: { url: `/api/storage${objectPath}`, filename: file.name } });
    } catch { /* ignore */ } finally {
      setSsUploading(false);
      if (ssFileRef.current) ssFileRef.current.value = "";
    }
  };

  const invalidatePointMilestones = () => qc.invalidateQueries({ queryKey: getListPointMilestonesQueryKey() });
  const invalidateChoreMilestones = () => qc.invalidateQueries({ queryKey: getListChoreMilestonesQueryKey() });
  const updateSettings = useUpdateSettings({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) } });
  const invalidateMembers = () => qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() });
  const createMember = useCreateFamilyMember({ mutation: { onSuccess: () => {
    invalidateMembers();
    setMemberForm({ name: "", emoji: "😊", color: "#6366f1", role: "child" });
    setNewMemberPin("");
    setNewMemberPhoto(null);
    setNewMemberPhotoPreview(current => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (newMemberPhotoRef.current) newMemberPhotoRef.current.value = "";
  } } });
  const updateMember = useUpdateFamilyMember({ mutation: { onSuccess: () => { invalidateMembers(); setEditMemberOpen(false); setEditMemberTarget(null); } } });
  const deleteMember = useDeleteFamilyMember({ mutation: {
    onSuccess: () => { invalidateMembers(); toast({ title: "Family member deleted" }); },
    onError: () => toast({ title: "Could not delete family member", description: "Please try again.", variant: "destructive" }),
  } });
  const createReward = useCreateReward({ mutation: { onSuccess: () => { invalidateRewards(); setRewardOpen(false); setRewardForm({ title: "", pointsCost: 100 }); } } });
  const updateReward = useUpdateReward({ mutation: { onSuccess: () => { invalidateRewards(); setEditRewardOpen(false); setEditRewardTarget(null); } } });
  const deleteReward = useDeleteReward({ mutation: {
    onSuccess: () => { invalidateRewards(); toast({ title: "Reward deleted" }); },
    onError: () => toast({ title: "Could not delete reward", description: "Please try again.", variant: "destructive" }),
  } });
  const createMilestone = useCreateStreakMilestone({ mutation: { onSuccess: () => { invalidateMilestones(); setMilestoneOpen(false); setMilestoneForm(BLANK_MILESTONE); } } });
  const updateMilestone = useUpdateStreakMilestone({ mutation: { onSuccess: () => { invalidateMilestones(); setEditMilestoneOpen(false); setEditMilestoneTarget(null); } } });
  const deleteMilestone = useDeleteStreakMilestone({ mutation: {
    onSuccess: () => { invalidateMilestones(); toast({ title: "Streak milestone deleted" }); },
    onError: () => toast({ title: "Could not delete milestone", description: "Please try again.", variant: "destructive" }),
  } });
  const createPointMilestone = useCreatePointMilestone({ mutation: { onSuccess: () => { invalidatePointMilestones(); setPointMilestoneOpen(false); setPointMilestoneForm(BLANK_POINT_MILESTONE); } } });
  const updatePointMilestone = useUpdatePointMilestone({ mutation: { onSuccess: () => { invalidatePointMilestones(); setEditPointMilestoneOpen(false); setEditPointMilestoneTarget(null); } } });
  const deletePointMilestone = useDeletePointMilestone({ mutation: {
    onSuccess: () => { invalidatePointMilestones(); toast({ title: "Point milestone deleted" }); },
    onError: () => toast({ title: "Could not delete milestone", description: "Please try again.", variant: "destructive" }),
  } });
  const createChoreMilestone = useCreateChoreMilestone({ mutation: { onSuccess: () => { invalidateChoreMilestones(); setChoreMilestoneOpen(false); setChoreMilestoneForm(BLANK_CHORE_MILESTONE); } } });
  const updateChoreMilestone = useUpdateChoreMilestone({ mutation: { onSuccess: () => { invalidateChoreMilestones(); setEditChoreMilestoneOpen(false); setEditChoreMilestoneTarget(null); } } });
  const deleteChoreMilestone = useDeleteChoreMilestone({ mutation: {
    onSuccess: () => { invalidateChoreMilestones(); toast({ title: "Chore milestone deleted" }); },
    onError: () => toast({ title: "Could not delete milestone", description: "Please try again.", variant: "destructive" }),
  } });
  const awardBonus = useAwardBonusPoints({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() });
        setBonusChildId("");
        setBonusAmount(10);
        setBonusReason("");
        setBonusSuccess(true);
        setTimeout(() => setBonusSuccess(false), 3000);
      }
    }
  });

  function openEditReward(r: Reward) {
    setEditRewardTarget(r);
    setEditRewardForm({ title: r.title, description: r.description ?? undefined, pointsCost: r.pointsCost, active: r.active });
    setEditRewardOpen(true);
  }

  function openEditMilestone(m: StreakMilestone) {
    setEditMilestoneTarget(m);
    setEditMilestoneForm({ days: m.days, title: m.title, description: m.description ?? undefined, emoji: m.emoji, tier: m.tier as StreakMilestoneInput["tier"], bonusPoints: m.bonusPoints, active: m.active });
    setEditMilestoneOpen(true);
  }

  function openEditPointMilestone(m: PointMilestone) {
    setEditPointMilestoneTarget(m);
    setEditPointMilestoneForm({ threshold: m.threshold, title: m.title, description: m.description ?? undefined, emoji: m.emoji, tier: m.tier as PointMilestoneInput["tier"], bonusPoints: m.bonusPoints, active: m.active });
    setEditPointMilestoneOpen(true);
  }

  function openEditChoreMilestone(m: ChoreMilestone) {
    setEditChoreMilestoneTarget(m);
    setEditChoreMilestoneForm({ threshold: m.threshold, title: m.title, description: m.description ?? undefined, emoji: m.emoji, tier: m.tier as ChoreMilestoneInput["tier"], bonusPoints: m.bonusPoints, active: m.active });
    setEditChoreMilestoneOpen(true);
  }

  function handleNewMemberPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setNewMemberPhoto(file);
    setNewMemberPhotoError(null);
    setNewMemberPhotoPreview(current => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleCreateMember() {
    setNewMemberPhotoError(null);
    setNewMemberPhotoUploading(!!newMemberPhoto);
    try {
      let avatarUrl: string | undefined;
      if (newMemberPhoto) {
        const { uploadURL, objectPath } = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
          requestUrl.mutate(
            { data: { name: newMemberPhoto.name, size: newMemberPhoto.size, contentType: newMemberPhoto.type } },
            { onSuccess: resolve, onError: reject }
          );
        });
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: newMemberPhoto,
          headers: { "Content-Type": newMemberPhoto.type },
        });
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
        avatarUrl = `/api/storage${objectPath}`;
      }

      const data = memberForm.role === "parent"
        ? { ...memberForm, avatarUrl, pin: newMemberPin } as Parameters<typeof createMember.mutate>[0]["data"]
        : { ...memberForm, avatarUrl };
      createMember.mutate({ data });
    } catch {
      setNewMemberPhotoError("Profile picture upload failed. Please try again.");
    } finally {
      setNewMemberPhotoUploading(false);
    }
  }

  const sections = [
    { id: "family", label: "Family", icon: Users },
    { id: "rewards", label: "Rewards & Points", icon: Gift },
    { id: "milestones", label: "Milestones", icon: Star },
    { id: "display", label: "Display", icon: Monitor },
    { id: "connections", label: "Connections", icon: Plug },
    { id: "security", label: "Security", icon: Shield },
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="Parent Area"
        icon={<Shield className="h-8 w-8 text-primary" aria-hidden="true" />}
        actions={(
          <Button variant="outline" className="h-12 rounded-2xl px-5 gap-2" onClick={onLock}>
            <Lock className="h-4 w-4" aria-hidden="true" /> Lock
          </Button>
        )}
      />

      <nav aria-label="Admin sections" className="sticky top-0 z-20 -mx-2 overflow-x-auto rounded-2xl bg-background/95 p-2 shadow-sm backdrop-blur">
        <div className="flex min-w-max gap-2">
          {sections.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant={adminSection === id ? "default" : "ghost"}
              className="h-11 rounded-xl gap-2"
              onClick={() => setAdminSection(id)}
            >
              <Icon className="h-4 w-4" /> {label}
            </Button>
          ))}
        </div>
      </nav>

      {adminSection === "milestones" && (
        <div className="flex gap-2 rounded-2xl bg-muted p-1.5" role="tablist" aria-label="Milestone type">
          {(["streaks", "points", "chores"] as const).map(type => (
            <Button key={type} variant={milestoneSection === type ? "secondary" : "ghost"} className="flex-1 capitalize rounded-xl" onClick={() => setMilestoneSection(type)}>
              {type}
            </Button>
          ))}
        </div>
      )}

      <Card className={`${adminSection === "family" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Family Members</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Edit Member Dialog */}
          <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
            <DialogContent className="rounded-3xl max-w-sm">
              <DialogHeader>
                <DialogTitle>Edit {editMemberTarget?.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editMemberForm.name ?? ""}
                    onChange={e => setEditMemberForm(f => ({ ...f, name: e.target.value }))}
                    className="rounded-xl h-12 mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Role</Label>
                    <Select
                      value={editMemberForm.role ?? "child"}
                      onValueChange={v => setEditMemberForm(f => ({ ...f, role: v as FamilyMemberUpdate["role"] }))}
                    >
                      <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Colour</Label>
                    <Input
                      type="color"
                      value={editMemberForm.color ?? "#6366f1"}
                      onChange={e => setEditMemberForm(f => ({ ...f, color: e.target.value }))}
                      className="rounded-xl h-12 mt-1 p-1"
                    />
                  </div>
                </div>
                <Button
                  className="w-full h-12 rounded-xl"
                  disabled={!editMemberForm.name || updateMember.isPending}
                  onClick={() => editMemberTarget && updateMember.mutate({ id: editMemberTarget.id, data: editMemberForm })}
                >
                  {updateMember.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {members.map(m => (
            <div key={m.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 bg-muted rounded-2xl p-4">
              <ProfileAvatar name={m.name} avatarUrl={m.avatarUrl} />
              <div className="flex-1 min-w-0">
                <div className="font-bold">{m.name}</div>
                <div className="text-sm text-muted-foreground capitalize">
                  {m.role}{m.role === "child" ? ` · ${m.pointsBalance} pts · ${m.lifetimePoints ?? 0} all-time` : ""}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <AvatarUploadButton memberId={m.id} currentAvatarUrl={m.avatarUrl} />
                {m.role === "parent" && (
                  <SetPinDialog memberId={m.id} memberName={m.name} hasPin={m.hasPin} />
                )}
              </div>
              <button
                onClick={() => {
                  setEditMemberTarget({ id: m.id, name: m.name });
                  setEditMemberForm({ name: m.name, color: m.color ?? "#6366f1", role: m.role as FamilyMemberUpdate["role"] });
                  setEditMemberOpen(true);
                }}
                className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-primary"
                aria-label={`Edit ${m.name}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <ConfirmDeleteDialog title={`Delete ${m.name}?`} description="This removes the family member and may remove related family data. This action cannot be undone." onConfirm={() => deleteMember.mutate({ id: m.id })} trigger={<button className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${m.name}`}><Trash2 className="h-5 w-5" aria-hidden="true" /></button>} />
            </div>
          ))}
          <Separator />
          <div className="space-y-3">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">Add Member</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl h-12" /></div>
              <div>
                <Label>Profile picture</Label>
                <div className="mt-1 flex h-12 items-center gap-3">
                  <ProfileAvatar name={memberForm.name || "New member"} avatarUrl={newMemberPhotoPreview} className="h-12 w-12" />
                  <Button type="button" variant="outline" className="h-12 flex-1 rounded-xl gap-2" onClick={() => newMemberPhotoRef.current?.click()}>
                    <Upload className="h-4 w-4" /> {newMemberPhoto ? "Change photo" : "Choose photo"}
                  </Button>
                  <input ref={newMemberPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleNewMemberPhoto} />
                </div>
              </div>
              <div><Label>Role</Label>
                <Select value={memberForm.role ?? "child"} onValueChange={v => setMemberForm(f => ({ ...f, role: v as FamilyMemberInput["role"] }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Colour</Label><Input type="color" value={memberForm.color ?? "#6366f1"} onChange={e => setMemberForm(f => ({ ...f, color: e.target.value }))} className="rounded-xl h-12 p-1" /></div>
            </div>
            {memberForm.role === "parent" && (
              <div>
                <Label className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> PIN (required for parents, min 4 digits)</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="e.g. 1234"
                  value={newMemberPin}
                  onChange={e => setNewMemberPin(e.target.value.replace(/\D/g, ""))}
                  className="rounded-xl h-12 mt-1 font-mono tracking-widest"
                />
              </div>
            )}
            {newMemberPhotoError && <p className="text-sm text-red-600">{newMemberPhotoError}</p>}
            <Button
              className="w-full h-14 rounded-xl gap-2"
              onClick={handleCreateMember}
              disabled={!memberForm.name || (memberForm.role === "parent" && newMemberPin.length < 4) || newMemberPhotoUploading || createMember.isPending}
            >
              <Plus className="w-4 h-4" /> {newMemberPhotoUploading ? "Uploading photo…" : createMember.isPending ? "Adding…" : "Add Member"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={`${adminSection === "rewards" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Gift className="w-5 h-5" /> Reward Store</CardTitle>
            <Dialog open={rewardOpen} onOpenChange={setRewardOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Reward</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle className="text-xl font-serif">New Reward</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Title</Label><Input value={rewardForm.title} onChange={e => setRewardForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12" /></div>
                  <div><Label>Description</Label><Input value={rewardForm.description ?? ""} onChange={e => setRewardForm(f => ({ ...f, description: e.target.value }))} className="rounded-xl h-12" /></div>
                  <div><Label>Points Cost</Label><Input type="number" value={rewardForm.pointsCost} onChange={e => setRewardForm(f => ({ ...f, pointsCost: Number(e.target.value) }))} className="rounded-xl h-12" /></div>
                  <Button className="w-full h-12 rounded-xl" onClick={() => createReward.mutate({ data: rewardForm })} disabled={!rewardForm.title || createReward.isPending}>
                    {createReward.isPending ? "Adding…" : "Add Reward"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rewards.length === 0 && (
            <p className="text-muted-foreground text-sm">No rewards yet — add some for your family!</p>
          )}
          {rewards.map(r => (
            <div key={r.id} className={`flex items-center gap-4 rounded-2xl p-4 ${r.active ? "bg-muted" : "bg-muted/40 opacity-60"}`}>
              <div className="text-2xl">🎁</div>
              <div className="flex-1">
                <div className="font-bold flex items-center gap-2">
                  {r.title}
                  {!r.active && <span className="text-xs bg-muted-foreground/20 text-muted-foreground px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                {r.description && <div className="text-sm text-muted-foreground">{r.description}</div>}
              </div>
              <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-xl font-bold text-sm">{r.pointsCost} pts</div>
              <button
                onClick={() => updateReward.mutate({ id: r.id, data: { ...r, description: r.description ?? undefined, active: !r.active } })}
                className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground"
                aria-label={`${r.active ? "Deactivate" : "Activate"} ${r.title}`}
              >
                {r.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => openEditReward(r)} className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground" aria-label={`Edit ${r.title}`}>
                <Pencil className="w-4 h-4" />
              </button>
              <ConfirmDeleteDialog title={`Delete “${r.title}”?`} description="This reward will be removed from the store. This action cannot be undone." onConfirm={() => deleteReward.mutate({ id: r.id })} trigger={<button className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${r.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editRewardOpen} onOpenChange={setEditRewardOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="text-xl font-serif">Edit Reward</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={editRewardForm.title ?? ""} onChange={e => setEditRewardForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12" /></div>
            <div><Label>Description</Label><Input value={editRewardForm.description ?? ""} onChange={e => setEditRewardForm(f => ({ ...f, description: e.target.value }))} className="rounded-xl h-12" /></div>
            <div><Label>Points Cost</Label><Input type="number" value={editRewardForm.pointsCost ?? 100} onChange={e => setEditRewardForm(f => ({ ...f, pointsCost: Number(e.target.value) }))} className="rounded-xl h-12" /></div>
            <div className="flex items-center gap-3">
              <Label>Active in store</Label>
              <button
                type="button"
                onClick={() => setEditRewardForm(f => ({ ...f, active: !f.active }))}
                className={`w-12 h-6 rounded-full transition-colors ${editRewardForm.active ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5 ${editRewardForm.active ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
            <Button
              className="w-full h-12 rounded-xl"
              onClick={() => editRewardTarget && updateReward.mutate({ id: editRewardTarget.id, data: editRewardForm })}
              disabled={!editRewardForm.title || updateReward.isPending}
            >
              {updateReward.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Streak Milestones ─────────────────────────────────────────── */}
      <Card className={`${adminSection === "milestones" && milestoneSection === "streaks" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Flame className="w-5 h-5" /> Streak Milestones</CardTitle>
            <Dialog open={milestoneOpen} onOpenChange={o => { setMilestoneOpen(o); if (!o) setMilestoneForm(BLANK_MILESTONE); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Milestone</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle className="text-xl font-serif">New Streak Milestone</DialogTitle></DialogHeader>
                <MilestoneForm form={milestoneForm} setForm={setMilestoneForm} />
                <Button className="w-full h-12 rounded-xl mt-2" onClick={() => createMilestone.mutate({ data: milestoneForm })} disabled={!milestoneForm.title || !milestoneForm.days || createMilestone.isPending}>
                  {createMilestone.isPending ? "Adding…" : "Add Milestone"}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">When a child reaches a consecutive-day streak, they earn a badge and bonus points. Configure your own thresholds here.</p>
          {milestones.length === 0 && (
            <p className="text-muted-foreground text-sm italic">No milestones yet — add one above.</p>
          )}
          {[...milestones].sort((a, b) => a.days - b.days).map(m => (
            <div key={m.id} className={`flex items-center gap-4 rounded-2xl p-4 ${m.active ? "bg-muted" : "bg-muted/40 opacity-60"}`}>
              <div className="text-2xl">{m.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center gap-2 flex-wrap">
                  {m.title}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TIER_COLORS[m.tier] ?? ""}`}>{m.tier}</span>
                  {!m.active && <span className="text-xs bg-muted-foreground/20 text-muted-foreground px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="text-sm text-muted-foreground">{m.days} days · +{m.bonusPoints} bonus pts</div>
              </div>
              <button
                onClick={() => updateMilestone.mutate({ id: m.id, data: { days: m.days, title: m.title, description: m.description ?? undefined, emoji: m.emoji, tier: m.tier as StreakMilestoneInput["tier"], bonusPoints: m.bonusPoints, active: !m.active } })}
                className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground"
                aria-label={`${m.active ? "Deactivate" : "Activate"} ${m.title}`}
              >
                {m.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => openEditMilestone(m)} className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground" aria-label={`Edit ${m.title}`}>
                <Pencil className="w-4 h-4" />
              </button>
              <ConfirmDeleteDialog title={`Delete “${m.title}”?`} description="This streak milestone will be permanently removed." onConfirm={() => deleteMilestone.mutate({ id: m.id })} trigger={<button className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${m.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editMilestoneOpen} onOpenChange={setEditMilestoneOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="text-xl font-serif">Edit Streak Milestone</DialogTitle></DialogHeader>
          <MilestoneForm form={editMilestoneForm} setForm={setEditMilestoneForm} />
          <Button
            className="w-full h-12 rounded-xl mt-2"
            onClick={() => editMilestoneTarget && updateMilestone.mutate({ id: editMilestoneTarget.id, data: editMilestoneForm })}
            disabled={!editMilestoneForm.title || !editMilestoneForm.days || updateMilestone.isPending}
          >
            {updateMilestone.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Screensaver Photos ───────────────────────────────────────── */}
      <Card className={`${adminSection === "display" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ImagePlay className="w-5 h-5" /> Screensaver Photos</CardTitle>
            <Button size="sm" className="rounded-xl gap-1.5" disabled={ssUploading} onClick={() => ssFileRef.current?.click()}>
              <Upload className="w-4 h-4" />{ssUploading ? "Uploading…" : "Add Photo"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Photos rotate on the screensaver/display screen. If no photos are uploaded, a gradient background is shown instead.
          </p>
          <input ref={ssFileRef} type="file" accept="image/*" className="hidden" onChange={handleSsPhotoUpload} />
          {ssPhotos.length === 0 && !ssUploading && (
            <p className="text-muted-foreground text-sm italic">No photos yet — add some family favourites!</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {(ssPhotos as ScreensaverPhoto[]).map(p => (
              <div key={p.id} className="relative group rounded-2xl overflow-hidden aspect-video bg-muted">
                <img src={p.url} alt={p.filename ?? "photo"} className="w-full h-full object-cover" />
                <ConfirmDeleteDialog
                  title="Delete screensaver photo?"
                  description="This photo will no longer appear on the wall display."
                  onConfirm={() => deletePhoto.mutate({ id: p.id })}
                  trigger={<button className="absolute right-1 top-1 min-h-11 min-w-11 rounded-full bg-black/60 p-2 text-white opacity-100 transition-opacity hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Delete screensaver photo"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                />
                {p.filename && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.filename}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Point Milestones ──────────────────────────────────────────── */}
      <Card className={`${adminSection === "milestones" && milestoneSection === "points" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Star className="w-5 h-5" /> Point Milestones</CardTitle>
            <Dialog open={pointMilestoneOpen} onOpenChange={o => { setPointMilestoneOpen(o); if (!o) setPointMilestoneForm(BLANK_POINT_MILESTONE); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Milestone</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle className="text-xl font-serif">New Point Milestone</DialogTitle></DialogHeader>
                <ThresholdMilestoneForm form={pointMilestoneForm} setForm={setPointMilestoneForm} label="Points" />
                <Button className="w-full h-12 rounded-xl mt-2" onClick={() => createPointMilestone.mutate({ data: pointMilestoneForm })} disabled={!pointMilestoneForm.title || !pointMilestoneForm.threshold || createPointMilestone.isPending}>
                  {createPointMilestone.isPending ? "Adding…" : "Add Milestone"}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Badges awarded when a child's lifetime point total crosses a threshold. Configure the values that match your family's pace.</p>
          {pointMilestones.length === 0 && (
            <p className="text-muted-foreground text-sm italic">No milestones yet — add one above.</p>
          )}
          {[...pointMilestones].sort((a, b) => a.threshold - b.threshold).map(m => (
            <div key={m.id} className={`flex items-center gap-4 rounded-2xl p-4 ${m.active ? "bg-muted" : "bg-muted/40 opacity-60"}`}>
              <div className="text-2xl">{m.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center gap-2 flex-wrap">
                  {m.title}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TIER_COLORS[m.tier] ?? ""}`}>{m.tier}</span>
                  {!m.active && <span className="text-xs bg-muted-foreground/20 text-muted-foreground px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="text-sm text-muted-foreground">{m.threshold} pts · +{m.bonusPoints} bonus pts</div>
              </div>
              <button
                onClick={() => updatePointMilestone.mutate({ id: m.id, data: { threshold: m.threshold, title: m.title, description: m.description ?? undefined, emoji: m.emoji, tier: m.tier as PointMilestoneInput["tier"], bonusPoints: m.bonusPoints, active: !m.active } })}
                className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground"
                aria-label={`${m.active ? "Deactivate" : "Activate"} ${m.title}`}
              >
                {m.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => openEditPointMilestone(m)} className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground" aria-label={`Edit ${m.title}`}>
                <Pencil className="w-4 h-4" />
              </button>
              <ConfirmDeleteDialog title={`Delete “${m.title}”?`} description="This point milestone will be permanently removed." onConfirm={() => deletePointMilestone.mutate({ id: m.id })} trigger={<button className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${m.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editPointMilestoneOpen} onOpenChange={setEditPointMilestoneOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="text-xl font-serif">Edit Point Milestone</DialogTitle></DialogHeader>
          <ThresholdMilestoneForm form={editPointMilestoneForm} setForm={setEditPointMilestoneForm} label="Points" />
          <Button
            className="w-full h-12 rounded-xl mt-2"
            onClick={() => editPointMilestoneTarget && updatePointMilestone.mutate({ id: editPointMilestoneTarget.id, data: editPointMilestoneForm })}
            disabled={!editPointMilestoneForm.title || !editPointMilestoneForm.threshold || updatePointMilestone.isPending}
          >
            {updatePointMilestone.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Chore Milestones ─────────────────────────────────────────── */}
      <Card className={`${adminSection === "milestones" && milestoneSection === "chores" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ListChecks className="w-5 h-5" /> Chore Milestones</CardTitle>
            <Dialog open={choreMilestoneOpen} onOpenChange={o => { setChoreMilestoneOpen(o); if (!o) setChoreMilestoneForm(BLANK_CHORE_MILESTONE); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Milestone</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle className="text-xl font-serif">New Chore Milestone</DialogTitle></DialogHeader>
                <ThresholdMilestoneForm form={choreMilestoneForm} setForm={setChoreMilestoneForm} label="Chores" />
                <Button className="w-full h-12 rounded-xl mt-2" onClick={() => createChoreMilestone.mutate({ data: choreMilestoneForm })} disabled={!choreMilestoneForm.title || !choreMilestoneForm.threshold || createChoreMilestone.isPending}>
                  {createChoreMilestone.isPending ? "Adding…" : "Add Milestone"}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Badges awarded when a child reaches a total approved-chore count. Adjust thresholds to match what feels achievable in your family.</p>
          {choreMilestones.length === 0 && (
            <p className="text-muted-foreground text-sm italic">No milestones yet — add one above.</p>
          )}
          {[...choreMilestones].sort((a, b) => a.threshold - b.threshold).map(m => (
            <div key={m.id} className={`flex items-center gap-4 rounded-2xl p-4 ${m.active ? "bg-muted" : "bg-muted/40 opacity-60"}`}>
              <div className="text-2xl">{m.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center gap-2 flex-wrap">
                  {m.title}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TIER_COLORS[m.tier] ?? ""}`}>{m.tier}</span>
                  {!m.active && <span className="text-xs bg-muted-foreground/20 text-muted-foreground px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="text-sm text-muted-foreground">{m.threshold} chores · +{m.bonusPoints} bonus pts</div>
              </div>
              <button
                onClick={() => updateChoreMilestone.mutate({ id: m.id, data: { threshold: m.threshold, title: m.title, description: m.description ?? undefined, emoji: m.emoji, tier: m.tier as ChoreMilestoneInput["tier"], bonusPoints: m.bonusPoints, active: !m.active } })}
                className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground"
                aria-label={`${m.active ? "Deactivate" : "Activate"} ${m.title}`}
              >
                {m.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => openEditChoreMilestone(m)} className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-foreground" aria-label={`Edit ${m.title}`}>
                <Pencil className="w-4 h-4" />
              </button>
              <ConfirmDeleteDialog title={`Delete “${m.title}”?`} description="This chore milestone will be permanently removed." onConfirm={() => deleteChoreMilestone.mutate({ id: m.id })} trigger={<button className="min-h-11 min-w-11 p-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${m.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editChoreMilestoneOpen} onOpenChange={setEditChoreMilestoneOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle className="text-xl font-serif">Edit Chore Milestone</DialogTitle></DialogHeader>
          <ThresholdMilestoneForm form={editChoreMilestoneForm} setForm={setEditChoreMilestoneForm} label="Chores" />
          <Button
            className="w-full h-12 rounded-xl mt-2"
            onClick={() => editChoreMilestoneTarget && updateChoreMilestone.mutate({ id: editChoreMilestoneTarget.id, data: editChoreMilestoneForm })}
            disabled={!editChoreMilestoneForm.title || !editChoreMilestoneForm.threshold || updateChoreMilestone.isPending}
          >
            {updateChoreMilestone.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>

      <Card className={`${adminSection === "rewards" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {bonusMode === "award" ? <Star className="w-5 h-5 text-amber-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
            {bonusMode === "award" ? "Award Bonus Points" : "Deduct Points"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            <button
              type="button"
              onClick={() => { setBonusMode("award"); setBonusAmount(10); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${bonusMode === "award" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <Star className="w-4 h-4" /> Award Points
            </button>
            <button
              type="button"
              onClick={() => { setBonusMode("deduct"); setBonusAmount(10); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${bonusMode === "deduct" ? "bg-destructive text-destructive-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              <TrendingDown className="w-4 h-4" /> Deduct Points
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            {bonusMode === "award"
              ? "Give a spontaneous points boost — for great behaviour, extra effort, or a special occasion."
              : "Remove points as a consequence — for broken rules or agreed penalties. Balance can go negative; lifetime total is unaffected."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Child</Label>
              <Select value={bonusChildId} onValueChange={setBonusChildId}>
                <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue placeholder="Pick a child…" /></SelectTrigger>
                <SelectContent>
                  {members.filter(m => m.role === "child").map(m => (
                    <SelectItem key={m.id} value={String(m.id)}><MemberOption name={m.name} avatarUrl={m.avatarUrl} /></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Points</Label>
              <Input
                type="number"
                min={1}
                value={bonusAmount}
                onChange={e => setBonusAmount(Math.max(1, Number(e.target.value)))}
                className="rounded-xl h-12 mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Input
              value={bonusReason}
              onChange={e => setBonusReason(e.target.value)}
              placeholder={bonusMode === "award" ? "e.g. Being super helpful today!" : "e.g. Broke the screen-time rule"}
              className="rounded-xl h-12 mt-1"
            />
          </div>
          {bonusSuccess && (
            <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${bonusMode === "award" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
              {bonusMode === "award"
                ? <><Star className="w-4 h-4 text-green-600 shrink-0" /> Bonus points awarded successfully!</>
                : <><TrendingDown className="w-4 h-4 text-red-600 shrink-0" /> Points deducted successfully.</>}
            </div>
          )}
          <Button
            className={`w-full h-12 rounded-xl ${bonusMode === "deduct" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
            disabled={!bonusChildId || !bonusReason.trim() || bonusAmount < 1 || awardBonus.isPending}
            onClick={() => {
              const finalAmount = bonusMode === "deduct" ? -bonusAmount : bonusAmount;
              awardBonus.mutate({ data: { memberId: Number(bonusChildId), amount: finalAmount, reason: bonusReason.trim() } });
            }}
          >
            {awardBonus.isPending
              ? (bonusMode === "award" ? "Awarding…" : "Deducting…")
              : bonusMode === "award"
                ? `Award ${bonusAmount} pts`
                : `Deduct ${bonusAmount} pts`}
          </Button>
        </CardContent>
      </Card>

      <div className={adminSection === "rewards" ? "" : "hidden"}><PointsHistoryCard members={members} /></div>

      <Card className={`${adminSection === "display" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader><CardTitle className="flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> App Settings</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>App Name</Label>
            <Input value={settingsForm.appName} className="rounded-xl h-12 mt-1"
              onChange={e => setSettingsForm(form => ({ ...form, appName: e.target.value }))} />
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Weather City</Label>
              <p className="text-xs text-muted-foreground mb-1.5">BOM forecast location shown on the dashboard and screensaver. E.g. "Sydney"</p>
              <Input
                value={settingsForm.weatherCity}
                placeholder="e.g. Sydney"
                className="rounded-xl h-12"
                onChange={e => setSettingsForm(form => ({ ...form, weatherCity: e.target.value }))}
              />
            </div>
            <div>
              <Label>Screensaver timeout</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Minutes of inactivity before screensaver starts</p>
              <Input
                type="number"
                min={1}
                max={60}
                value={settingsForm.screensaverTimeout}
                className="rounded-xl h-12"
                onChange={e => setSettingsForm(form => ({ ...form, screensaverTimeout: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Photo display duration</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Seconds each photo is shown before rotating</p>
              <Input
                type="number"
                min={5}
                max={120}
                value={settingsForm.screensaverPhotoInterval}
                className="rounded-xl h-12"
                onChange={e => setSettingsForm(form => ({ ...form, screensaverPhotoInterval: Number(e.target.value) }))}
              />
            </div>
          </div>
          <Button className="w-full h-12 rounded-xl" disabled={updateSettings.isPending || !settingsForm.appName.trim()} onClick={() => updateSettings.mutate({ data: settingsForm })}>
            {updateSettings.isPending ? "Saving…" : "Save display settings"}
          </Button>
        </CardContent>
      </Card>

      <div className={`${adminSection === "connections" ? "" : "hidden"} space-y-5`}>
        <GoogleCalendarCard />
        <GoogleNestCard />
      </div>

      <Card className={`${adminSection === "security" ? "" : "hidden"} rounded-3xl border-0 shadow-sm`}>
        <CardHeader><CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> Admin access</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Change global Admin PIN</Label>
            <p className="text-xs text-muted-foreground mb-2">This PIN unlocks the Admin area. Each parent’s approval PIN is managed on their Family profile.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input type="password" inputMode="numeric" placeholder="New PIN (min 4 digits)" value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))} className="rounded-xl h-12 flex-1" />
              <Button className="h-12 px-6 rounded-xl" onClick={() => { updateSettings.mutate({ data: { parentPin: newPin } }); setNewPin(""); }} disabled={!newPin || newPin.length < 4 || updateSettings.isPending}>
                Save PIN
              </Button>
            </div>
          </div>
          <Separator />
          <Button variant="outline" className="h-12 rounded-xl gap-2" onClick={onLock}><Lock className="w-4 h-4" /> Lock Admin now</Button>
        </CardContent>
      </Card>

      <div className={adminSection === "security" ? "" : "hidden"}><SignOutCard /></div>
    </div>
  );
}

function SignOutCard() {
  const { passwordRequired, logout } = useAuth();
  if (!passwordRequired) return null;
  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="w-5 h-5" /> Sign Out
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Sign out of LunamHub on this device. You'll need the app password to sign back in.
        </p>
        <Button variant="destructive" className="h-12 px-6 rounded-xl" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </CardContent>
    </Card>
  );
}
