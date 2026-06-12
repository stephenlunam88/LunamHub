import { useState } from "react";
import {
  useListChores, useListFamilyMembers, useCreateChore, useCompleteChore,
  useApproveChore, useDeleteChore, useGetChoresSummary, useListBadges,
  getListChoresQueryKey, getGetChoresSummaryQueryKey, getListFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Plus, Trash2, Star, Clock, Lock, Medal } from "lucide-react";
import type { ChoreInput } from "@workspace/api-client-react";

const TIER_STYLES = {
  bronze: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", ring: "ring-amber-400" },
  silver: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", ring: "ring-slate-400" },
  gold:   { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300", ring: "ring-yellow-400" },
} as const;

type ChoreFormState = Omit<ChoreInput, "status"> & { assignedToMany?: number[] };

interface ParentInfo {
  id: number;
  name: string;
  emoji: string;
  hasPin?: boolean;
}

interface PinApproveDialogProps {
  choreId: number;
  choreTitle: string;
  parents: ParentInfo[];
  onSuccess: () => void;
}

function PinApproveDialog({ choreId, choreTitle, parents, onSuccess }: PinApproveDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number>(parents[0]?.id ?? 0);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approveChore = useApproveChore({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setPin("");
        setError(null);
        onSuccess();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        if (msg.includes("PIN") || msg.includes("Invalid")) {
          setError("Incorrect PIN — try again");
          setPin("");
        } else {
          setError("Failed to approve");
        }
      }
    }
  });

  const selectedParent = parents.find(p => p.id === selectedParentId);

  const handleApprove = () => {
    setError(null);
    approveChore.mutate({
      id: choreId,
      data: { parentId: selectedParentId, pin: selectedParent?.hasPin ? pin : undefined },
    });
  };

  const reset = () => { setPin(""); setError(null); };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); reset(); }}>
      <DialogTrigger asChild>
        <Button className="rounded-xl h-12 px-6 bg-green-600 hover:bg-green-700">
          <Star className="w-4 h-4 mr-2" /> Approve
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif flex items-center gap-2">
            <Lock className="w-5 h-5" /> Approve Chore
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">"{choreTitle}"</p>
          {parents.length > 1 && (
            <div>
              <Label>Approving as</Label>
              <Select value={selectedParentId.toString()} onValueChange={v => { setSelectedParentId(Number(v)); reset(); }}>
                <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {parents.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.emoji} {p.name}</SelectItem>)}
                </SelectContent>
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
                onChange={e => { setPin(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === "Enter") handleApprove(); }}
                placeholder="••••"
                className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${error ? "border-red-500 bg-red-50" : ""}`}
                autoFocus
              />
              {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
            </div>
          )}
          {!selectedParent?.hasPin && error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}
          <Button
            className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700"
            onClick={handleApprove}
            disabled={(selectedParent?.hasPin ? !pin : false) || approveChore.isPending}
          >
            {approveChore.isPending ? "Approving…" : "Approve & Award Points"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Chores() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ChoreFormState>({ title: "", pointsValue: 10, repeatType: "once" });
  const [filterChildId, setFilterChildId] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListChoresQueryKey() });
    qc.invalidateQueries({ queryKey: getGetChoresSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() });
  };

  const { data: chores = [] } = useListChores(
    filterChildId ? { assignedTo: filterChildId } : undefined
  );
  const { data: members = [] } = useListFamilyMembers();
  const { data: summary = [] } = useGetChoresSummary();
  const { data: allBadges = [] } = useListBadges();

  const createChore = useCreateChore({ mutation: { onSuccess: () => { invalidate(); setOpen(false); setForm({ title: "", pointsValue: 10, repeatType: "once", assignedToMany: [] }); } } });
  const completeChore = useCompleteChore({ mutation: { onSuccess: invalidate } });
  const approveChore = useApproveChore({ mutation: { onSuccess: invalidate } });
  const deleteChore = useDeleteChore({ mutation: { onSuccess: invalidate } });

  const children = members.filter(m => m.role === "child");
  const parents = members.filter(m => m.role === "parent") as ParentInfo[];

  const pending = chores.filter(c => c.status === "pending");
  const needsApproval = chores.filter(c => c.status === "completed");
  const approved = chores.filter(c => c.status === "approved");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-serif font-bold">Chores</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> Add Chore</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="text-xl font-serif">New Chore</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12" /></div>
              <div>
                <Label>Assign to</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {children.map(m => {
                    const many = form.assignedToMany ?? [];
                    const selected = many.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          const next = selected ? many.filter(id => id !== m.id) : [...many, m.id];
                          setForm(f => ({ ...f, assignedToMany: next, assignedTo: next.length === 1 ? next[0] : undefined }));
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}
                      >
                        <span>{m.emoji}</span>
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
                  {children.length === 0 && <span className="text-muted-foreground text-sm">No children added yet</span>}
                </div>
                {(form.assignedToMany?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(form.assignedToMany?.length ?? 0) > 1 ? `Creates ${form.assignedToMany?.length} separate chores` : ""}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Points</Label><Input type="number" value={form.pointsValue} onChange={e => setForm(f => ({ ...f, pointsValue: Number(e.target.value) }))} className="rounded-xl h-12" /></div>
                <div><Label>Due date</Label><Input type="date" value={form.dueDate ?? ""} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value || undefined }))} className="rounded-xl h-12" /></div>
              </div>
              <div><Label>Repeat</Label>
                <Select value={form.repeatType ?? "once"} onValueChange={v => setForm(f => ({ ...f, repeatType: v as ChoreInput["repeatType"] }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full h-12 rounded-xl" onClick={() => {
                const { assignedToMany, ...base } = form;
                createChore.mutate({ data: assignedToMany && assignedToMany.length > 0 ? { ...base, assignedToMany } : base });
              }} disabled={!form.title || createChore.isPending}>
                {createChore.isPending ? "Adding…" : "Add Chore"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {children.map(m => {
          const s = summary.find(s => s.memberId === m.id);
          const isActive = filterChildId === m.id;
          const memberBadges = allBadges.filter(b => b.memberId === m.id);
          const badgeCount = memberBadges.length;
          const topTier = memberBadges.some(b => b.tier === "gold") ? "gold"
            : memberBadges.some(b => b.tier === "silver") ? "silver"
            : memberBadges.length > 0 ? "bronze"
            : null;
          return (
            <Card
              key={m.id}
              className={`rounded-3xl border-2 shadow-sm text-center cursor-pointer transition-all select-none ${isActive ? "border-primary bg-primary/5 shadow-md scale-[1.02]" : "border-transparent hover:border-primary/30 hover:shadow-md"}`}
              onClick={() => setFilterChildId(isActive ? null : m.id)}
            >
              <CardContent className="pt-6 pb-5">
                <div className="mb-2 flex justify-center">
                  {m.avatarUrl
                    ? <img src={m.avatarUrl} alt={m.name} className="w-12 h-12 rounded-full object-cover border-2 border-muted" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute("style"); }} />
                    : null}
                  <span className="text-4xl" style={m.avatarUrl ? { display: "none" } : undefined}>{m.emoji}</span>
                </div>
                <div className="font-bold text-lg">{m.name}</div>
                <div className="text-3xl font-bold text-primary mt-1">{m.pointsBalance}</div>
                <div className="text-xs text-muted-foreground">store balance</div>
                <div className="text-sm font-semibold text-amber-600 mt-0.5">{m.lifetimePoints ?? 0} all-time</div>
                {s && <div className="text-xs text-muted-foreground mt-1">{s.approved} done · {s.pending} pending</div>}
                {badgeCount > 0 && topTier && (
                  <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-semibold border ${TIER_STYLES[topTier].bg} ${TIER_STYLES[topTier].text} ${TIER_STYLES[topTier].border}`}>
                    <Medal className="w-3 h-3" />
                    {badgeCount} badge{badgeCount !== 1 ? "s" : ""}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {children.length > 0 && allBadges.length > 0 && (
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Medal className="w-5 h-5 text-amber-500" /> My Badges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {children
                .filter(m => !filterChildId || m.id === filterChildId)
                .map(m => {
                  const memberBadges = allBadges.filter(b => b.memberId === m.id);
                  if (memberBadges.length === 0) return null;
                  return (
                    <div key={m.id}>
                      <div className="flex items-center gap-2 mb-2">
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt={m.name} className="w-6 h-6 rounded-full object-cover border border-muted" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          : <span className="text-lg">{m.emoji}</span>}
                        <span className="font-semibold text-sm">{m.name}</span>
                        <span className="text-xs text-muted-foreground">— {memberBadges.length} badge{memberBadges.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {memberBadges.map(badge => {
                          const tier = (badge.tier ?? "bronze") as keyof typeof TIER_STYLES;
                          const styles = TIER_STYLES[tier] ?? TIER_STYLES.bronze;
                          return (
                            <div
                              key={badge.id}
                              title={badge.description ?? badge.title}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-semibold ${styles.bg} ${styles.text} ${styles.border}`}
                            >
                              <span className="text-base leading-none">{badge.emoji}</span>
                              <div>
                                <div>{badge.title}</div>
                                <div className={`text-[10px] font-normal capitalize ${styles.text} opacity-70`}>{tier}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {filterChildId && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing chores for</span>
          <span className="font-semibold">{members.find(m => m.id === filterChildId)?.name}</span>
          <button onClick={() => setFilterChildId(null)} className="text-xs text-muted-foreground underline ml-1">Clear filter</button>
        </div>
      )}

      <Tabs defaultValue="pending">
        <TabsList className="rounded-2xl h-14 p-1">
          <TabsTrigger value="pending" className="rounded-xl h-11 px-5 text-base gap-2">
            To Do <Badge className="bg-yellow-100 text-yellow-800">{pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approval" className="rounded-xl h-11 px-5 text-base gap-2">
            Approval <Badge className="bg-blue-100 text-blue-800">{needsApproval.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="rounded-xl h-11 px-5 text-base gap-2">
            Done <Badge className="bg-green-100 text-green-800">{approved.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {pending.length === 0 && <p className="text-center text-muted-foreground py-12">All chores done! 🎉</p>}
          {pending.map(c => {
            const member = members.find(m => m.id === c.assignedTo);
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{c.title}</div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {member && (
                        <span className="flex items-center gap-1.5">
                          {member.avatarUrl
                            ? <img src={member.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : <span>{member.emoji}</span>}
                          {member.name}
                        </span>
                      )}
                      {c.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.dueDate}</span>}
                      {c.repeatType !== "once" && <Badge variant="outline" className="text-xs">{c.repeatType}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-2xl text-lg">{c.pointsValue} pts</div>
                    <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => completeChore.mutate({ id: c.id })}>
                      <CheckCircle2 className="w-6 h-6" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-muted-foreground hover:text-destructive"
                      onClick={() => deleteChore.mutate({ id: c.id })}>
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="approval" className="space-y-3 mt-4">
          {needsApproval.length === 0 && <p className="text-center text-muted-foreground py-12">Nothing awaiting approval</p>}
          {needsApproval.map(c => {
            const member = members.find(m => m.id === c.assignedTo);
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm bg-blue-50">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{c.title}</div>
                    {member && (
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                        {member.avatarUrl
                          ? <img src={member.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          : <span>{member.emoji}</span>}
                        {member.name} completed this
                      </div>
                    )}
                  </div>
                  <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-2xl">{c.pointsValue} pts</div>
                  {parents.length > 0 ? (
                    <PinApproveDialog
                      choreId={c.id}
                      choreTitle={c.title}
                      parents={parents}
                      onSuccess={invalidate}
                    />
                  ) : (
                    <Button
                      className="rounded-xl h-12 px-6 bg-green-600 hover:bg-green-700"
                      onClick={() => approveChore.mutate({ id: c.id })}
                      disabled={approveChore.isPending}
                    >
                      <Star className="w-4 h-4 mr-2" /> Approve
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="approved" className="space-y-3 mt-4">
          {approved.length === 0 && <p className="text-center text-muted-foreground py-12">No completed chores yet</p>}
          {approved.map(c => {
            const member = members.find(m => m.id === c.assignedTo);
            const approver = c.approvedByParentId ? members.find(m => m.id === c.approvedByParentId) : null;
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm opacity-75">
                <CardContent className="p-5 flex items-center gap-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold line-through text-muted-foreground">{c.title}</div>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                      {member && (
                        <span className="flex items-center gap-1.5">
                          {member.avatarUrl
                            ? <img src={member.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : <span>{member.emoji}</span>}
                          {member.name}
                        </span>
                      )}
                      {approver && (
                        <span className="flex items-center gap-1.5 text-green-700">
                          ✓ Approved by
                          {approver.avatarUrl
                            ? <img src={approver.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : <span>{approver.emoji}</span>}
                          {approver.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-green-700 font-bold">+{c.pointsValue} pts</div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
