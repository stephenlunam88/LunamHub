import { useState } from "react";
import {
  useListRewards, useListRedemptions, useListFamilyMembers,
  useRequestRedemption, useApproveRedemption, useRejectRedemption, useFulfillRedemption,
  useListPointTransactions,
  getListRewardsQueryKey, getListRedemptionsQueryKey, getListFamilyMembersQueryKey,
  getListPointTransactionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberAvatar, MemberOption } from "@/components/MemberAvatar";
import { Gift, Check, X, Star, Lock, AlertTriangle, PackageCheck, History, Sparkles, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { RedemptionInput, PointTransaction } from "@workspace/api-client-react";

// ── Points history config ─────────────────────────────────────────────────────
const TX_CONFIG: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  chore_earned: { emoji: "⭐", label: "Chore",      bg: "bg-green-100",  text: "text-green-800"  },
  bonus:        { emoji: "🎉", label: "Bonus",       bg: "bg-blue-100",   text: "text-blue-800"   },
  reward_spent: { emoji: "🎁", label: "Reward",      bg: "bg-purple-100", text: "text-purple-800" },
  adjustment:   { emoji: "⚡", label: "Adjustment",  bg: "bg-orange-100", text: "text-orange-800" },
};
function txConfig(type: string) {
  return TX_CONFIG[type] ?? { emoji: "💰", label: type, bg: "bg-muted", text: "text-muted-foreground" };
}

// ── Per-child history section ─────────────────────────────────────────────────
function ChildHistorySection({ memberId, memberName }: { memberId: number; memberName: string }) {
  const { data: txs = [], isLoading } = useListPointTransactions(
    { memberId },
    { query: { queryKey: getListPointTransactionsQueryKey({ memberId }), enabled: !!memberId } },
  );
  const sorted = [...txs].reverse();
  const earned  = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent   = txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  if (isLoading) return <p className="text-center text-muted-foreground py-6">Loading…</p>;
  if (sorted.length === 0) return (
    <div className="text-center py-8 text-muted-foreground">
      <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p>No points history yet for {memberName} — complete some chores to get started!</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Mini summary */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px] bg-green-50 rounded-2xl px-4 py-3 text-center">
          <div className="text-xl font-bold text-green-700">+{earned}</div>
          <div className="text-xs text-green-600">pts earned</div>
        </div>
        <div className="flex-1 min-w-[120px] bg-purple-50 rounded-2xl px-4 py-3 text-center">
          <div className="text-xl font-bold text-purple-700">{spent}</div>
          <div className="text-xs text-purple-600">pts spent</div>
        </div>
        <div className="flex-1 min-w-[120px] bg-primary/5 rounded-2xl px-4 py-3 text-center">
          <div className="text-xl font-bold text-primary">{sorted.length}</div>
          <div className="text-xs text-muted-foreground">transactions</div>
        </div>
      </div>

      {/* Transaction rows */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {sorted.map((t: PointTransaction) => {
          const cfg = txConfig(t.type);
          return (
            <div key={t.id} className="flex items-center gap-3 bg-muted/50 rounded-2xl px-4 py-3">
              <span className="text-xl shrink-0">{cfg.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{t.description}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "d MMM, h:mm a")}</span>
                </div>
              </div>
              <span className={`font-bold text-base shrink-0 tabular-nums ${t.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                {t.amount > 0 ? "+" : ""}{t.amount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ParentInfo {
  id: number;
  name: string;
  avatarUrl?: string | null;
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
                <SelectContent>{parents.map(p => <SelectItem key={p.id} value={p.id.toString()}><MemberOption name={p.name} avatarUrl={p.avatarUrl} /></SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {selectedParent?.hasPin && (
            <div>
              <Label>Your PIN</Label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => { setPin(e.target.value); setLocalError(null); clearError?.(); }}
                onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="••••"
                className={`w-full rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 border px-3 bg-background ${error ? "border-red-500 bg-red-50" : "border-input"}`}
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
  const { toast } = useToast();

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
  const [historyChildId, setHistoryChildId] = useState<number | null>(null);
  const historyChild = children.find(m => m.id === historyChildId) ?? null;
  const [approveErrors, setApproveErrors] = useState<Record<number, string>>({});
  const [rejectErrors, setRejectErrors] = useState<Record<number, string>>({});
  const [fulfillErrors, setFulfillErrors] = useState<Record<number, string>>({});

  const selectedChild = children.find(m => m.id === redeemForm.memberId) ?? null;
  const selectedReward = rewards.find(r => r.id === redeemForm.rewardId) ?? null;
  const shortfall = selectedChild && selectedReward
    ? Math.max(0, selectedReward.pointsCost - selectedChild.pointsBalance)
    : 0;
  const canAfford = shortfall === 0;

  const requestRedemption = useRequestRedemption({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setRedeemOpen(false);
        setRedeemForm({ rewardId: 0, memberId: 0 });
      },
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        if (status === 422 || msg.toLowerCase().includes("points")) {
          toast({
            title: "Not enough points",
            description: msg || "This child doesn't have enough points for this reward.",
            variant: "destructive",
          });
        }
      }
    }
  });

  const approveRedemption = useApproveRedemption({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err: unknown, variables) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        if (status === 422 || msg.toLowerCase().includes("points")) {
          toast({
            title: "Balance too low",
            description: "This child no longer has enough points.",
            variant: "destructive",
          });
        } else if (msg.includes("PIN") || msg.includes("Invalid")) {
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

  const fulfillRedemption = useFulfillRedemption({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err: unknown, variables) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        if (msg.includes("PIN") || msg.includes("Invalid")) {
          setFulfillErrors(prev => ({ ...prev, [variables.id]: "Incorrect PIN — try again" }));
        }
      }
    }
  });

  const pending = redemptions.filter(r => r.status === "pending");
  const approved = redemptions.filter(r => r.status === "approved");
  const settled = redemptions.filter(r => r.status === "fulfilled" || r.status === "rejected");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-serif font-bold">Rewards</h1>
        <Dialog open={redeemOpen} onOpenChange={o => { setRedeemOpen(o); if (!o) setRedeemForm({ rewardId: 0, memberId: 0 }); }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-14 px-6 rounded-2xl text-lg gap-2"><Gift className="w-5 h-5" /> Request Reward</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="text-xl font-serif">Request a Reward</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Child</Label>
                <Select
                  value={redeemForm.memberId ? redeemForm.memberId.toString() : ""}
                  onValueChange={v => setRedeemForm(f => ({ ...f, memberId: Number(v) }))}
                >
                  <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue placeholder="Who is requesting?" /></SelectTrigger>
                  <SelectContent>
                    {children.map(m => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        <span className="flex items-center gap-2"><MemberOption name={m.name} avatarUrl={m.avatarUrl} /><span>— {m.pointsBalance} pts</span></span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedChild && (
                  <p className="text-sm text-muted-foreground mt-1.5 ml-1">
                    Store balance: <span className="font-semibold text-foreground">{selectedChild.pointsBalance} pts</span>
                  </p>
                )}
              </div>

              <div>
                <Label>Reward</Label>
                <Select
                  value={redeemForm.rewardId ? redeemForm.rewardId.toString() : ""}
                  onValueChange={v => setRedeemForm(f => ({ ...f, rewardId: Number(v) }))}
                >
                  <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue placeholder="Choose a reward" /></SelectTrigger>
                  <SelectContent>
                    {rewards.filter(r => r.active).map(r => (
                      <SelectItem key={r.id} value={r.id.toString()}>
                        {r.title} ({r.pointsCost} pts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedChild && selectedReward && !canAfford && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {selectedChild.name} needs <strong>{shortfall} more points</strong> for this reward.
                  </span>
                </div>
              )}

              <Button
                className="w-full h-12 rounded-xl"
                onClick={() => requestRedemption.mutate({ data: redeemForm })}
                disabled={!redeemForm.memberId || !redeemForm.rewardId || !canAfford || requestRedemption.isPending}
              >
                {requestRedemption.isPending ? "Requesting…" : "Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {pending.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm bg-amber-50">
          <CardHeader><CardTitle className="flex items-center gap-2"><Star className="w-5 h-5 text-amber-600" /> Pending Requests ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 flex items-center gap-4">
                {r.member && <MemberAvatar name={r.member.name} avatarUrl={r.member.avatarUrl} className="h-10 w-10" />}
                <div className="flex-1">
                  <div className="font-bold">{r.member?.name}</div>
                  <div className="text-muted-foreground">{r.reward?.title} — {r.reward?.pointsCost} pts</div>
                </div>
                {parents.length > 0 ? (
                  <>
                    <PinActionDialog
                      triggerIcon={<Check className="w-5 h-5" />}
                      triggerClassName="rounded-xl h-14 w-14 bg-green-600 hover:bg-green-700"
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
                      triggerClassName="rounded-xl h-14 w-14 border border-input bg-background hover:bg-accent text-foreground"
                      title="Reject Reward"
                      description={`Reject "${r.reward?.title}" request from ${r.member?.name}?`}
                      parents={parents}
                      onConfirm={(parentId, pin) => rejectRedemption.mutate({ id: r.id, data: { parentId, pin } })}
                      isPending={rejectRedemption.isPending}
                      errorFromParent={rejectErrors[r.id]}
                      clearError={() => setRejectErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; })}
                    />
                  </>
                ) : (
                  <>
                    <Button size="icon" className="rounded-xl h-14 w-14 bg-green-600 hover:bg-green-700" onClick={() => approveRedemption.mutate({ id: r.id })}>
                      <Check className="w-5 h-5" />
                    </Button>
                    <Button size="icon" variant="outline" className="rounded-xl h-14 w-14" onClick={() => rejectRedemption.mutate({ id: r.id })}>
                      <X className="w-5 h-5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {approved.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm bg-green-50">
          <CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="w-5 h-5 text-green-700" /> Ready to Collect ({approved.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {approved.map(r => (
              <div key={r.id} className="bg-white rounded-2xl p-4 flex items-center gap-4">
                {r.member && <MemberAvatar name={r.member.name} avatarUrl={r.member.avatarUrl} className="h-10 w-10" />}
                <div className="flex-1">
                  <div className="font-bold">{r.member?.name}</div>
                  <div className="text-muted-foreground">{r.reward?.title} — {r.pointsCost} pts</div>
                  <div className="text-xs text-green-700 font-medium mt-0.5">Approved ✓ — waiting to be delivered</div>
                </div>
                {parents.length > 0 ? (
                  <PinActionDialog
                    triggerIcon={<PackageCheck className="w-5 h-5" />}
                    triggerClassName="rounded-xl h-12 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium gap-2"
                    title="Mark as Delivered"
                    description={`Confirm that "${r.reward?.title}" has been given to ${r.member?.name}?`}
                    parents={parents}
                    onConfirm={(parentId, pin) => fulfillRedemption.mutate({ id: r.id, data: { parentId, pin } })}
                    isPending={fulfillRedemption.isPending}
                    errorFromParent={fulfillErrors[r.id]}
                    clearError={() => setFulfillErrors(prev => { const n = { ...prev }; delete n[r.id]; return n; })}
                  />
                ) : (
                  <Button className="rounded-xl h-12 px-4 bg-green-600 hover:bg-green-700 text-sm gap-2" onClick={() => fulfillRedemption.mutate({ id: r.id })}>
                    <PackageCheck className="w-4 h-4" /> Mark Delivered
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.filter(r => r.active).map(r => {
          const canAffordList = children.filter(m => m.pointsBalance >= r.pointsCost);
          return (
            <Card
              key={r.id}
              className="rounded-3xl border-0 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
              onClick={() => { setRedeemForm({ rewardId: r.id, memberId: 0 }); setRedeemOpen(true); }}
            >
              <CardContent className="p-6">
                <div className="text-4xl mb-3">🎁</div>
                <div className="font-bold text-xl">{r.title}</div>
                {r.description && <div className="text-muted-foreground text-sm mt-1">{r.description}</div>}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl font-bold text-lg shrink-0">{r.pointsCost} pts</div>
                  {canAffordList.length > 0 ? (
                    <div className="flex items-center gap-1">
                      <div className="flex -space-x-1.5">
                        {canAffordList.map(m => <MemberAvatar key={m.id} name={m.name} avatarUrl={m.avatarUrl} className="h-8 w-8 border-2 border-background" />)}
                      </div>
                      <span className="text-xs text-muted-foreground ml-1">can afford</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No one can afford yet</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rewards.filter(r => r.active).length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Gift className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-xl">No rewards yet — add some in Admin!</p>
        </div>
      )}

      {/* ── Points History ──────────────────────────────────────────────── */}
      {children.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Points History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Child picker */}
            <div className="flex gap-3 flex-wrap">
              {children.map(m => {
                const isActive = historyChildId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setHistoryChildId(isActive ? null : m.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 transition-all font-medium text-sm ${
                      isActive
                        ? "border-primary bg-primary/5 text-primary shadow-sm scale-105"
                        : "border-transparent bg-muted hover:border-primary/30 text-foreground"
                    }`}
                  >
                    <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} className="h-7 w-7" />
                    <span>{m.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{m.pointsBalance} pts</span>
                  </button>
                );
              })}
            </div>

            {/* History list */}
            {historyChild
              ? <ChildHistorySection memberId={historyChild.id} memberName={historyChild.name} />
              : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Tap a name above to see their points history
                </div>
              )
            }
          </CardContent>
        </Card>
      )}

      {settled.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm bg-muted/50">
          <CardHeader><CardTitle className="text-base text-muted-foreground">History</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {settled.slice(0, 10).map(r => {
              const actorId = r.status === "fulfilled" ? r.fulfilledByParentId : r.approvedByParentId;
              const actor = actorId ? members.find(m => m.id === actorId) : null;
              return (
                <div key={r.id} className="bg-background rounded-2xl px-4 py-3 flex items-center gap-3">
                  {r.member && <MemberAvatar name={r.member.name} avatarUrl={r.member.avatarUrl} className="h-8 w-8" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.reward?.title}</div>
                    <div className="text-xs text-muted-foreground">for {r.member?.name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      r.status === "fulfilled" ? "bg-purple-100 text-purple-700"
                      : "bg-red-100 text-red-700"
                    }`}>
                      {r.status === "fulfilled" ? "✓ Delivered" : "Rejected"}
                    </div>
                    {actor && <div className="text-xs text-muted-foreground mt-0.5">by {actor.name}</div>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
