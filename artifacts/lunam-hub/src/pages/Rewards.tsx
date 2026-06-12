import { useState } from "react";
import {
  useListRewards, useListRedemptions, useListFamilyMembers,
  useCreateReward, useDeleteReward, useRequestRedemption,
  useApproveRedemption, useRejectRedemption,
  getListRewardsQueryKey, getListRedemptionsQueryKey, getListFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gift, Plus, Trash2, Check, X, Star } from "lucide-react";
import type { RewardInput, RedemptionInput } from "@workspace/api-client-react";

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

  const [rewardOpen, setRewardOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [rewardForm, setRewardForm] = useState<RewardInput>({ title: "", pointsCost: 100 });
  const [redeemForm, setRedeemForm] = useState<RedemptionInput>({ rewardId: 0, memberId: 0 });

  const createReward = useCreateReward({ mutation: { onSuccess: () => { invalidateAll(); setRewardOpen(false); setRewardForm({ title: "", pointsCost: 100 }); } } });
  const deleteReward = useDeleteReward({ mutation: { onSuccess: invalidateAll } });
  const requestRedemption = useRequestRedemption({ mutation: { onSuccess: () => { invalidateAll(); setRedeemOpen(false); setRedeemForm({ rewardId: 0, memberId: 0 }); } } });
  const approveRedemption = useApproveRedemption({ mutation: { onSuccess: invalidateAll } });
  const rejectRedemption = useRejectRedemption({ mutation: { onSuccess: invalidateAll } });

  const pending = redemptions.filter(r => r.status === "pending");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-4xl font-serif font-bold">Reward Store</h1>
        <div className="flex gap-3">
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
          <Dialog open={rewardOpen} onOpenChange={setRewardOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> Add Reward</Button>
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
                <Button size="icon" className="rounded-xl h-12 w-12 bg-green-600 hover:bg-green-700" onClick={() => approveRedemption.mutate({ id: r.id })}>
                  <Check className="w-5 h-5" />
                </Button>
                <Button size="icon" variant="outline" className="rounded-xl h-12 w-12" onClick={() => rejectRedemption.mutate({ id: r.id })}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.filter(r => r.active).map(r => (
          <Card key={r.id} className="rounded-3xl border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-4xl mb-3">🎁</div>
                  <div className="font-bold text-xl">{r.title}</div>
                  {r.description && <div className="text-muted-foreground text-sm mt-1">{r.description}</div>}
                </div>
                <button onClick={() => deleteReward.mutate({ id: r.id })} className="text-muted-foreground hover:text-destructive p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
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
          <p className="text-xl">No rewards yet — add some!</p>
        </div>
      )}
    </div>
  );
}
