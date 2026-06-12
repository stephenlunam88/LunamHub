import { useState } from "react";
import {
  useListRewards, useListRedemptions, useListFamilyMembers,
  useRequestRedemption, useApproveRedemption, useRejectRedemption,
  getListRewardsQueryKey, getListRedemptionsQueryKey, getListFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gift, Check, X, Star, Lock } from "lucide-react";
import type { RedemptionInput } from "@workspace/api-client-react";

interface ParentInfo {
  id: number;
  name: string;
  emoji: string;
  hasPin?: boolean;
}

interface PinActionDialogProps {
  triggerIcon: React.ReactNode;
  triggerClassName: string;
  title: string;
  description: string;
  parents: ParentInfo[];
  onConfirm: (parentId: number, pin?: string) => void;
  onError?: (msg: string) => void;
  isPending: boolean;
  errorFromParent?: string | null;
  clearError?: () => void;
}

function PinActionDialog({ triggerIcon, triggerClassName, title, description, parents, onConfirm, isPending, errorFromParent, clearError }: PinActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number>(parents[0]?.id ?? 0);
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const error = errorFromParent ?? localError;
  const selectedParent = parents.find(p => p.id === selectedParentId);

  const reset = () => { setPin(""); setLocalError(null); clearError?.(); };

  const handleConfirm = () => {
    setLocalError(null);
    clearError?.();
    onConfirm(selectedParentId, selectedParent?.hasPin ? pin : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); reset(); }}>
      <DialogTrigger asChild>
        <Button size="icon" className={triggerClassName} disabled={isPending}>
          {triggerIcon}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif flex items-center gap-2"><Lock className="w-5 h-5" /> {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">{description}</p>
          {parents.length > 1 && (
            <div>
              <Label>Approving as</Label>
              <Select value={selectedParentId.toString()} onValueChange={v => { setSelectedParentId(Number(v)); reset(); }}>
                <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{parents.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.emoji} {p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {selectedParent?.hasPin && (
            <div>
              <Label>Your PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => { setPin(e.target.value); setLocalError(null); clearError?.(); }}
                onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="••••"
                className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${error ? "border-red-500 bg-red-50" : ""}`}
                autoFocus
              />
              {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
            </div>
          )}
          {!selectedParent?.hasPin && error && <p className="text-red-600 text-sm">{error}</p>}
          <Button
            className="w-full h-12 rounded-xl"
            onClick={handleConfirm}
            disabled={(selectedParent?.hasPin ? !pin : false) || isPending}
          >
            {isPending ? "Processing…" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Rewards() {
  const qc = useQueryClient();
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListRewardsQueryKey() });
    qc.invalidateQueries({ queryKey: getListRedemptionsQueryKey() });
    qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() });
  };

  const { data: rewards = [] } = useListRewards();
  const { data: redemptions = [] } = useListRedemptions();
  const { data: members = [] } = useListFamilyMembers();
  const children = members.filter(m => m.role === "child");
  const parents = members.filter(m => m.role === "parent") as ParentInfo[];

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemForm, setRedeemForm] = useState<RedemptionInput>({ rewardId: 0, memberId: 0 });
  const [approveErrors, setApproveErrors] = useState<Record<number, string>>({});
  const [rejectErrors, setRejectErrors] = useState<Record<number, string>>({});

  const requestRedemption = useRequestRedemption({ mutation: { onSuccess: () => { invalidateAll(); setRedeemOpen(false); setRedeemForm({ rewardId: 0, memberId: 0 }); } } });
  const approveRedemption = useApproveRedemption({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err: unknown, variables) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        if (msg.includes("PIN") || msg.includes("Invalid")) {
          setApproveErrors(prev => ({ ...prev, [variables.id]: "Incorrect PIN — try again" }));
        }
      }
    }
  });
  const rejectRedemption = useRejectRedemption({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err: unknown, variables) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        if (msg.includes("PIN") || msg.includes("Invalid")) {
          setRejectErrors(prev => ({ ...prev, [variables.id]: "Incorrect PIN — try again" }));
        }
      }
    }
  });

  const pending = redemptions.filter(r => r.status === "pending");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-4xl font-serif font-bold">Reward Store</h1>
        <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-14 px-6 rounded-2xl text-lg gap-2"><Gift className="w-5 h-5" /> Request Reward</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="text-xl font-serif">Request a Reward</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Child</Label>
                <Select value={redeemForm.memberId ? redeemForm.memberId.toString() : ""} onValueChange={v => setRedeemForm(f => ({ ...f, memberId: Number(v) }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Who is requesting?" /></SelectTrigger>
                  <SelectContent>{children.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.emoji} {m.name} ({m.pointsBalance} pts)</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Reward</Label>
                <Select value={redeemForm.rewardId ? redeemForm.rewardId.toString() : ""} onValueChange={v => setRedeemForm(f => ({ ...f, rewardId: Number(v) }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Choose a reward" /></SelectTrigger>
                  <SelectContent>{rewards.filter(r => r.active).map(r => <SelectItem key={r.id} value={r.id.toString()}>{r.title} ({r.pointsCost} pts)</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full h-12 rounded-xl" onClick={() => requestRedemption.mutate({ data: redeemForm })}
                disabled={!redeemForm.memberId || !redeemForm.rewardId || requestRedemption.isPending}>
                {requestRedemption.isPending ? "Requesting…" : "Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {pending.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm bg-amber-50">
          <CardHeader><CardTitle className="flex items-center gap-2"><Star className="w-5 h-5 text-amber-600" /> Pending Requests ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 flex items-center gap-4">
                <div className="text-3xl">{r.member?.emoji}</div>
                <div className="flex-1">
                  <div className="font-bold">{r.member?.name}</div>
                  <div className="text-muted-foreground">{r.reward?.title} — {r.reward?.pointsCost} pts</div>
                </div>
                {parents.length > 0 ? (
                  <>
                    <PinActionDialog
                      triggerIcon={<Check className="w-5 h-5" />}
                      triggerClassName="rounded-xl h-12 w-12 bg-green-600 hover:bg-green-700"
                      title="Approve Reward"
                      description={`Approve "${r.reward?.title}" for ${r.member?.name}?`}
                      parents={parents}
                      onConfirm={(parentId, pin) => approveRedemption.mutate({ id: r.id, data: { parentId, pin } })}
                      isPending={approveRedemption.isPending}
                      errorFromParent={approveErrors[r.id]}
                      clearError={() => setApproveErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; })}
                    />
                    <PinActionDialog
                      triggerIcon={<X className="w-5 h-5" />}
                      triggerClassName="rounded-xl h-12 w-12 border border-input bg-background hover:bg-accent text-foreground"
                      title="Reject Reward"
                      description={`Reject "${r.reward?.title}" request from ${r.member?.name}?`}
                      parents={parents}
                      onConfirm={(parentId, pin) => rejectRedemption.mutate({ id: r.id })}
                      isPending={rejectRedemption.isPending}
                      errorFromParent={rejectErrors[r.id]}
                      clearError={() => setRejectErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; })}
                    />
                  </>
                ) : (
                  <>
                    <Button size="icon" className="rounded-xl h-12 w-12 bg-green-600 hover:bg-green-700" onClick={() => approveRedemption.mutate({ id: r.id })}>
                      <Check className="w-5 h-5" />
                    </Button>
                    <Button size="icon" variant="outline" className="rounded-xl h-12 w-12" onClick={() => rejectRedemption.mutate({ id: r.id })}>
                      <X className="w-5 h-5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.filter(r => r.active).map(r => (
          <Card key={r.id} className="rounded-3xl border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="text-4xl mb-3">🎁</div>
              <div className="font-bold text-xl">{r.title}</div>
              {r.description && <div className="text-muted-foreground text-sm mt-1">{r.description}</div>}
              <div className="mt-4 flex items-center justify-between">
                <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl font-bold text-lg">{r.pointsCost} pts</div>
                <div className="text-sm text-muted-foreground">
                  {children.filter(m => m.pointsBalance >= r.pointsCost).map(m => m.emoji).join(" ")} can afford
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rewards.filter(r => r.active).length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Gift className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-xl">No rewards yet — add some in Admin!</p>
        </div>
      )}
    </div>
  );
}
