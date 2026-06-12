import { useState } from "react";
import {
  useListRoutines, useGetRoutine, useCreateRoutine, useDeleteRoutine,
  useCreateRoutineItem, useDeleteRoutineItem, useCompleteRoutineItem, useListFamilyMembers,
  getListRoutinesQueryKey, getGetRoutineQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoutineInput } from "@workspace/api-client-react";

const TOD_ICONS: Record<string, string> = { morning: "🌅", afternoon: "☀️", evening: "🌙", bedtime: "🌛" };

type RoutineDetail = {
  id: number; name: string; assignedTo?: number | null; timeOfDay?: string; createdAt: string;
  items?: { id: number; text: string; order: number }[];
  completionsToday?: number[];
};

export default function Routines() {
  const qc = useQueryClient();
  const { data: routines = [] } = useListRoutines();
  const { data: members = [] } = useListFamilyMembers();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: routine } = useGetRoutine(selectedId ?? 0, {
    query: { enabled: selectedId !== null, queryKey: getGetRoutineQueryKey(selectedId ?? 0) }
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RoutineInput>({ name: "", timeOfDay: "morning" });
  const [newItemText, setNewItemText] = useState("");

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListRoutinesQueryKey() });
    if (selectedId) qc.invalidateQueries({ queryKey: getGetRoutineQueryKey(selectedId) });
  };

  const createRoutine = useCreateRoutine({ mutation: { onSuccess: (r) => { invalidateAll(); setOpen(false); setForm({ name: "", timeOfDay: "morning" }); setSelectedId(r.id); } } });
  const deleteRoutine = useDeleteRoutine({ mutation: { onSuccess: () => { invalidateAll(); setSelectedId(null); } } });
  const createItem = useCreateRoutineItem({ mutation: { onSuccess: () => { if (selectedId) qc.invalidateQueries({ queryKey: getGetRoutineQueryKey(selectedId) }); setNewItemText(""); } } });
  const deleteItem = useDeleteRoutineItem({ mutation: { onSuccess: () => { if (selectedId) qc.invalidateQueries({ queryKey: getGetRoutineQueryKey(selectedId) }); } } });
  const completeItem = useCompleteRoutineItem({ mutation: { onSuccess: () => { if (selectedId) qc.invalidateQueries({ queryKey: getGetRoutineQueryKey(selectedId) }); } } });

  const r = routine as RoutineDetail | undefined;
  const items = r?.items ?? [];
  const completionsToday = r?.completionsToday ?? [];
  const progress = items.length > 0 ? Math.round((completionsToday.length / items.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-serif font-bold">Routines</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> New Routine</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="text-xl font-serif">New Routine</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl h-12" /></div>
              <div><Label>Assign to</Label>
                <Select value={form.assignedTo?.toString() ?? ""} onValueChange={v => setForm(f => ({ ...f, assignedTo: v ? Number(v) : undefined }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Everyone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Everyone</SelectItem>
                    {members.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.emoji} {m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Time of Day</Label>
                <Select value={form.timeOfDay ?? "morning"} onValueChange={v => setForm(f => ({ ...f, timeOfDay: v as RoutineInput["timeOfDay"] }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["morning","afternoon","evening","bedtime"].map(t => (
                      <SelectItem key={t} value={t}>{TOD_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full h-12 rounded-xl" onClick={() => createRoutine.mutate({ data: form })} disabled={!form.name || createRoutine.isPending}>
                {createRoutine.isPending ? "Creating…" : "Create Routine"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          {routines.length === 0 && <p className="text-muted-foreground text-center py-12">No routines yet</p>}
          {routines.map(rt => {
            const member = members.find(m => m.id === rt.assignedTo);
            return (
              <button key={rt.id} onClick={() => setSelectedId(rt.id)}
                className={cn("w-full text-left rounded-2xl border-2 border-border p-4 transition-all bg-card hover:shadow-sm touch-manipulation",
                  selectedId === rt.id ? "ring-2 ring-primary ring-offset-2" : "")}>
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{TOD_ICONS[rt.timeOfDay ?? "morning"]}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{rt.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {member ? `${member.emoji} ${member.name}` : "Everyone"} · {rt.timeOfDay}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selectedId !== null && r && (
          <div className="lg:col-span-2">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl font-serif">{r.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline">{TOD_ICONS[r.timeOfDay ?? "morning"]} {r.timeOfDay}</Badge>
                      {r.assignedTo && members.find(m => m.id === r.assignedTo) && (
                        <Badge variant="outline">
                          {members.find(m => m.id === r.assignedTo)?.emoji} {members.find(m => m.id === r.assignedTo)?.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button onClick={() => deleteRoutine.mutate({ id: selectedId })} className="text-muted-foreground hover:text-destructive p-2">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                {items.length > 0 && (
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Today's progress</span><span>{completionsToday.length}/{items.length}</span>
                    </div>
                    <Progress value={progress} className="h-3 rounded-full" />
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <Input placeholder="Add a step…" value={newItemText} onChange={e => setNewItemText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newItemText.trim())
                        createItem.mutate({ id: selectedId, data: { text: newItemText.trim(), order: items.length + 1 } });
                    }}
                    className="rounded-xl h-12" />
                  <Button className="h-12 px-5 rounded-xl" onClick={() => {
                    if (newItemText.trim()) createItem.mutate({ id: selectedId, data: { text: newItemText.trim(), order: items.length + 1 } });
                  }}>
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>

                {[...items].sort((a, b) => a.order - b.order).map(item => {
                  const done = completionsToday.includes(item.id);
                  return (
                    <div key={item.id} className={cn("flex items-center gap-4 rounded-2xl p-4 transition-all group", done ? "bg-green-50 opacity-75" : "bg-muted")}>
                      <button onClick={() => !done && completeItem.mutate({ id: selectedId, data: { routineItemId: item.id } })}
                        className={cn("flex-shrink-0 transition-colors", done ? "text-green-600" : "text-muted-foreground hover:text-green-600")}>
                        {done ? <CheckCircle2 className="w-7 h-7" /> : <Circle className="w-7 h-7" />}
                      </button>
                      <span className={cn("flex-1 text-base", done && "line-through text-muted-foreground")}>{item.text}</span>
                      <button onClick={() => deleteItem.mutate({ id: selectedId, itemId: item.id })}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-center text-muted-foreground py-8">No steps yet — add some!</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
