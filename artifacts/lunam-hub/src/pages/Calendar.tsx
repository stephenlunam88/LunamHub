import { useEffect, useState } from "react";
import {
  useListEvents, useCreateEvent, useDeleteEvent, useSyncGoogleCalendar, useGetGoogleCalendarStatus,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventInput } from "@workspace/api-client-react";

const CATEGORY_COLORS: Record<string, string> = {
  school: "bg-blue-100 text-blue-800",
  sport: "bg-green-100 text-green-800",
  appointment: "bg-red-100 text-red-800",
  birthday: "bg-yellow-100 text-yellow-800",
  family: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-800",
};

export default function Calendar() {
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EventInput>({
    title: "", date: format(new Date(), "yyyy-MM-dd"), allDay: true, category: "other",
  });

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

  // Auto-sync Google Calendar when month changes (if connected)
  useEffect(() => {
    if (isConnected) {
      sync.mutate({ data: { startDate, endDate } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isConnected]);

  const createEvent = useCreateEvent({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setForm({ title: "", date: format(selectedDay, "yyyy-MM-dd"), allDay: true, category: "other" });
        // Sync Google Calendar after creating an event (pushes local → Google and pulls latest)
        if (isConnected) {
          sync.mutate({ data: { startDate, endDate } });
        } else {
          qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
        }
      }
    }
  });
  const deleteEvent = useDeleteEvent({
    mutation: {
      onSettled: () => {
        // Sync Google Calendar after deleting an event (best-effort delete on Google side + refresh)
        if (isConnected) {
          sync.mutate({ data: { startDate, endDate } });
        } else {
          qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
        }
      }
    }
  });

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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-6 rounded-2xl text-lg gap-2">
              <Plus className="w-5 h-5" /> Add Event
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>New Event</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl h-12" /></div>
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="rounded-xl h-12" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="time" value={form.startTime ?? ""} onChange={e => setForm(f => ({ ...f, startTime: e.target.value, allDay: false }))} className="rounded-xl h-12" /></div>
                <div><Label>End</Label><Input type="time" value={form.endTime ?? ""} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="rounded-xl h-12" /></div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as EventInput["category"] }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["school","sport","appointment","birthday","family","other"].map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full h-12 rounded-xl" onClick={() => createEvent.mutate({ data: form })} disabled={!form.title || createEvent.isPending}>
                {createEvent.isPending ? "Adding…" : "Add Event"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
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
                  <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-2xl text-lg font-medium transition-colors relative touch-manipulation",
                      selected ? "bg-primary text-primary-foreground" : todayDay ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted",
                      !isSameMonth(day, currentMonth) && "opacity-30"
                    )}>
                    {format(day, "d")}
                    {hasEvents && <span className={cn("absolute bottom-1 w-1.5 h-1.5 rounded-full", selected ? "bg-primary-foreground" : "bg-primary")} />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

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
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{e.title}</span>
                      {e.googleEventId && (
                        <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">GCal</span>
                      )}
                    </div>
                    {e.startTime && (
                      <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                        <Clock className="w-3 h-3" />{e.startTime}{e.endTime ? ` – ${e.endTime}` : ""}
                      </div>
                    )}
                    <Badge className={cn("mt-2 text-xs", CATEGORY_COLORS[e.category ?? "other"])} variant="outline">
                      {e.category}
                    </Badge>
                  </div>
                  <button onClick={() => deleteEvent.mutate({ id: e.id })} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
            <Button variant="outline" className="w-full rounded-xl h-12"
              onClick={() => { setForm(f => ({ ...f, date: format(selectedDay, "yyyy-MM-dd") })); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Add to this day
            </Button>
            {isConnected && (
              <Button variant="ghost" className="w-full rounded-xl h-10 text-muted-foreground text-sm gap-1.5"
                onClick={() => sync.mutate({ data: { startDate, endDate } })}
                disabled={sync.isPending}>
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
