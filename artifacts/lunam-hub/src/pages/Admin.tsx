import { useState } from "react";
import {
  useGetSettings, useVerifyPin, useUpdateSettings,
  useCreateFamilyMember, useDeleteFamilyMember, useListFamilyMembers,
  getGetSettingsQueryKey, getListFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Lock, Plus, Trash2, Shield, Users, Settings as SettingsIcon } from "lucide-react";
import type { FamilyMemberInput } from "@workspace/api-client-react";

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

function AdminPanel({ onLock }: { onLock: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const { data: members = [] } = useListFamilyMembers();
  const [newPin, setNewPin] = useState("");
  const [memberForm, setMemberForm] = useState<FamilyMemberInput>({ name: "", emoji: "😊", color: "#6366f1", role: "child" });

  const updateSettings = useUpdateSettings({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }) } });
  const createMember = useCreateFamilyMember({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() }); setMemberForm({ name: "", emoji: "😊", color: "#6366f1", role: "child" }); } } });
  const deleteMember = useDeleteFamilyMember({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() }) } });

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
                <div className="text-sm text-muted-foreground capitalize">{m.role}{m.role === "child" ? ` · ${m.pointsBalance} points` : ""}</div>
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
            <Button className="w-full h-12 rounded-xl gap-2" onClick={() => createMember.mutate({ data: memberForm })} disabled={!memberForm.name || createMember.isPending}>
              <Plus className="w-4 h-4" /> {createMember.isPending ? "Adding…" : "Add Member"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <Label>Change Parent PIN</Label>
            <div className="flex gap-3 mt-1">
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
