import { useEffect, useMemo, useState } from "react";
import {
  useListEvents,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
  useSyncGoogleCalendar,
  useGetGoogleCalendarStatus,
  useListFamilyMembers,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
  parseISO,
  getDay,
  getDate,
  getMonth,
  addDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MemberAvatar as ProfileAvatar } from "@/components/MemberAvatar";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  RefreshCw,
  Pencil,
  Users,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  EventInput,
  EventUpdate,
  Event,
  FamilyMember,
} from "@workspace/api-client-react";
import type {
  EventInputRecurrence,
  EventUpdateRecurrence,
} from "@workspace/api-client-react";

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
  FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  // Check exceptions (single-occurrence deletes)
  const exceptions = (event as Event & { recurrenceExceptions?: string | null })
    .recurrenceExceptions;
  if (exceptions) {
    const dayStr = format(day, "yyyy-MM-dd");
    if (exceptions.split(",").includes(dayStr)) return false;
  }
  const activeDays = (event as Event & { recurrenceDays?: string | null })
    .recurrenceDays
    ? (event as Event & { recurrenceDays?: string | null })
        .recurrenceDays!.split(",")
        .map(Number)
    : null;
  switch (event.recurrence as string) {
    case "DAILY":
      return true;
    case "WEEKLY":
      if (activeDays) return activeDays.includes(getDay(day));
      return getDay(eventStart) === getDay(day);
    case "FORTNIGHTLY": {
      const targetDays = activeDays ?? [getDay(eventStart)];
      if (!targetDays.includes(getDay(day))) return false;
      // Check biweekly parity: is this day in an "active" week (same 2-week cycle as start)?
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const startOfStartWeek = new Date(eventStart);
      startOfStartWeek.setDate(
        eventStart.getDate() - ((eventStart.getDay() + 6) % 7),
      );
      startOfStartWeek.setHours(0, 0, 0, 0);
      const startOfThisWeek = new Date(day);
      startOfThisWeek.setDate(day.getDate() - ((day.getDay() + 6) % 7));
      startOfThisWeek.setHours(0, 0, 0, 0);
      const weekDiff = Math.round(
        (startOfThisWeek.getTime() - startOfStartWeek.getTime()) / msPerWeek,
      );
      return weekDiff >= 0 && weekDiff % 2 === 0;
    }
    case "MONTHLY":
      return getDate(eventStart) === getDate(day);
    case "YEARLY":
      return (
        getMonth(eventStart) === getMonth(day) &&
        getDate(eventStart) === getDate(day)
      );
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
  recurrenceDays?: string;
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
  recurrenceDays: undefined,
  assignedMembers: [],
});

function MemberAvatar({
  member,
  size = "sm",
}: {
  member: FamilyMember;
  size?: "sm" | "xs";
}) {
  const initials = member.name.slice(0, 2).toUpperCase();
  const sizeClass = size === "xs" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs";
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.name}
        title={member.name}
        className={cn(
          "rounded-full object-cover ring-2 ring-background",
          sizeClass,
        )}
      />
    );
  }
  return (
    <div
      title={member.name}
      className={cn(
        "rounded-full flex items-center justify-center font-semibold ring-2 ring-background",
        sizeClass,
      )}
      style={{ backgroundColor: member.color, color: "#fff" }}
    >
      {initials}
    </div>
  );
}

export default function Calendar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"month" | "week" | "agenda">(() =>
    window.matchMedia("(max-width: 767px)").matches ? "agenda" : "month",
  );
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(
    DEFAULT_FORM(format(new Date(), "yyyy-MM-dd")),
  );
  const [filterMemberIds, setFilterMemberIds] = useState<number[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    event: Event;
    day: Date;
  } | null>(null);

  const rangeStart =
    view === "month"
      ? startOfMonth(currentMonth)
      : view === "week"
        ? startOfWeek(currentMonth, { weekStartsOn: 1 })
        : currentMonth;
  const rangeEnd =
    view === "month"
      ? endOfMonth(currentMonth)
      : view === "week"
        ? endOfWeek(currentMonth, { weekStartsOn: 1 })
        : addDays(currentMonth, 13);
  const startDate = format(rangeStart, "yyyy-MM-dd");
  const endDate = format(rangeEnd, "yyyy-MM-dd");

  const { data: familyMembers = [] } = useListFamilyMembers();
  const memberById = Object.fromEntries(familyMembers.map((m) => [m.id, m]));

  const {
    data: allEvents = [],
    isLoading,
    isError: eventsError,
  } = useListEvents({ startDate, endDate });
  const events = allEvents
    .filter((event) => {
      const members = event.assignedMembers ?? [];
      return (
        (!filterMemberIds.length && !showUnassigned) ||
        members.some((id) => filterMemberIds.includes(id)) ||
        (showUnassigned && members.length === 0)
      );
    })
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.title.localeCompare(b.title),
    );
  const { data: gcalStatus } = useGetGoogleCalendarStatus();
  const isConnected = gcalStatus?.connected ?? false;

  const sync = useSyncGoogleCalendar({
    mutation: {
      onSuccess: (result) => {
        if (result.connected) setLastSynced(new Date());
        qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      },
    },
  });

  useEffect(() => {
    if (isConnected) {
      sync.mutate({ data: { startDate, endDate } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !sync.isPending)
        sync.mutate({ data: { startDate, endDate } });
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [startDate, endDate, isConnected, sync.isPending, sync.mutate]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
    if (isConnected) {
      sync.mutate({ data: { startDate, endDate } });
    } else {
      qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
    }
  }

  function showError(error: Error) {
    toast({
      title: "Calendar change failed",
      description: error.message,
      variant: "destructive",
    });
  }

  const createEvent = useCreateEvent({
    mutation: {
      onError: showError,
      onSuccess: () => {
        setOpen(false);
        setForm(DEFAULT_FORM(format(selectedDay, "yyyy-MM-dd")));
        invalidate();
      },
    },
  });

  const updateEvent = useUpdateEvent({
    mutation: {
      onError: showError,
      onSuccess: () => {
        setOpen(false);
        setEditingEventId(null);
        invalidate();
      },
    },
  });

  const deleteEvent = useDeleteEvent({
    mutation: {
      onError: showError,
      onSettled: () => invalidate(),
    },
  });

  function openCreate(date: Date) {
    setMode("create");
    setEditingEventId(null);
    setForm(DEFAULT_FORM(format(date, "yyyy-MM-dd")));
    setOpen(true);
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("quick") === "add") {
      openCreate(new Date());
    }
    const handleQuickAction = (event: globalThis.Event) => {
      if ((event as CustomEvent<string>).detail === "add")
        openCreate(new Date());
    };
    window.addEventListener("lunamhub:quick-action", handleQuickAction);
    return () =>
      window.removeEventListener("lunamhub:quick-action", handleQuickAction);
    // Open once when entering from mobile Quick Add.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      recurrenceEndDate:
        (e.recurrenceEndDate as string | null | undefined) ?? undefined,
      recurrenceDays:
        (e as Event & { recurrenceDays?: string | null }).recurrenceDays ??
        undefined,
      assignedMembers: e.assignedMembers ?? [],
    });
    setOpen(true);
  }

  function toggleMember(id: number) {
    setForm((f) => ({
      ...f,
      assignedMembers: f.assignedMembers.includes(id)
        ? f.assignedMembers.filter((m) => m !== id)
        : [...f.assignedMembers, id],
    }));
  }

  function handleSubmit() {
    const cleanedRecurrence = (form.recurrence || undefined) as
      | EventInputRecurrence
      | undefined;
    const cleanedRecurrenceUpdate = (form.recurrence ||
      null) as EventUpdateRecurrence | null;
    const cleanedRecurrenceEndDate = form.recurrenceEndDate || undefined;
    const cleanedRecurrenceDays = form.recurrenceDays || undefined;
    const cleanedStartTime = form.startTime || undefined;
    const cleanedEndTime = form.endTime || undefined;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (mode === "create") {
      const data = {
        title: form.title,
        date: form.date,
        allDay: form.allDay ?? !cleanedStartTime,
        category: form.category,
        timezone,
        ...(form.description ? { description: form.description } : {}),
        ...(form.location ? { location: form.location } : {}),
        ...(cleanedRecurrence ? { recurrence: cleanedRecurrence } : {}),
        ...(cleanedRecurrenceEndDate
          ? { recurrenceEndDate: cleanedRecurrenceEndDate }
          : {}),
        ...(cleanedRecurrenceDays
          ? { recurrenceDays: cleanedRecurrenceDays }
          : {}),
        ...(cleanedStartTime ? { startTime: cleanedStartTime } : {}),
        ...(cleanedEndTime ? { endTime: cleanedEndTime } : {}),
        assignedMembers: form.assignedMembers,
      } as EventInput;
      createEvent.mutate({ data });
    } else if (editingEventId !== null) {
      const data = {
        title: form.title,
        date: form.date,
        allDay: form.allDay ?? !cleanedStartTime,
        category: form.category as EventUpdate["category"],
        description: form.description || null,
        location: form.location || null,
        recurrence: cleanedRecurrenceUpdate,
        recurrenceEndDate: cleanedRecurrenceEndDate ?? null,
        recurrenceDays: cleanedRecurrenceDays ?? null,
        startTime: form.allDay ? null : (cleanedStartTime ?? null),
        endTime: form.allDay ? null : (cleanedEndTime ?? null),
        timezone,
        assignedMembers: form.assignedMembers,
      } as EventUpdate;
      updateEvent.mutate({ id: editingEventId, data });
    }
  }

  const isPending = createEvent.isPending || updateEvent.isPending;

  const days = eachDayOfInterval({
    start: rangeStart,
    end: rangeEnd,
  });
  const selectedDayEvents = events.filter((e) =>
    doesEventOccurOnDay(e, selectedDay),
  );

  const dayEventsMap = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      map.set(
        key,
        events.filter((e) => doesEventOccurOnDay(e, day)),
      );
    }
    return map;
  }, [days, events]);

  const isAllFilter = !filterMemberIds.length && !showUnassigned;
  const navigate = (direction: number) => {
    const date =
      view === "month"
        ? addMonths(currentMonth, direction)
        : addDays(currentMonth, direction * (view === "week" ? 7 : 14));
    setCurrentMonth(date);
    setSelectedDay(date);
  };
  const membersFor = (event: Event) =>
    (event.assignedMembers ?? [])
      .map((id) => memberById[id])
      .filter(Boolean) as FamilyMember[];
  const eventAccent = (event: Event) => {
    const members = membersFor(event);
    return members.length === 1
      ? members[0].color
      : members.length
        ? "#7c3aed"
        : "#64748b";
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-300 md:h-full">
      <div className="grid gap-3 shrink-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-serif font-bold">Calendar</h1>
          {isConnected && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Google Calendar
              {sync.isPending && (
                <RefreshCw className="w-3 h-3 animate-spin ml-0.5" />
              )}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {/* Member filter toggle */}
          {familyMembers.length > 0 && (
            <div className="flex h-12 min-w-0 flex-1 items-center gap-1.5 overflow-x-auto rounded-2xl bg-muted/60 p-1.5 sm:h-14">
              <button
                onClick={() => {
                  setFilterMemberIds([]);
                  setShowUnassigned(false);
                }}
                aria-pressed={isAllFilter}
                className={cn(
                  "flex shrink-0 items-center gap-2 px-3 h-full rounded-xl text-sm font-medium transition-colors sm:px-4 sm:text-base",
                  isAllFilter
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="w-4 h-4" />
                All
              </button>
              {familyMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() =>
                    setFilterMemberIds((prev) =>
                      prev.includes(m.id)
                        ? prev.filter((id) => id !== m.id)
                        : [...prev, m.id],
                    )
                  }
                  aria-pressed={filterMemberIds.includes(m.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 px-3 h-full rounded-xl text-sm font-medium transition-colors sm:px-4 sm:text-base",
                    filterMemberIds.includes(m.id)
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title={m.name}
                >
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt={m.name}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                    aria-hidden="true"
                  />
                  <span>{m.name}</span>
                </button>
              ))}
              <button
                className={cn(
                  "shrink-0 rounded-xl px-3 h-full text-sm",
                  showUnassigned && "bg-background shadow-sm",
                )}
                aria-pressed={showUnassigned}
                onClick={() => setShowUnassigned((value) => !value)}
              >
                Unassigned
              </button>
            </div>
          )}
          <Button
            className="h-12 shrink-0 rounded-2xl px-4 text-base gap-2 sm:h-14 sm:px-6 sm:text-lg"
            onClick={() => openCreate(selectedDay)}
          >
            <Plus className="w-5 h-5" />{" "}
            <span className="hidden min-[390px]:inline">Add Event</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const now = new Date();
              setCurrentMonth(now);
              setSelectedDay(now);
            }}
          >
            Today
          </Button>
          <div
            className="flex rounded-xl bg-muted p-1"
            aria-label="Calendar view"
          >
            {(["agenda", "week", "month"] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={view === option ? "default" : "ghost"}
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className="capitalize"
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Colours show people · Categories show activities
          {gcalStatus?.timeZone ? ` · ${gcalStatus.timeZone}` : ""}
        </p>
      </div>
      {eventsError && (
        <p role="alert" className="text-destructive">
          Events could not be loaded. Please refresh and try again.
        </p>
      )}
      {isLoading && (
        <p role="status" className="text-muted-foreground">
          Loading events…
        </p>
      )}
      {isConnected && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span role={sync.isError ? "alert" : "status"}>
            {sync.isPending
              ? "Syncing Google Calendar…"
              : sync.isError
                ? "Sync failed. Your saved events are still available."
                : lastSynced
                  ? `Last synced at ${format(lastSynced, "h:mm a")}`
                  : "Google Calendar connected"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={sync.isPending}
            onClick={() => sync.mutate({ data: { startDate, endDate } })}
          >
            Retry / sync now
          </Button>
        </div>
      )}

      {/* ── Delete recurring event dialog ─────────────────────────────────── */}
      <Dialog
        open={!!deleteDialog}
        onOpenChange={(v) => {
          if (!v) setDeleteDialog(null);
        }}
      >
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete "{deleteDialog?.event.title}"</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This is a recurring event. What would you like to delete?
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <Button
              variant="outline"
              className="rounded-xl h-12 justify-start"
              disabled={deleteEvent.isPending || updateEvent.isPending}
              onClick={() => {
                if (!deleteDialog) return;
                const ev = deleteDialog.event as Event & {
                  recurrenceExceptions?: string | null;
                };
                const dateStr = format(deleteDialog.day, "yyyy-MM-dd");
                const current = ev.recurrenceExceptions
                  ? ev.recurrenceExceptions.split(",")
                  : [];
                if (!current.includes(dateStr)) {
                  const updated = [...current, dateStr].join(",");
                  updateEvent.mutate({
                    id: ev.id,
                    data: { recurrenceExceptions: updated } as EventUpdate,
                  });
                }
                setDeleteDialog(null);
              }}
            >
              <span className="font-medium">Delete this date only</span>
              <span className="text-muted-foreground text-xs ml-1">
                ({deleteDialog ? format(deleteDialog.day, "d MMM yyyy") : ""})
              </span>
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12"
              disabled={deleteEvent.isPending || updateEvent.isPending}
              onClick={() => {
                if (!deleteDialog) return;
                deleteEvent.mutate({ id: deleteDialog.event.id });
                setDeleteDialog(null);
              }}
            >
              Delete entire series
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl h-10"
              onClick={() => setDeleteDialog(null)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditingEventId(null);
        }}
      >
        <DialogContent className="rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit Event" : "New Event"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="rounded-xl h-12"
                placeholder="Event name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="rounded-xl resize-none"
                rows={3}
                placeholder="Notes or details (optional)"
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={form.location ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                className="rounded-xl h-12"
                placeholder="Address or place name (optional)"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                className="rounded-xl h-12"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input
                  type="time"
                  value={form.startTime ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      startTime: e.target.value,
                      allDay: !e.target.value,
                    }))
                  }
                  className="rounded-xl h-12"
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="time"
                  value={form.endTime ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endTime: e.target.value }))
                  }
                  className="rounded-xl h-12"
                />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    category: v as EventInput["category"],
                  }))
                }
              >
                <SelectTrigger className="rounded-xl h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "school",
                    "sport",
                    "appointment",
                    "birthday",
                    "family",
                    "other",
                  ].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Family members multi-select ───────────────────────────── */}
            {familyMembers.length > 0 && (
              <div>
                <Label>Family Members</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      assignedMembers: familyMembers.map((m) => m.id),
                    }))
                  }
                >
                  Select whole family
                </Button>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {familyMembers.map((m) => {
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
                            : "border-muted bg-muted/30 text-muted-foreground hover:border-muted-foreground/30",
                        )}
                        style={selected ? { backgroundColor: m.color } : {}}
                      >
                        <ProfileAvatar
                          name={m.name}
                          avatarUrl={m.avatarUrl}
                          className="h-4 w-4"
                        />
                        {m.name}
                      </button>
                    );
                  })}
                </div>
                {form.assignedMembers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No one selected — this event will be marked Unassigned.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Repeat</Label>
              <Select
                value={form.recurrence ?? "none"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    recurrence: v === "none" ? undefined : v,
                    recurrenceEndDate:
                      v === "none" ? undefined : f.recurrenceEndDate,
                    recurrenceDays:
                      v === "none" ||
                      v === "DAILY" ||
                      v === "MONTHLY" ||
                      v === "YEARLY"
                        ? undefined
                        : f.recurrenceDays,
                  }))
                }
              >
                <SelectTrigger className="rounded-xl h-12">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="FORTNIGHTLY">Fortnightly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.recurrence === "WEEKLY" ||
              form.recurrence === "FORTNIGHTLY") && (
              <div>
                <Label>Repeat on days (optional)</Label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {DOW_LABELS.map((label, idx) => {
                    const active =
                      form.recurrenceDays
                        ?.split(",")
                        .map(Number)
                        .includes(idx) ?? false;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const current = form.recurrenceDays
                            ? form.recurrenceDays.split(",").map(Number)
                            : [];
                          const next = active
                            ? current.filter((d) => d !== idx)
                            : [...current, idx].sort((a, b) => a - b);
                          setForm((f) => ({
                            ...f,
                            recurrenceDays:
                              next.length > 0 ? next.join(",") : undefined,
                          }));
                        }}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank to repeat on the event's start day
                </p>
              </div>
            )}
            {form.recurrence && (
              <div>
                <Label>End Repeat (optional)</Label>
                <Input
                  type="date"
                  value={form.recurrenceEndDate ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      recurrenceEndDate: e.target.value,
                    }))
                  }
                  className="rounded-xl h-12"
                />
              </div>
            )}
            <Button
              className="w-full h-12 rounded-xl"
              onClick={handleSubmit}
              disabled={!form.title || isPending}
            >
              {isPending
                ? mode === "edit"
                  ? "Saving…"
                  : "Adding…"
                : mode === "edit"
                  ? "Save Changes"
                  : "Add Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-4">
        {/* ── Month calendar ──────────────────────────────────────────────── */}
        <Card
          className={cn(
            "rounded-3xl border-0 shadow-sm flex flex-col overflow-hidden lg:col-span-3",
            view === "month"
              ? "min-h-[420px] lg:min-h-[550px]"
              : "min-h-[420px]",
          )}
        >
          <CardHeader className="flex-row items-center justify-between pb-3 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
              className="h-10 w-10 rounded-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <CardTitle className="text-xl font-serif">
              {view === "month"
                ? format(currentMonth, "MMMM yyyy")
                : `${format(rangeStart, "d MMM")} – ${format(rangeEnd, "d MMM yyyy")}`}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(1)}
              aria-label="Next period"
              className="h-10 w-10 rounded-xl"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col overflow-hidden min-h-0 rounded-b-3xl">
            {view === "month" && (
              <div className="grid grid-cols-7 border-b border-border shrink-0">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-semibold text-muted-foreground py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}
            {view === "month" ? (
              <div
                className="grid grid-cols-7 flex-1 min-h-0"
                style={{ gridAutoRows: "1fr" }}
              >
                {Array.from({ length: days[0].getDay() }).map((_, i) => (
                  <div
                    key={`pad-${i}`}
                    className="border-r border-b border-border last:border-r-0"
                  />
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
                      aria-label={`${format(day, "EEEE d MMMM yyyy")}, ${dayEvents.length} events`}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col items-stretch text-left p-1.5 transition-colors border-b border-border touch-manipulation overflow-hidden",
                        !isLastCol && "border-r",
                        selected
                          ? "bg-primary/5 ring-inset ring-2 ring-primary"
                          : "hover:bg-muted/40",
                        !isSameMonth(day, currentMonth) && "opacity-35",
                      )}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 text-xs font-semibold flex items-center justify-center rounded-full self-end mb-0.5 shrink-0",
                          todayDay
                            ? "bg-primary text-primary-foreground"
                            : selected
                              ? "text-primary"
                              : "text-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </div>
                      {dayEvents.slice(0, 5).map((ev) => {
                        const cat = ev.category ?? "other";
                        return ev.allDay ? (
                          <div
                            key={ev.id}
                            className={cn(
                              "text-[10px] leading-tight px-1.5 py-0.5 rounded mb-0.5 font-medium truncate",
                              "bg-muted text-foreground border-l-[3px]",
                            )}
                            style={{ borderLeftColor: eventAccent(ev) }}
                            title={`${ev.title} — ${
                              membersFor(ev)
                                .map((m) => m.name)
                                .join(", ") || "Unassigned"
                            }`}
                          >
                            {ev.title}
                          </div>
                        ) : (
                          <div
                            key={ev.id}
                            className="text-[10px] leading-tight flex items-center gap-0.5 mb-0.5 min-w-0"
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                              )}
                              style={{ backgroundColor: eventAccent(ev) }}
                            />
                            <span className="truncate text-foreground/80">
                              {ev.startTime
                                ? formatEventTime(ev.startTime) + " "
                                : ""}
                              {ev.title}
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 5 && (
                        <div className="text-[9px] text-muted-foreground px-1 mt-auto">
                          +{dayEvents.length - 5} more
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className={cn(
                  "p-3 gap-3 overflow-y-auto",
                  view === "week"
                    ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7"
                    : "space-y-4",
                )}
              >
                {days.map((day) => {
                  const entries =
                    dayEventsMap.get(format(day, "yyyy-MM-dd")) ?? [];
                  return (
                    <section
                      key={format(day, "yyyy-MM-dd")}
                      className="min-w-0 rounded-xl border p-3"
                    >
                      <button
                        className="text-left font-semibold mb-3"
                        onClick={() => setSelectedDay(day)}
                      >
                        {format(day, "EEE d MMM")}
                        {isToday(day) && (
                          <span className="ml-2 text-primary text-xs">
                            Today
                          </span>
                        )}
                      </button>
                      {entries.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No events
                        </p>
                      )}
                      <div className="space-y-2">
                        {entries.map((event) => (
                          <button
                            key={event.id}
                            onClick={() => {
                              setSelectedDay(day);
                              openEdit(event);
                            }}
                            className="block w-full text-left rounded-lg bg-muted/50 p-3 border-l-4"
                            style={{ borderLeftColor: eventAccent(event) }}
                          >
                            <p className="text-xs text-muted-foreground">
                              {event.allDay
                                ? "All day"
                                : `${event.startTime ? formatEventTime(event.startTime) : ""}${event.endTime ? ` – ${formatEventTime(event.endTime)}` : ""}`}
                            </p>
                            <p className="font-medium break-words">
                              {event.title}
                            </p>
                            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-xs">
                              {membersFor(event).length ? (
                                membersFor(event).map((member) => (
                                  <span
                                    key={member.id}
                                    className="inline-flex items-center gap-1"
                                  >
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: member.color }}
                                    />
                                    {member.name}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted-foreground">
                                  Unassigned
                                </span>
                              )}
                            </div>
                            {event.location && (
                              <p className="text-xs text-muted-foreground mt-1 break-words">
                                {event.location}
                              </p>
                            )}
                            <span className="text-xs text-muted-foreground capitalize">
                              {event.category}
                            </span>
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => openCreate(day)}
                        aria-label={`Add event on ${format(day, "d MMMM")}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </section>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Day panel ───────────────────────────────────────────────────── */}
        <Card className="rounded-3xl border-0 shadow-sm flex flex-col overflow-visible lg:overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-xl font-serif">
              {format(selectedDay, "EEEE, MMM d")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {selectedDayEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No events this day
              </p>
            ) : (
              selectedDayEvents.map((e) => {
                const assignedMemberObjects = (e.assignedMembers ?? [])
                  .map((id) => memberById[id])
                  .filter(Boolean) as FamilyMember[];
                return (
                  <div
                    key={e.id}
                    className="bg-muted rounded-2xl p-4 flex gap-3 border-l-4"
                    style={{ borderLeftColor: eventAccent(e) }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">
                          {e.title}
                        </span>
                        {e.googleEventId && (
                          <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                            GCal
                          </span>
                        )}
                        {e.recurrence && (
                          <span className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                            {RECURRENCE_LABELS[e.recurrence as string] ??
                              e.recurrence}
                          </span>
                        )}
                      </div>
                      {e.startTime && (
                        <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                          <Clock className="w-3 h-3" />
                          {formatEventTime(e.startTime)}
                          {e.endTime ? ` – ${formatEventTime(e.endTime)}` : ""}
                        </div>
                      )}
                      {e.location && (
                        <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-1">{e.location}</span>
                        </div>
                      )}
                      {e.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {e.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge
                          className={cn(
                            "text-xs",
                            CATEGORY_COLORS[e.category ?? "other"],
                          )}
                          variant="outline"
                        >
                          {e.category}
                        </Badge>
                        {/* Assigned member avatars */}
                        {assignedMemberObjects.length > 0 && (
                          <div className="flex -space-x-1">
                            {assignedMemberObjects.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 px-1"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: m.color }}
                                />
                                <MemberAvatar member={m} size="xs" />
                                <span className="text-xs">{m.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {!assignedMemberObjects.length && (
                          <span className="text-xs text-muted-foreground">
                            Unassigned
                          </span>
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
                        onClick={() => {
                          if (e.recurrence) {
                            setDeleteDialog({ event: e, day: selectedDay });
                          } else {
                            deleteEvent.mutate({ id: e.id });
                          }
                        }}
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
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5",
                    sync.isPending && "animate-spin",
                  )}
                />
                {sync.isPending ? "Syncing…" : "Sync Google Calendar"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
