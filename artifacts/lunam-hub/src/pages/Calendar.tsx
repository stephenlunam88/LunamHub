import { useEffect, useState } from "react";
import {
  useListEvents, useCreateEvent, useDeleteEvent, useUpdateEvent,
  useSyncGoogleCalendar, useGetGoogleCalendarStatus,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, RefreshCw, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventInput, EventUpdate, Event } from "@workspace/api-client-react";
import type { EventInputRecurrence, EventUpdateRecurrence } from "@workspace/api-client-react";

const CATEGORY_COLORS: Record<string, string> = {
  school: "bg-blue-100 text-blue-800",
  sport: "bg-green-100 text-green-800",
  appointment: "bg-red-100 text-red-800",
  birthday: "bg-yellow-100 text-yellow-800",
  family: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-800",
};

const RECURRENCE_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

type FormMode = "create" | "edit";

interface EventForm {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  category: EventInput["category"];
  description?: string;
  recurrence?: string;
  recurrenceEndDate?: string;
}

const DEFAULT_FORM = (date: string): EventForm => ({
  title: "",
  date,
  allDay: true,
  category: "other",
  description: "",
  recurrence: "",
  recurrenceEndDate: "",
});

export default function Calendar() {
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(DEFAULT_FORM(format(new Date(), "yyyy-MM-dd")));

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");
  const { data: events = [] } = useListEvents({ startDate, endDate });
  const { data: gcalStatus } = useGetGoogleCalendarStatus();
  const isConnected = gcalStatus?.connected ?? false;

  const sync = useSyncGoogleCalendar({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  });

  useEffect(() => {
    if (isConnected) {
      sync.mutate({ data: { startDate, endDate } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isConnected]);

  function invalidate() {
    if (isConnected) {
      sync.mutate({ data: { startDate, endDate } });
    } else {
      qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
    }
  }

  const createEvent = useCreateEvent({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setForm(DEFAULT_FORM(format(selectedDay, "yyyy-MM-dd")));
        invalidate();
      },
    },
  });

  const updateEvent = useUpdateEvent({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setEditingEventId(null);
        invalidate();
      },
    },
  });

  const deleteEvent = useDeleteEvent({
    mutation: {
      onSettled: () => invalidate(),
    },
  });

  function openCreate(date: Date) {
    setMode("create");
    setEditingEventId(null);
    setForm(DEFAULT_FORM(format(date, "yyyy-MM-dd")));
    setOpen(true);
  }

  function openEdit(e: Event) {
    setMode("edit");
    setEditingEventId(e.id);
    setForm({
      title: e.title,
      date: e.date,
      startTime: e.startTime ?? "",
      endTime: e.endTime ?? "",
      allDay: e.allDay,
      category: (e.category as EventInput["category"]) ?? "other",
      description: e.description ?? "",
      recurrence: (e.recurrence as string | undefined) ?? "",
      recurrenceEndDate: (e.recurrenceEndDate as string | undefined) ?? "",
    });
    setOpen(true);
  }

  function handleSubmit() {
    const cleanedRecurrence = (form.recurrence || undefined) as EventInputRecurrence | undefined;
    const cleanedRecurrenceUpdate = (form.recurrence || null) as EventUpdateRecurrence | null;
    const cleanedRecurrenceEndDate = form.recurrenceEndDate || undefined;
    const cleanedStartTime = form.startTime || undefined;
    const cleanedEndTime = form.endTime || undefined;

    if (mode === "create") {
      const data: EventInput = {
        title: form.title,
        date: form.date,
        allDay: form.allDay ?? !cleanedStartTime,
        category: form.category,
        ...(form.description ? { description: form.description } : {}),
        ...(cleanedRecurrence ? { recurrence: cleanedRecurrence } : {}),
        ...(cleanedRecurrenceEndDate ? { recurrenceEndDate: cleanedRecurrenceEndDate } : {}),
        ...(cleanedStartTime ? { startTime: cleanedStartTime } : {}),
        ...(cleanedEndTime ? { endTime: cleanedEndTime } : {}),
      };
      createEvent.mutate({ data });
    } else if (editingEventId !== null) {
      const data: EventUpdate = {
        title: form.title,
        date: form.date,
        allDay: form.allDay ?? !cleanedStartTime,
        category: form.category as EventUpdate["category"],
        description: form.description || undefined,
        recurrence: cleanedRecurrenceUpdate,
        recurrenceEndDate: cleanedRecurrenceEndDate ?? null,
        startTime: cleanedStartTime,
        endTime: cleanedEndTime,
      };
      updateEvent.mutate({ id: editingEventId, data });
    }
  }

  const isPending = createEvent.isPending || updateEvent.isPending;

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const selectedDayEvents = events.filter(e => isSameDay(parseISO(e.date), selectedDay));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-serif font-bold">Calendar</h1>
          {isConnected && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Google Calendar
              {sync.isPending && <RefreshCw className="w-3 h-3 animate-spin ml-0.5" />}
            </span>
          )}
        </div>
        <Button className="h-14 px-6 rounded-2xl text-lg gap-2" onClick={() => openCreate(selectedDay)}>
          <Plus className="w-5 h-5" /> Add Event
        </Button>
      </div>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingEventId(null); }}>
        <DialogContent className="rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12" placeholder="Event name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="rounded-xl resize-none"
                rows={3}
                placeholder="Notes or details (optional)"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-xl h-12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input
                  type="time"
                  value={form.startTime ?? ""}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value, allDay: !e.target.value }))}
                  className="rounded-xl h-12"
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="time"
                  value={form.endTime ?? ""}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="rounded-xl h-12"
                />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as EventInput["category"] }))}>
                <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["school", "sport", "appointment", "birthday", "family", "other"].map(c => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Repeat</Label>
              <Select value={form.recurrence ?? ""} onValueChange={v => setForm(f => ({ ...f, recurrence: v, recurrenceEndDate: v ? f.recurrenceEndDate : "" }))}>
                <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrence && (
              <div>
                <Label>End Repeat (optional)</Label>
                <Input
                  type="date"
                  value={form.recurrenceEndDate ?? ""}
                  onChange={e => setForm(f => ({ ...f, recurrenceEndDate: e.target.value }))}
                  className="rounded-xl h-12"
                />
              </div>
            )}
            <Button
              className="w-full h-12 rounded-xl"
              onClick={handleSubmit}
              disabled={!form.title || isPending}
            >
              {isPending ? (mode === "edit" ? "Saving…" : "Adding…") : (mode === "edit" ? "Save Changes" : "Add Event")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Month calendar ──────────────────────────────────────────────── */}
        <Card className="lg:col-span-2 rounded-3xl border-0 shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="h-12 w-12 rounded-xl">
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <CardTitle className="text-2xl font-serif">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="h-12 w-12 rounded-xl">
              <ChevronRight className="w-6 h-6" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-center text-sm font-semibold text-muted-foreground py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
              {days.map(day => {
                const hasEvents = events.some(e => isSameDay(parseISO(e.date), day));
                const selected = isSameDay(day, selectedDay);
                const todayDay = isToday(day);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-2xl text-lg font-medium transition-colors relative touch-manipulation",
                      selected ? "bg-primary text-primary-foreground" : todayDay ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted",
                      !isSameMonth(day, currentMonth) && "opacity-30"
                    )}
                  >
                    {format(day, "d")}
                    {hasEvents && (
                      <span className={cn("absolute bottom-1 w-1.5 h-1.5 rounded-full", selected ? "bg-primary-foreground" : "bg-primary")} />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Day panel ───────────────────────────────────────────────────── */}
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-serif">{format(selectedDay, "EEEE, MMM d")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDayEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No events this day</p>
            ) : (
              selectedDayEvents.map(e => (
                <div key={e.id} className="bg-muted rounded-2xl p-4 flex gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{e.title}</span>
                      {e.googleEventId && (
                        <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">GCal</span>
                      )}
                      {e.recurrence && (
                        <span className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                          {RECURRENCE_LABELS[e.recurrence as string] ?? e.recurrence}
                        </span>
                      )}
                    </div>
                    {e.startTime && (
                      <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                        <Clock className="w-3 h-3" />{e.startTime}{e.endTime ? ` – ${e.endTime}` : ""}
                      </div>
                    )}
                    {e.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.description}</p>
                    )}
                    <Badge className={cn("mt-2 text-xs", CATEGORY_COLORS[e.category ?? "other"])} variant="outline">
                      {e.category}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(e)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label="Edit event"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteEvent.mutate({ id: e.id })}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      aria-label="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
            <Button
              variant="outline"
              className="w-full rounded-xl h-12"
              onClick={() => openCreate(selectedDay)}
            >
              <Plus className="w-4 h-4 mr-2" /> Add to this day
            </Button>
            {isConnected && (
              <Button
                variant="ghost"
                className="w-full rounded-xl h-10 text-muted-foreground text-sm gap-1.5"
                onClick={() => sync.mutate({ data: { startDate, endDate } })}
                disabled={sync.isPending}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", sync.isPending && "animate-spin")} />
                {sync.isPending ? "Syncing…" : "Sync Google Calendar"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
