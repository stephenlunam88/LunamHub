import { useRef, useState } from "react";
import {
  useListChores, useListFamilyMembers, useCreateChore, useCompleteChore,
  useApproveChore, useRejectChore, useDeleteChore, useUpdateChore, useGetChoresSummary, useListBadges, useVerifyPin, useVerifyFamilyMemberPin,
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
import { CheckCircle2, Plus, Trash2, Star, Clock, Lock, Medal, XCircle, Pencil } from "lucide-react";
import type { Chore, ChoreInput, ChoreUpdate } from "@workspace/api-client-react";

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

function MemberAvatar({ avatarUrl, emoji, name, sizeCls = "w-8 h-8" }: { avatarUrl?: string | null; emoji: string; name: string; sizeCls?: string }) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeCls} rounded-full object-cover border border-muted shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="text-2xl leading-none shrink-0">{emoji}</span>;
}

function PinApproveDialog({ choreId, choreTitle, parents, onSuccess }: {
  choreId: number;
  choreTitle: string;
  parents: ParentInfo[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number>(parents[0]?.id ?? 0);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approveChore = useApproveChore({
    mutation: {
      onSuccess: () => { setOpen(false); setPin(""); setError(null); onSuccess(); },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        setError(msg.includes("PIN") || msg.includes("Invalid") ? "Incorrect PIN — try again" : "Failed to approve");
        setPin("");
      }
    }
  });

  const selectedParent = parents.find(p => p.id === selectedParentId);
  const reset = () => { setPin(""); setError(null); };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); reset(); }}>
      <DialogTrigger asChild>
        <Button className="rounded-xl h-12 px-6 bg-green-600 hover:bg-green-700 shrink-0">
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
                onKeyDown={e => { if (e.key === "Enter") approveChore.mutate({ id: choreId, data: { parentId: selectedParentId, pin: selectedParent?.hasPin ? pin : undefined } }); }}
                placeholder="••••"
                className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${error ? "border-red-500 bg-red-50" : ""}`}
                autoFocus
              />
              {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
            </div>
          )}
          {!selectedParent?.hasPin && error && <p className="text-red-600 text-sm">{error}</p>}
          <Button
            className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700"
            onClick={() => approveChore.mutate({ id: choreId, data: { parentId: selectedParentId, pin: selectedParent?.hasPin ? pin : undefined } })}
            disabled={(selectedParent?.hasPin ? !pin : false) || approveChore.isPending}
          >
            {approveChore.isPending ? "Approving…" : "Approve & Award Points"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PinDismissDialog({ choreId, choreTitle, parents, onSuccess }: {
  choreId: number;
  choreTitle: string;
  parents: ParentInfo[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number>(parents[0]?.id ?? 0);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rejectChore = useRejectChore({
    mutation: {
      onSuccess: () => { setOpen(false); setPin(""); setError(null); onSuccess(); },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
        setError(msg.includes("PIN") || msg.includes("Invalid") ? "Incorrect PIN — try again" : "Failed to dismiss");
        setPin("");
      }
    }
  });

  const selectedParent = parents.find(p => p.id === selectedParentId);
  const reset = () => { setPin(""); setError(null); };

  const handleConfirm = () => {
    rejectChore.mutate({ id: choreId, data: { parentId: selectedParentId, pin: selectedParent?.hasPin ? pin : undefined } });
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-xl h-10 px-4 text-sm shrink-0">
          Dismiss
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif flex items-center gap-2">
            <Lock className="w-5 h-5" /> Dismiss Missed Chore
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Dismiss "{choreTitle}" without awarding points?</p>
          {parents.length > 1 && (
            <div>
              <Label>Confirming as</Label>
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
            variant="destructive"
            className="w-full h-12 rounded-xl"
            onClick={handleConfirm}
            disabled={(selectedParent?.hasPin ? !pin : false) || rejectChore.isPending}
          >
            {rejectChore.isPending ? "Dismissing…" : "Dismiss Chore"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ADMIN_OPTION = "__admin__";

function PinDeleteDialog({ choreId, choreTitle, parents, onSuccess }: {
  choreId: number;
  choreTitle: string;
  parents: ParentInfo[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(parents[0] ? String(parents[0].id) : ADMIN_OPTION);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setPin(""); setError(null); };

  const deleteChore = useDeleteChore({
    mutation: { onSuccess: () => { setOpen(false); reset(); onSuccess(); } }
  });

  const onVerifySuccess = () => deleteChore.mutate({ id: choreId });
  const onVerifyError = () => { setError("Incorrect PIN — try again"); setPin(""); };

  const verifyAdmin = useVerifyPin({
    mutation: { onSuccess: onVerifySuccess, onError: onVerifyError }
  });

  const verifyParent = useVerifyFamilyMemberPin({
    mutation: { onSuccess: onVerifySuccess, onError: onVerifyError }
  });

  const isPending = verifyAdmin.isPending || verifyParent.isPending || deleteChore.isPending;

  const handleConfirm = () => {
    if (selected === ADMIN_OPTION) {
      verifyAdmin.mutate({ data: { pin } });
    } else {
      verifyParent.mutate({ id: Number(selected), data: { pin } });
    }
  };

  const options = [
    ...parents.map(p => ({ value: String(p.id), label: `${p.emoji} ${p.name}` })),
    { value: ADMIN_OPTION, label: "🔑 Admin PIN" },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); reset(); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-muted-foreground hover:text-destructive">
          <Trash2 className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif flex items-center gap-2">
            <Lock className="w-5 h-5" /> Delete Chore
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">Delete "{choreTitle}"?</p>
          {options.length > 1 && (
            <div>
              <Label>Authorising as</Label>
              <Select value={selected} onValueChange={v => { setSelected(v); reset(); }}>
                <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{selected === ADMIN_OPTION ? "Admin PIN" : "Parent PIN"}</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => { setPin(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === "Enter" && pin) handleConfirm(); }}
              placeholder="••••"
              className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${error ? "border-red-500 bg-red-50" : ""}`}
              autoFocus
            />
            {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
          </div>
          <Button
            variant="destructive"
            className="w-full h-12 rounded-xl"
            onClick={handleConfirm}
            disabled={!pin || isPending}
          >
            {isPending ? "Deleting…" : "Delete Chore"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type EditFormState = Pick<ChoreUpdate, "title" | "pointsValue" | "repeatType"> & { assignedTo?: number | null };

function PinEditDialog({ chore, children, parents, onSuccess }: {
  chore: Chore;
  children: ParentInfo[];
  parents: ParentInfo[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    title: chore.title,
    assignedTo: chore.assignedTo ?? null,
    pointsValue: chore.pointsValue,
    repeatType: chore.repeatType as ChoreUpdate["repeatType"],
  });
  const [selected, setSelected] = useState<string>(parents[0] ? String(parents[0].id) : ADMIN_OPTION);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pendingFormRef = useRef<EditFormState | null>(null);

  const reset = () => { setPin(""); setError(null); };

  const updateChore = useUpdateChore({
    mutation: {
      onSuccess: () => { setOpen(false); reset(); onSuccess(); },
      onError: () => setError("Failed to save chore"),
    }
  });

  const onVerifySuccess = () => {
    if (pendingFormRef.current) {
      updateChore.mutate({ id: chore.id, data: pendingFormRef.current });
    }
  };
  const onVerifyError = () => { setError("Incorrect PIN — try again"); setPin(""); };

  const verifyAdmin = useVerifyPin({ mutation: { onSuccess: onVerifySuccess, onError: onVerifyError } });
  const verifyParent = useVerifyFamilyMemberPin({ mutation: { onSuccess: onVerifySuccess, onError: onVerifyError } });

  const isPending = verifyAdmin.isPending || verifyParent.isPending || updateChore.isPending;

  const handleSave = () => {
    pendingFormRef.current = { ...form };
    if (selected === ADMIN_OPTION) {
      verifyAdmin.mutate({ data: { pin } });
    } else {
      verifyParent.mutate({ id: Number(selected), data: { pin } });
    }
  };

  const options = [
    ...parents.map(p => ({ value: String(p.id), label: `${p.emoji} ${p.name}` })),
    { value: ADMIN_OPTION, label: "🔑 Admin PIN" },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) { setForm({ title: chore.title, assignedTo: chore.assignedTo ?? null, pointsValue: chore.pointsValue, repeatType: chore.repeatType as ChoreUpdate["repeatType"] }); } reset(); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-muted-foreground hover:text-primary">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif flex items-center gap-2">
            <Lock className="w-5 h-5" /> Edit Chore
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={form.title ?? ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12 mt-1" />
          </div>
          <div>
            <Label>Assign to</Label>
            <Select
              value={form.assignedTo != null ? String(form.assignedTo) : "__none__"}
              onValueChange={v => setForm(f => ({ ...f, assignedTo: v === "__none__" ? null : Number(v) }))}
            >
              <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {children.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.emoji} {m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Points</Label>
              <Input type="number" value={form.pointsValue ?? 10} onChange={e => setForm(f => ({ ...f, pointsValue: Number(e.target.value) }))} className="rounded-xl h-12 mt-1" />
            </div>
            <div>
              <Label>Repeat</Label>
              <Select value={form.repeatType ?? "once"} onValueChange={v => setForm(f => ({ ...f, repeatType: v as ChoreUpdate["repeatType"] }))}>
                <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {chore.repeatType !== "once" && (
            <p className="text-xs text-muted-foreground">Changes to a recurring chore apply to all future instances.</p>
          )}
          <div className="border-t pt-4 space-y-3">
            {options.length > 1 && (
              <div>
                <Label>Authorising as</Label>
                <Select value={selected} onValueChange={v => { setSelected(v); reset(); }}>
                  <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{selected === ADMIN_OPTION ? "Admin PIN" : "Parent PIN"}</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => { setPin(e.target.value); setError(null); }}
                onKeyDown={e => { if (e.key === "Enter" && pin && form.title) handleSave(); }}
                placeholder="••••"
                className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${error ? "border-red-500 bg-red-50" : ""}`}
                autoFocus
              />
              {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
            </div>
          </div>
          <Button
            className="w-full h-12 rounded-xl"
            onClick={handleSave}
            disabled={!pin || !form.title || isPending}
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Chores() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addStep, setAddStep] = useState<"form" | "pin">("form");
  const [form, setForm] = useState<ChoreFormState>({ title: "", pointsValue: 10, repeatType: "once" });
  const pendingAddRef = useRef<ChoreFormState | null>(null);
  const [addSelected, setAddSelected] = useState<string>(ADMIN_OPTION);
  const [addPin, setAddPin] = useState("");
  const [addPinError, setAddPinError] = useState<string | null>(null);
  const [filterChildId, setFilterChildId] = useState<number | null>(null);

  const resetAddDialog = () => {
    setForm({ title: "", pointsValue: 10, repeatType: "once", assignedToMany: [] });
    setAddStep("form");
    setAddPin("");
    setAddPinError(null);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListChoresQueryKey() });
    qc.invalidateQueries({ queryKey: getGetChoresSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListFamilyMembersQueryKey() });
  };

  const { data: allChores = [] } = useListChores(
    filterChildId ? { assignedTo: filterChildId } : undefined
  );
  const { data: members = [] } = useListFamilyMembers();
  const { data: summary = [] } = useGetChoresSummary();
  const { data: allBadges = [] } = useListBadges();

  const createChore = useCreateChore({ mutation: { onSuccess: () => { invalidate(); setOpen(false); resetAddDialog(); } } });
  const completeChore = useCompleteChore({ mutation: { onSuccess: invalidate } });
  const approveChore = useApproveChore({ mutation: { onSuccess: invalidate } });

  const children = members.filter(m => m.role === "child");
  const parents = members.filter(m => m.role === "parent") as ParentInfo[];

  const doCreateChore = () => {
    if (!pendingAddRef.current) return;
    const { assignedToMany, ...base } = pendingAddRef.current;
    createChore.mutate({ data: assignedToMany && assignedToMany.length > 0 ? { ...base, assignedToMany } : base });
  };
  const addVerifyAdmin = useVerifyPin({
    mutation: {
      onSuccess: doCreateChore,
      onError: () => { setAddPinError("Incorrect PIN — try again"); setAddPin(""); },
    }
  });
  const addVerifyParent = useVerifyFamilyMemberPin({
    mutation: {
      onSuccess: doCreateChore,
      onError: () => { setAddPinError("Incorrect PIN — try again"); setAddPin(""); },
    }
  });
  const addPinOptions = [
    ...parents.map(p => ({ value: String(p.id), label: `${p.emoji} ${p.name}` })),
    { value: ADMIN_OPTION, label: "🔑 Admin PIN" },
  ];
  const isAddPending = addVerifyAdmin.isPending || addVerifyParent.isPending || createChore.isPending;

  const handleAddConfirm = () => {
    pendingAddRef.current = { ...form };
    if (addSelected === ADMIN_OPTION) {
      addVerifyAdmin.mutate({ data: { pin: addPin } });
    } else {
      addVerifyParent.mutate({ id: Number(addSelected), data: { pin: addPin } });
    }
  };

  const todo = allChores.filter(c => c.status === "todo");
  const needsApproval = allChores.filter(c => c.status === "pending_approval");
  const done = allChores.filter(c => c.status === "done");
  const missed = allChores.filter(c => c.status === "missed");

  const summarySlice = filterChildId
    ? summary.filter(s => s.memberId === filterChildId)
    : summary;
  const tabCounts = {
    todo: summarySlice.reduce((a, s) => a + s.todoPending, 0),
    approval: summarySlice.reduce((a, s) => a + s.pendingApproval, 0),
    done: summarySlice.reduce((a, s) => a + s.doneToday, 0),
    missed: summarySlice.reduce((a, s) => a + s.missedToday, 0),
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-serif font-bold">Chores</h1>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetAddDialog(); }}>
          <DialogTrigger asChild>
            <Button className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> Add Chore</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            {addStep === "form" ? (
              <>
                <DialogHeader><DialogTitle className="text-xl font-serif">New Chore</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12" /></div>
                  <div>
                    <Label>Assign to</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {children.map(m => {
                        const many = form.assignedToMany ?? [];
                        const sel = many.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const next = sel ? many.filter(id => id !== m.id) : [...many, m.id];
                              setForm(f => ({ ...f, assignedToMany: next, assignedTo: next.length === 1 ? next[0] : undefined }));
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${sel ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}
                          >
                            <span>{m.emoji}</span>
                            <span>{m.name}</span>
                          </button>
                        );
                      })}
                      {children.length === 0 && <span className="text-muted-foreground text-sm">No children added yet</span>}
                    </div>
                    {(form.assignedToMany?.length ?? 0) > 1 && (
                      <p className="text-xs text-muted-foreground mt-1">Creates {form.assignedToMany?.length} separate chores</p>
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
                  <Button className="w-full h-12 rounded-xl" onClick={() => setAddStep("pin")} disabled={!form.title}>
                    Continue →
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-serif flex items-center gap-2">
                    <Lock className="w-5 h-5" /> Confirm with PIN
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">Creating: <span className="font-semibold text-foreground">"{form.title}"</span></p>
                  {addPinOptions.length > 1 && (
                    <div>
                      <Label>Authorising as</Label>
                      <Select value={addSelected} onValueChange={v => { setAddSelected(v); setAddPin(""); setAddPinError(null); }}>
                        <SelectTrigger className="rounded-xl h-12 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {addPinOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>{addSelected === ADMIN_OPTION ? "Admin PIN" : "Parent PIN"}</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={addPin}
                      onChange={e => { setAddPin(e.target.value); setAddPinError(null); }}
                      onKeyDown={e => { if (e.key === "Enter" && addPin) handleAddConfirm(); }}
                      placeholder="••••"
                      className={`rounded-xl h-12 text-center tracking-[0.4em] text-xl mt-1 ${addPinError ? "border-red-500 bg-red-50" : ""}`}
                      autoFocus
                    />
                    {addPinError && <p className="text-red-600 text-sm mt-1">{addPinError}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => { setAddStep("form"); setAddPin(""); setAddPinError(null); }}>
                      ← Back
                    </Button>
                    <Button className="flex-1 h-12 rounded-xl" onClick={handleAddConfirm} disabled={!addPin || isAddPending}>
                      {isAddPending ? "Adding…" : "Add Chore"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card
          className={`rounded-3xl border-2 shadow-sm text-center cursor-pointer transition-all select-none ${!filterChildId ? "border-primary bg-primary/5 shadow-md scale-[1.02]" : "border-transparent hover:border-primary/30 hover:shadow-md"}`}
          onClick={() => setFilterChildId(null)}
        >
          <CardContent className="pt-6 pb-5">
            <div className="mb-2 text-4xl">👨‍👩‍👧‍👦</div>
            <div className="font-bold text-lg">All</div>
            <div className="text-xs text-muted-foreground mt-1">Everyone</div>
          </CardContent>
        </Card>

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
                {s && <div className="text-xs text-muted-foreground mt-1">{s.todoPending} to do · {s.doneToday} done</div>}
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

      <Tabs defaultValue="todo">
        <TabsList className="rounded-2xl h-14 p-1">
          <TabsTrigger value="todo" className="rounded-xl h-11 px-5 text-base gap-2">
            To Do <Badge className="bg-yellow-100 text-yellow-800">{tabCounts.todo}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approval" className="rounded-xl h-11 px-5 text-base gap-2">
            Needs Approval <Badge className="bg-blue-100 text-blue-800">{tabCounts.approval}</Badge>
          </TabsTrigger>
          <TabsTrigger value="done" className="rounded-xl h-11 px-5 text-base gap-2">
            Done Today <Badge className="bg-green-100 text-green-800">{tabCounts.done}</Badge>
          </TabsTrigger>
          <TabsTrigger value="missed" className="rounded-xl h-11 px-5 text-base gap-2">
            Missed <Badge className="bg-red-100 text-red-800">{tabCounts.missed}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todo" className="space-y-3 mt-4">
          {todo.length === 0 && <p className="text-center text-muted-foreground py-12">All chores done! 🎉</p>}
          {todo.map(c => {
            const member = c.assignedMember ?? members.find(m => m.id === c.assignedTo);
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  {member && (
                    <MemberAvatar avatarUrl={member.avatarUrl} emoji={member.emoji} name={member.name} sizeCls="w-10 h-10" />
                  )}
                  <div className="flex-1 min-w-0">
                    {member && <div className="font-bold text-base text-primary">{member.name}</div>}
                    <div className="font-semibold text-lg leading-tight">{c.title}</div>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                      {c.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.dueDate}</span>}
                      {c.repeatType !== "once" && <Badge variant="outline" className="text-xs">{c.repeatType}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-2xl text-lg mr-2">{c.pointsValue} pts</div>
                    <Button size="icon" variant="ghost" className="h-12 w-12 rounded-xl text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => completeChore.mutate({ id: c.id })}>
                      <CheckCircle2 className="w-6 h-6" />
                    </Button>
                    <PinEditDialog chore={c} children={children as ParentInfo[]} parents={parents} onSuccess={invalidate} />
                    <PinDeleteDialog choreId={c.id} choreTitle={c.title} parents={parents} onSuccess={invalidate} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="approval" className="space-y-3 mt-4">
          {needsApproval.length === 0 && <p className="text-center text-muted-foreground py-12">Nothing awaiting approval</p>}
          {needsApproval.map(c => {
            const member = c.assignedMember ?? members.find(m => m.id === c.assignedTo);
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm bg-blue-50">
                <CardContent className="p-5 flex items-center gap-4">
                  {member && (
                    <MemberAvatar avatarUrl={member.avatarUrl} emoji={member.emoji} name={member.name} sizeCls="w-10 h-10" />
                  )}
                  <div className="flex-1 min-w-0">
                    {member && <div className="font-bold text-base text-primary">{member.name}</div>}
                    <div className="font-semibold text-lg leading-tight">{c.title}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">marked as complete — awaiting approval</div>
                  </div>
                  <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-2xl shrink-0">{c.pointsValue} pts</div>
                  {parents.length > 0 ? (
                    <PinApproveDialog
                      choreId={c.id}
                      choreTitle={c.title}
                      parents={parents}
                      onSuccess={invalidate}
                    />
                  ) : (
                    <Button
                      className="rounded-xl h-12 px-6 bg-green-600 hover:bg-green-700 shrink-0"
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

        <TabsContent value="done" className="space-y-3 mt-4">
          {done.length === 0 && <p className="text-center text-muted-foreground py-12">No completed chores yet today</p>}
          {done.map(c => {
            const member = c.assignedMember ?? members.find(m => m.id === c.assignedTo);
            const approver = c.approvedByParentId ? members.find(m => m.id === c.approvedByParentId) : null;
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm opacity-75">
                <CardContent className="p-5 flex items-center gap-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  {member && (
                    <MemberAvatar avatarUrl={member.avatarUrl} emoji={member.emoji} name={member.name} sizeCls="w-10 h-10" />
                  )}
                  <div className="flex-1 min-w-0">
                    {member && <div className="font-bold text-base text-green-700">{member.name}</div>}
                    <div className="font-semibold line-through text-muted-foreground leading-tight">{c.title}</div>
                    {approver && (
                      <div className="flex items-center gap-1.5 text-sm text-green-700 mt-0.5">
                        <span>Approved by</span>
                        {approver.avatarUrl
                          ? <img src={approver.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          : <span>{approver.emoji}</span>}
                        <span>{approver.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-green-700 font-bold shrink-0">+{c.pointsValue} pts</div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="missed" className="space-y-3 mt-4">
          {missed.length === 0 && <p className="text-center text-muted-foreground py-12">No missed chores today 🎉</p>}
          {missed.map(c => {
            const member = c.assignedMember ?? members.find(m => m.id === c.assignedTo);
            return (
              <Card key={c.id} className="rounded-2xl border-0 shadow-sm bg-red-50">
                <CardContent className="p-5 flex items-center gap-4">
                  <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                  {member && (
                    <MemberAvatar avatarUrl={member.avatarUrl} emoji={member.emoji} name={member.name} sizeCls="w-10 h-10" />
                  )}
                  <div className="flex-1 min-w-0">
                    {member && <div className="font-bold text-base text-red-600">{member.name}</div>}
                    <div className="font-semibold text-muted-foreground line-through leading-tight">{c.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Not completed today</div>
                  </div>
                  <div className="text-red-400 font-bold shrink-0">{c.pointsValue} pts</div>
                  {parents.length > 0 ? (
                    <PinDismissDialog
                      choreId={c.id}
                      choreTitle={c.title}
                      parents={parents}
                      onSuccess={invalidate}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl h-10 px-4 text-sm shrink-0"
                      onClick={() => { /* no-op: require parent PIN when parents exist */ }}
                      disabled
                    >
                      Dismiss
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
