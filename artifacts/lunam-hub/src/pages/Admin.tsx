import { useRef, useState } from "react";
import {
  useGetSettings, useVerifyPin, useUpdateSettings,
  useCreateFamilyMember, useDeleteFamilyMember, useListFamilyMembers,
  useSetFamilyMemberPin, useSetFamilyMemberAvatar,
  useRequestUploadUrl,
  useListRewards, useCreateReward, useUpdateReward, useDeleteReward,
  getGetSettingsQueryKey, getListFamilyMembersQueryKey,
  getListRewardsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Lock, Plus, Trash2, Pencil, Eye, EyeOff, Shield, Users, Settings as SettingsIcon, Key, Gift, Upload } from "lucide-react";
import type { FamilyMemberInput, RewardInput, RewardUpdate, Reward } from "@workspace/api-client-react";

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

function SetPinDialog({ memberId, memberName, memberEmoji, hasPin }: { memberId: number; memberName: string; memberEmoji: string; hasPin?: boolean }) {
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
            <Key className="w-5 h-5" /> {hasPin ? "Change" : "Set"} PIN for {memberEmoji} {memberName}
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

function AdminPanel({ onLock }: { onLock: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const { data: members = [] } = useListFamilyMembers();
  const { data: rewards = [] } = useListRewards();
  const [newPin, setNewPin] = useState("");
  const [memberForm, setMemberForm] = useState<FamilyMemberInput>({ name: "", emoji: "😊", color: "#6366f1", role: "child" });
  const [newMemberPin, setNewMemberPin] = useState("");
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardForm, setRewardForm] = useState<RewardInput>({ title: "", pointsCost: 100 });
  const [editRewardOpen, setEditRewardOpen] = useState(false);
  const [editRewardTarget, setEditRewardTarget] = useState<Reward | null>(null);
  const [editRewardForm, setEditRewardForm] = useState<RewardUpdate>({ title: "", pointsCost: 100 });

  const invalidateRewards = () => qc.invalidateQueries({ queryKey: getListRewardsQueryKey() });
  const updateSettings = useUpdateSettings({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) } });
  const createMember = useCreateFamilyMember({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() }); setMemberForm({ name: "", emoji: "😊", color: "#6366f1", role: "child" }); } } });
  const deleteMember = useDeleteFamilyMember({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() }) } });
  const createReward = useCreateReward({ mutation: { onSuccess: () => { invalidateRewards(); setRewardOpen(false); setRewardForm({ title: "", pointsCost: 100 }); } } });
  const updateReward = useUpdateReward({ mutation: { onSuccess: () => { invalidateRewards(); setEditRewardOpen(false); setEditRewardTarget(null); } } });
  const deleteReward = useDeleteReward({ mutation: { onSuccess: invalidateRewards } });

  function openEditReward(r: Reward) {
    setEditRewardTarget(r);
    setEditRewardForm({ title: r.title, description: r.description ?? undefined, pointsCost: r.pointsCost, active: r.active });
    setEditRewardOpen(true);
  }

  const parents = members.filter(m => m.role === "parent");

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-serif font-bold">Admin</h1>
        </div>
        <Button variant="outline" className="h-12 px-5 rounded-2xl gap-2" onClick={onLock}>
          <Lock className="w-4 h-4" /> Lock
        </Button>
      </div>

      <Card className="rounded-3xl border-0 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Family Members</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-4 bg-muted rounded-2xl p-4">
              <div className="text-3xl">{m.emoji}</div>
              <div className="flex-1">
                <div className="font-bold">{m.name}</div>
                <div className="text-sm text-muted-foreground capitalize">
                  {m.role}{m.role === "child" ? ` · ${m.pointsBalance} pts · ${m.lifetimePoints ?? 0} all-time` : ""}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <AvatarUploadButton memberId={m.id} currentAvatarUrl={m.avatarUrl} />
                {m.role === "parent" && (
                  <SetPinDialog memberId={m.id} memberName={m.name} memberEmoji={m.emoji} hasPin={m.hasPin} />
                )}
              </div>
              <button onClick={() => deleteMember.mutate({ id: m.id })} className="text-muted-foreground hover:text-destructive p-2">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          <Separator />
          <div className="space-y-3">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">Add Member</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl h-12" /></div>
              <div><Label>Emoji</Label><Input value={memberForm.emoji ?? ""} onChange={e => setMemberForm(f => ({ ...f, emoji: e.target.value }))} className="rounded-xl h-12" /></div>
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
            <Button
              className="w-full h-12 rounded-xl gap-2"
              onClick={() => {
                const data = memberForm.role === "parent"
                  ? { ...memberForm, pin: newMemberPin } as Parameters<typeof createMember.mutate>[0]["data"]
                  : memberForm;
                createMember.mutate({ data });
                setNewMemberPin("");
              }}
              disabled={!memberForm.name || (memberForm.role === "parent" && newMemberPin.length < 4) || createMember.isPending}
            >
              <Plus className="w-4 h-4" /> {createMember.isPending ? "Adding…" : "Add Member"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {parents.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> Parent PINs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Set a PIN for each parent to gate chore approvals and reward decisions.</p>
            {parents.map(m => (
              <div key={m.id} className="flex items-center gap-4 bg-muted rounded-2xl p-4">
                <div className="text-3xl">{m.emoji}</div>
                <div className="flex-1">
                  <div className="font-bold">{m.name}</div>
                  <div className="text-sm text-muted-foreground">{m.hasPin ? "PIN set ✓" : "No PIN set — approval is open"}</div>
                </div>
                <SetPinDialog memberId={m.id} memberName={m.name} memberEmoji={m.emoji} hasPin={m.hasPin} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl border-0 shadow-sm">
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
                className="text-muted-foreground hover:text-foreground p-2"
                title={r.active ? "Deactivate" : "Activate"}
              >
                {r.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={() => openEditReward(r)} className="text-muted-foreground hover:text-foreground p-2" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => deleteReward.mutate({ id: r.id })} className="text-muted-foreground hover:text-destructive p-2" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
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

      <Card className="rounded-3xl border-0 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> App Settings</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>App Name</Label>
            <Input defaultValue={settings?.appName ?? "LunamHub"} className="rounded-xl h-12 mt-1"
              onBlur={e => updateSettings.mutate({ data: { appName: e.target.value } })} />
          </div>
          <div>
            <Label>Timezone</Label>
            <Input defaultValue={settings?.timezone ?? "UTC"} className="rounded-xl h-12 mt-1"
              onBlur={e => updateSettings.mutate({ data: { timezone: e.target.value } })} />
          </div>
          <Separator />
          <div>
            <Label>Change Global Parent PIN</Label>
            <p className="text-xs text-muted-foreground mb-2">This PIN gates the Admin area. Per-parent PINs above gate approvals.</p>
            <div className="flex gap-3">
              <Input type="password" inputMode="numeric" placeholder="New PIN (min 4 digits)" value={newPin}
                onChange={e => setNewPin(e.target.value)} className="rounded-xl h-12 flex-1" />
              <Button className="h-12 px-6 rounded-xl" onClick={() => { updateSettings.mutate({ data: { parentPin: newPin } }); setNewPin(""); }} disabled={!newPin || newPin.length < 4}>
                Save PIN
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
