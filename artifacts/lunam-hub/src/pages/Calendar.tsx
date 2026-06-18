import { useEffect, useMemo, useState } from "react";
import {
  useListEvents, useCreateEvent, useDeleteEvent, useUpdateEvent,
  useSyncGoogleCalendar, useGetGoogleCalendarStatus,
  useListFamilyMembers,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, parseISO, getDay, getDate, getMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, RefreshCw, Pencil, Users, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventInput, EventUpdate, Event, FamilyMember } from "@workspace/api-client-react";
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

function formatEventTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${mStr}${period}`;
}

const CATEGORY_PILL_BG: Record<string, string> = {
  school: "bg-blue-500 text-white",
  sport: "bg-green-500 text-white",
  appointment: "bg-red-500 text-white",
  birthday: "bg-yellow-400 text-yellow-900",
  family: "bg-purple-500 text-white",
  other: "bg-sky-500 text-white",
};

const CATEGORY_DOT_BG: Record<string, string> = {
  school: "bg-blue-500",
  sport: "bg-green-500",
  appointment: "bg-red-500",
  birthday: "bg-yellow-400",
  family: "bg-purple-500",
  other: "bg-sky-500",
};

function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + "T00:00:00");
}

function doesEventOccurOnDay(event: Event, day: Date): boolean {
  const eventStart = parseLocalDate(event.date);
  if (eventStart > day) return false;
  if (!event.recurrence) return isSameDay(eventStart, day);
  if (event.recurrenceEndDate) {
    const endDate = parseLocalDate(event.recurrenceEndDate as string);
    if (day > endDate) return false;
  }
  switch (event.recurrence as string) {
    case "DAILY":
      return true;
    case "WEEKLY":
      return getDay(eventStart) === getDay(day);
    case "MONTHLY":
      return getDate(eventStart) === getDate(day);
    case "YEARLY":
      return getMonth(eventStart) === getMonth(day) && getDate(eventStart) === getDate(day);
    default:
      return isSameDay(eventStart, day);
  }
}

type FormMode = "create" | "edit";

interface EventForm {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  category: EventInput["category"];
  description?: string;
  location?: string;
  recurrence?: string;
  recurrenceEndDate?: string;
  assignedMembers: number[];
}

const DEFAULT_FORM = (date: string): EventForm => ({
  title: "",
  date,
  allDay: true,
  category: "other",
  description: "",
  location: "",
  recurrence: undefined,
  recurrenceEndDate: undefined,
  assignedMembers: [],
});

function MemberAvatar({ member, size = "sm" }: { member: FamilyMember; size?: "sm" | "xs" }) {
  const initials = member.name.slice(0, 2).toUpperCase();
  const sizeClass = size === "xs" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs";
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.name}
        title={member.name}
        className={cn("rounded-full object-cover ring-2 ring-background", sizeClass)}
      />
    );
  }
  return (
    <div
      title={member.name}
      className={cn("rounded-full flex items-center justify-center font-semibold ring-2 ring-background", sizeClass)}
      style={{ backgroundColor: member.color, color: "#fff" }}
    >
      {initials}
    </div>
  );
}

export default function Calendar() {
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(DEFAULT_FORM(format(new Date(), "yyyy-MM-dd")));
  const [filterMemberId, setFilterMemberId] = useState<number | null>(null);

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: familyMembers = [] } = useListFamilyMembers();
  const memberById = Object.fromEntries(familyMembers.map(m => [m.id, m]));

  const { data: events = [] } = useListEvents(
    filterMemberId ? { startDate, endDate, memberId: filterMemberId } : { startDate, endDate }
  );
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
      startTime: e.startTime ?? undefined,
      endTime: e.endTime ?? undefined,
      allDay: e.allDay,
      category: (e.category as EventInput["category"]) ?? "other",
      description: e.description ?? "",
      location: e.location ?? "",
      recurrence: (e.recurrence as string | null | undefined) ?? undefined,
      recurrenceEndDate: (e.recurrenceEndDate as string | null | undefined) ?? undefined,
      assignedMembers: e.assignedMembers ?? [],
    });
    setOpen(true);
  }

  function toggleMember(id: number) {
    setForm(f => ({
      ...f,
      assignedMembers: f.assignedMembers.includes(id)
        ? f.assignedMembers.filter(m => m !== id)
        : [...f.assignedMembers, id],
    }));
  }

  function handleSubmit() {
    const cleanedRecurrence = (form.recurrence || undefined) as EventInputRecurrence | undefined;
    const cleanedRecurrenceUpdate = (form.recurrence || null) as EventUpdateRecurrence | null;
    const cleanedRecurrenceEndDate = form.recurrenceEndDate || undefined;
    const cleanedStartTime = form.startTime || undefined;
    const cleanedEndTime = form.endTime || undefined;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (mode === "create") {
      const data: EventInput = {
        title: form.title,
        date: form.date,
        allDay: form.allDay ?? !cleanedStartTime,
        category: form.category,
        timezone,
        ...(form.description ? { description: form.description } : {}),
        ...(form.location ? { location: form.location } : {}),
        ...(cleanedRecurrence ? { recurrence: cleanedRecurrence } : {}),
        ...(cleanedRecurrenceEndDate ? { recurrenceEndDate: cleanedRecurrenceEndDate } : {}),
        ...(cleanedStartTime ? { startTime: cleanedStartTime } : {}),
        ...(cleanedEndTime ? { endTime: cleanedEndTime } : {}),
        assignedMembers: form.assignedMembers,
      };
      createEvent.mutate({ data });
    } else if (editingEventId !== null) {
      const data: EventUpdate = {
        title: form.title,
        date: form.date,
        allDay: form.allDay ?? !cleanedStartTime,
        category: form.category as EventUpdate["category"],
        description: form.description || undefined,
        location: form.location || undefined,
        recurrence: cleanedRecurrenceUpdate,
        recurrenceEndDate: cleanedRecurrenceEndDate ?? null,
        startTime: cleanedStartTime,
        endTime: cleanedEndTime,
        timezone,
        assignedMembers: form.assignedMembers,
      };
      updateEvent.mutate({ id: editingEventId, data });
    }
  }

  const isPending = createEvent.isPending || updateEvent.isPending;

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const selectedDayEvents = events.filter(e => doesEventOccurOnDay(e, selectedDay));

  const dayEventsMap = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      map.set(key, events.filter(e => doesEventOccurOnDay(e, day)));
    }
    return map;
  }, [days, events]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
        <div className="flex items-center gap-2">
          {/* Member filter toggle */}
          {familyMembers.length > 0 && (
            <div className="flex items-center gap-1.5 bg-muted/60 rounded-2xl p-1">
              <button
                onClick={() => setFilterMemberId(null)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors",
                  filterMemberId === null
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="w-3.5 h-3.5" />
                All
              </button>
              {familyMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => setFilterMemberId(prev => prev === m.id ? null : m.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors",
                    filterMemberId === m.id
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={m.name}
                >
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.name} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden sm:inline">{m.name}</span>
                </button>
              ))}
            </div>
          )}
          <Button className="h-14 px-6 rounded-2xl text-lg gap-2" onClick={() => openCreate(selectedDay)}>
            <Plus className="w-5 h-5" /> Add Event
          </Button>
        </div>
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
              <Label>Location</Label>
              <Input
                value={form.location ?? ""}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="rounded-xl h-12"
                placeholder="Address or place name (optional)"
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

            {/* ── Family members multi-select ───────────────────────────── */}
            {familyMembers.length > 0 && (
              <div>
                <Label>Family Members</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {familyMembers.map(m => {
                    const selected = form.assignedMembers.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMember(m.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all",
                          selected
                            ? "border-transparent shadow-sm text-white"
                            : "border-muted bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                        )}
                        style={selected ? { backgroundColor: m.color } : {}}
                      >
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt={m.name} className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <span className="text-base leading-none">{m.emoji}</span>
                        )}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
                {form.assignedMembers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to assign to everyone</p>
                )}
              </div>
            )}

            <div>
              <Label>Repeat</Label>
              <Select value={form.recurrence ?? "none"} onValueChange={v => setForm(f => ({ ...f, recurrence: v === "none" ? undefined : v, recurrenceEndDate: v === "none" ? undefined : f.recurrenceEndDate }))}>
                <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Month calendar ──────────────────────────────────────────────── */}
        <Card className="lg:col-span-3 rounded-3xl border-0 shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="h-12 w-12 rounded-xl">
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <CardTitle className="text-2xl font-serif">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="h-12 w-12 rounded-xl">
              <ChevronRight className="w-6 h-6" />
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-3xl">
            <div className="grid grid-cols-7 border-b border-border">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: days[0].getDay() }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[100px] border-r border-b border-border last:border-r-0" />
              ))}
              {days.map((day, idx) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dayEvents = dayEventsMap.get(dayKey) ?? [];
                const selected = isSameDay(day, selectedDay);
                const todayDay = isToday(day);
                const isLastCol = (days[0].getDay() + idx) % 7 === 6;
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "min-h-[100px] flex flex-col items-stretch text-left p-1.5 transition-colors border-b border-border touch-manipulation",
                      !isLastCol && "border-r",
                      selected ? "bg-primary/5 ring-inset ring-2 ring-primary" : "hover:bg-muted/40",
                      !isSameMonth(day, currentMonth) && "opacity-35"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 text-xs font-semibold flex items-center justify-center rounded-full self-end mb-0.5 shrink-0",
                      todayDay ? "bg-primary text-primary-foreground" : selected ? "text-primary" : "text-foreground"
                    )}>
                      {format(day, "d")}
                    </div>
                    {dayEvents.slice(0, 3).map(ev => {
                      const cat = ev.category ?? "other";
                      return ev.allDay ? (
                        <div
                          key={ev.id}
                          className={cn("text-[10px] leading-tight px-1.5 py-0.5 rounded mb-0.5 font-medium truncate", CATEGORY_PILL_BG[cat] ?? "bg-sky-500 text-white")}
                        >
                          {ev.title}
                        </div>
                      ) : (
                        <div key={ev.id} className="text-[10px] leading-tight flex items-center gap-0.5 mb-0.5 min-w-0">
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", CATEGORY_DOT_BG[cat] ?? "bg-sky-500")} />
                          <span className="truncate text-foreground/80">
                            {ev.startTime ? formatEventTime(ev.startTime) + " " : ""}{ev.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[9px] text-muted-foreground px-1 mt-auto">+{dayEvents.length - 3} more</div>
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
              selectedDayEvents.map(e => {
                const assignedMemberObjects = (e.assignedMembers ?? [])
                  .map(id => memberById[id])
                  .filter(Boolean) as FamilyMember[];
                return (
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
                          <Clock className="w-3 h-3" />{formatEventTime(e.startTime)}{e.endTime ? ` – ${formatEventTime(e.endTime)}` : ""}
                        </div>
                      )}
                      {e.location && (
                        <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                          <MapPin className="w-3 h-3 shrink-0" /><span className="line-clamp-1">{e.location}</span>
                        </div>
                      )}
                      {e.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={cn("text-xs", CATEGORY_COLORS[e.category ?? "other"])} variant="outline">
                          {e.category}
                        </Badge>
                        {/* Assigned member avatars */}
                        {assignedMemberObjects.length > 0 && (
                          <div className="flex -space-x-1">
                            {assignedMemberObjects.map(m => (
                              <MemberAvatar key={m.id} member={m} size="xs" />
                            ))}
                          </div>
                        )}
                      </div>
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
                );
              })
            )}
            <Button
              variant="outline"
              className="w-full rounded-xl h-14"
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
