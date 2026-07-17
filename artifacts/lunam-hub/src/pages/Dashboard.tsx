import {
  useGetDashboardSummary,
  useGetFamilyMemberBadges,
  useGetLeaderboard,
  useGetWeeklyLeaderboard,
} from "@workspace/api-client-react";
import { format, addDays, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberAvatar } from "@/components/MemberAvatar";
import { WeatherWidget } from "@/components/WeatherWidget";
import {
  Trophy,
  CheckCircle2,
  Clock,
  Star,
  Flame,
  X,
  ChevronRight,
  CalendarClock,
  Dice5,
  CheckSquare,
  List,
} from "lucide-react";
import type { Chore, FamilyMember, Event } from "@workspace/api-client-react";

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${mStr}${period}`;
}

function ChildBadgeIcons({ memberId }: { memberId: number }) {
  const { data: badges = [] } = useGetFamilyMemberBadges(memberId);
  const latest = badges.slice(-3);
  if (latest.length === 0) return null;
  return (
    <span
      className="ml-1 text-sm"
      title={latest.map((b) => b.title).join(", ")}
    >
      {latest.map((b) => b.emoji).join("")}
    </span>
  );
}

const rankMedal = (i: number) =>
  i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

type GamesLeader = {
  key: string;
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  totalPoints: number;
  gamesPlayed: number;
};

function GamesLeaderboardWidget() {
  const { data } = useQuery({
    queryKey: ["games-night", "dashboard", "overall", "all"],
    queryFn: async () => {
      const response = await fetch("/api/games-night/dashboard", {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error("Could not load Games Night leaderboard");
      return response.json() as Promise<{ leaderboard: GamesLeader[] }>;
    },
  });
  const leaders = data?.leaderboard.slice(0, 5) ?? [];
  return (
    <Card
      className="min-h-0 flex-1 overflow-hidden rounded-3xl border-0 shadow-sm"
      style={{ backgroundColor: "hsl(270 65% 55% / 0.07)" }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-base font-bold">
            <Dice5 className="h-4 w-4 text-violet-500" /> Games Night
          </CardTitle>
          <Link href="/games" className="text-xs font-bold text-primary">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 overflow-y-auto pt-0">
        {leaders.length ? (
          leaders.map((leader, index) => (
            <div
              key={leader.key}
              className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 shadow-sm"
            >
              <span className="w-6 text-center font-bold">
                {rankMedal(index)}
              </span>
              <MemberAvatar
                name={leader.avatarEmoji || leader.name}
                avatarUrl={leader.avatarUrl}
                className="h-8 w-8"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {leader.name}
              </span>
              <span className="text-right">
                <b className="text-primary">{leader.totalPoints}</b>
                <small className="ml-1 text-muted-foreground">pts</small>
              </span>
            </div>
          ))
        ) : (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Record a game to start the leaderboard.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChoreStatusPill({
  count,
  label,
  colorCls,
}: {
  count: number;
  label: string;
  colorCls: string;
}) {
  if (count === 0) return null;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colorCls}`}>
      {count} {label}
    </span>
  );
}

interface ChildChipProps {
  member: FamilyMember;
  todoCount: number;
  approvalCount: number;
  isSelected: boolean;
  onClick: () => void;
}

function ChildChip({
  member,
  todoCount,
  approvalCount,
  isSelected,
  onClick,
}: ChildChipProps) {
  const total = todoCount + approvalCount;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-2xl border-2 transition-all touch-manipulation min-h-[56px] text-left w-full ${
        isSelected
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
      }`}
    >
      <MemberAvatar
        name={member.name}
        avatarUrl={member.avatarUrl}
        className="h-9 w-9"
      />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{member.name}</div>
        {total === 0 ? (
          <div className="text-xs text-accent font-semibold">All done! ✓</div>
        ) : (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {todoCount > 0 && (
              <ChoreStatusPill
                count={todoCount}
                label="to do"
                colorCls="bg-amber-100 text-amber-800"
              />
            )}
            {approvalCount > 0 && (
              <ChoreStatusPill
                count={approvalCount}
                label="waiting"
                colorCls="bg-blue-100 text-blue-800"
              />
            )}
          </div>
        )}
      </div>
      <ChevronRight
        className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? "rotate-90 text-primary" : "text-muted-foreground"}`}
      />
    </button>
  );
}

function ChoresWidget({
  chores,
  children,
}: {
  chores: Chore[];
  children: FamilyMember[];
}) {
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const todoForChild = (memberId: number) =>
    chores.filter(
      (c) => c.assignedMember?.id === memberId && c.status === "todo",
    );

  const approvalForChild = (memberId: number) =>
    chores.filter(
      (c) =>
        c.assignedMember?.id === memberId && c.status === "pending_approval",
    );

  const doneForChild = (memberId: number) =>
    chores.filter(
      (c) => c.assignedMember?.id === memberId && c.status === "done",
    );

  const selectedChild =
    selectedChildId !== null
      ? (children.find((c) => c.id === selectedChildId) ?? null)
      : null;
  const selectedTodo =
    selectedChildId !== null ? todoForChild(selectedChildId) : [];
  const selectedApproval =
    selectedChildId !== null ? approvalForChild(selectedChildId) : [];
  const selectedDone =
    selectedChildId !== null ? doneForChild(selectedChildId) : [];

  return (
    <Card
      className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden h-full"
      style={{ backgroundColor: "hsl(210 80% 52% / 0.07)" }}
    >
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold">Today's Chores</CardTitle>
          {selectedChild && (
            <button
              onClick={() => setSelectedChildId(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors touch-manipulation px-2 py-1 rounded-xl hover:bg-muted"
            >
              <X className="w-3.5 h-3.5" /> All
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col min-h-0 pt-0">
        {chores.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            No chores due today 🎉
          </p>
        ) : selectedChild ? (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50 shrink-0">
              <MemberAvatar
                name={selectedChild.name}
                avatarUrl={selectedChild.avatarUrl}
                className="h-8 w-8"
              />
              <span className="font-bold">{selectedChild.name}</span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
              {selectedTodo.length === 0 &&
              selectedApproval.length === 0 &&
              selectedDone.length === 0 ? (
                <p className="text-muted-foreground text-sm py-2">
                  No chores today 🎉
                </p>
              ) : (
                <>
                  {selectedTodo.map((c) => (
                    <div
                      key={c.id}
                      className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="flex-1 text-sm font-medium truncate">
                        {c.title}
                      </span>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                        {c.pointsValue} pts
                      </span>
                    </div>
                  ))}
                  {selectedApproval.map((c) => (
                    <div
                      key={c.id}
                      className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm"
                    >
                      <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="flex-1 text-sm font-medium truncate">
                        {c.title}
                      </span>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">
                        waiting
                      </span>
                    </div>
                  ))}
                  {selectedDone.map((c) => (
                    <div
                      key={c.id}
                      className="bg-card/60 rounded-xl px-3 py-2.5 flex items-center gap-2 opacity-60"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="flex-1 text-sm truncate line-through">
                        {c.title}
                      </span>
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">
                        {c.pointsValue} pts
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
            {children.map((child) => (
              <ChildChip
                key={child.id}
                member={child}
                todoCount={todoForChild(child.id).length}
                approvalCount={approvalForChild(child.id).length}
                isSelected={selectedChildId === child.id}
                onClick={() =>
                  setSelectedChildId((prev) =>
                    prev === child.id ? null : child.id,
                  )
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NextEventPreview({
  todayEvents,
  upcomingEvents,
  now,
}: {
  todayEvents: Event[];
  upcomingEvents: Event[];
  now: Date;
}) {
  const nowStr = format(now, "HH:mm");
  const nextToday = todayEvents.find(
    (e) => e.startTime && e.startTime > nowStr,
  );
  const next = nextToday ?? upcomingEvents[0] ?? null;
  if (!next) return null;

  const isToday = !!nextToday;
  const label =
    isToday && next.startTime
      ? fmt12(next.startTime)
      : format(parseISO(next.date + "T00:00:00"), "EEE d MMM");

  return (
    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-2xl px-3 py-2 shrink-0">
      <CalendarClock className="w-4 h-4 text-primary shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-primary font-semibold truncate">
          {isToday ? "Next up" : "Coming up"}
        </div>
        <div className="text-xs font-bold truncate">{next.title}</div>
      </div>
      <div className="text-xs font-semibold text-primary shrink-0 ml-1">
        {label}
      </div>
    </div>
  );
}

/** Render a single event row in the events card */
function EventRow({
  e,
  memberById,
}: {
  e: Event;
  memberById: Record<number, FamilyMember>;
}) {
  return (
    <div className="bg-card rounded-xl p-3 shadow-sm">
      <div className="flex items-start gap-2">
        {(e.assignedMembers ?? []).length > 0 && (
          <div className="flex -space-x-1.5 shrink-0 mt-0.5">
            {(e.assignedMembers ?? []).slice(0, 3).map((id) => {
              const m = memberById[id];
              if (!m) return null;
              return (
                <div
                  key={id}
                  title={m.name}
                  className="w-6 h-6 rounded-full ring-2 ring-background overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: m.color }}
                >
                  <MemberAvatar
                    name={m.name}
                    avatarUrl={m.avatarUrl}
                    className="h-full w-full border-0"
                  />
                </div>
              );
            })}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{e.title}</div>
          {e.startTime && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmt12(e.startTime)}
              {e.endTime ? ` – ${fmt12(e.endTime)}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const localDate = Intl.DateTimeFormat("en-CA").format(new Date()); // YYYY-MM-DD in browser local time
  const { data: summary, isLoading } = useGetDashboardSummary({
    date: localDate,
  });
  const { data: allTimeBoard = [] } = useGetLeaderboard();
  const { data: weeklyBoard = [] } = useGetWeeklyLeaderboard();
  const [now, setNow] = useState(new Date());
  const [leaderboardView, setLeaderboardView] = useState<"alltime" | "weekly">(
    "alltime",
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="h-full p-5 grid grid-cols-3 gap-4">
        <Skeleton className="rounded-3xl col-span-1" />
        <Skeleton className="rounded-3xl col-span-1" />
        <Skeleton className="rounded-3xl col-span-1" />
      </div>
    );
  }

  if (!summary) return <div className="p-8">Failed to load dashboard</div>;

  const children = summary.familyMembers.filter((m) => m.role === "child");
  const memberById = Object.fromEntries(
    summary.familyMembers.map((m) => [m.id, m]),
  );

  const allChores = summary.todayChores;
  const todoChores = allChores.filter((c) => c.status === "todo");
  const approvalChores = allChores.filter(
    (c) => c.status === "pending_approval",
  );
  const doneChores = allChores.filter((c) => c.status === "done");

  // Tomorrow's events — filter from upcomingEvents by date
  const tomorrowStr = format(addDays(now, 1), "yyyy-MM-dd");
  const tomorrowEvents = summary.upcomingEvents.filter(
    (e) => e.date === tomorrowStr,
  );

  return (
    <>
      <div className="space-y-4 p-4 pb-24 md:hidden">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            {format(now, "EEEE, MMMM do")}
          </p>
          <h1 className="font-serif text-3xl font-bold">
            Good{" "}
            {now.getHours() < 12
              ? "morning"
              : now.getHours() < 18
                ? "afternoon"
                : "evening"}
          </h1>
        </div>
        {approvalChores.length > 0 && (
          <Link
            href="/chores?quick=approval"
            className="flex items-center gap-3 rounded-3xl bg-amber-100 p-4 text-amber-950 shadow-sm"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <span className="flex-1">
              <b className="block text-lg">
                {approvalChores.length} chore
                {approvalChores.length === 1 ? "" : "s"} awaiting approval
              </b>
              <small>Review and award points</small>
            </span>
            <ChevronRight className="h-5 w-5" />
          </Link>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/chores?quick=add" className="rounded-3xl bg-blue-50 p-4">
            <CheckSquare className="h-6 w-6 text-blue-600" />
            <b className="mt-3 block">Add chore</b>
            <small className="text-muted-foreground">Assign a task</small>
          </Link>
          <Link
            href="/games?quick=record"
            className="rounded-3xl bg-violet-50 p-4"
          >
            <Dice5 className="h-6 w-6 text-violet-600" />
            <b className="mt-3 block">Record game</b>
            <small className="text-muted-foreground">Quick result entry</small>
          </Link>
          <Link
            href="/calendar?quick=add"
            className="rounded-3xl bg-emerald-50 p-4"
          >
            <CalendarClock className="h-6 w-6 text-emerald-600" />
            <b className="mt-3 block">Add event</b>
            <small className="text-muted-foreground">Family calendar</small>
          </Link>
          <Link
            href="/lists?quick=item"
            className="rounded-3xl bg-orange-50 p-4"
          >
            <List className="h-6 w-6 text-orange-600" />
            <b className="mt-3 block">Add list item</b>
            <small className="text-muted-foreground">
              Shopping or reminders
            </small>
          </Link>
        </div>
        <WeatherWidget />
        <Card className="rounded-3xl border-0 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base">Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span>Events</span>
              <b>{summary.todayEvents.length}</b>
            </div>
            <div className="flex justify-between">
              <span>Chores to do</span>
              <b>{todoChores.length}</b>
            </div>
            <div className="flex justify-between">
              <span>Completed</span>
              <b>{doneChores.length}</b>
            </div>
          </CardContent>
        </Card>
        <GamesLeaderboardWidget />
      </div>
      <div className="hidden h-full grid-cols-3 grid-rows-[auto_1fr] gap-4 p-4 animate-in fade-in duration-300 md:grid">
        {/* ── Hero strip: clock + date + next event + streaks ── */}
        <header className="col-span-3 flex items-center justify-between gap-4 px-1">
          <div className="shrink-0">
            <div className="text-5xl font-serif font-bold tabular-nums leading-none">
              {format(now, "h:mm")}
              <span className="text-3xl text-muted-foreground ml-1.5">
                {format(now, "a")}
              </span>
            </div>
            <div className="text-lg text-muted-foreground font-semibold mt-1">
              {format(now, "EEEE, MMMM do")}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
            <NextEventPreview
              todayEvents={summary.todayEvents}
              upcomingEvents={summary.upcomingEvents}
              now={now}
            />

            {/* Streak chips — show all children, dim when streak is 0 */}
            {summary.streaks.slice(0, 5).map(({ memberId, currentStreak }) => {
              const member = children.find((m) => m.id === memberId);
              if (!member) return null;
              const active = currentStreak > 0;
              return (
                <div
                  key={memberId}
                  className={`flex items-center gap-1.5 border rounded-2xl px-3 py-2 shrink-0 transition-colors ${
                    active
                      ? "bg-orange-50 border-orange-200"
                      : "bg-muted/40 border-border"
                  }`}
                >
                  <MemberAvatar
                    name={member.name}
                    avatarUrl={member.avatarUrl}
                    className="h-6 w-6"
                  />
                  <Flame
                    className={`w-4 h-4 ${active ? "text-orange-500" : "text-muted-foreground/50"}`}
                  />
                  <span
                    className={`text-sm font-bold ${active ? "text-orange-600" : "text-muted-foreground/60"}`}
                  >
                    {currentStreak}
                  </span>
                </div>
              );
            })}
          </div>
        </header>

        {/* ── Col 1: Events ── */}
        <div className="row-start-2 flex flex-col gap-4 min-h-0 overflow-hidden">
          <WeatherWidget compact />
          <Card
            className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden flex-1 min-h-0"
            style={{ backgroundColor: "hsl(210 80% 52% / 0.07)" }}
          >
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-base font-bold">
                Today's Events
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0 space-y-2 pr-2">
              {summary.todayEvents.length === 0 &&
              tomorrowEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">
                  Nothing on today 🌤️
                </p>
              ) : (
                <>
                  {/* Today */}
                  {summary.todayEvents.length === 0 ? (
                    <p className="text-muted-foreground text-xs py-1 text-center">
                      Nothing today
                    </p>
                  ) : (
                    summary.todayEvents.map((e) => (
                      <EventRow key={e.id} e={e} memberById={memberById} />
                    ))
                  )}

                  {/* Tomorrow section */}
                  {tomorrowEvents.length > 0 && (
                    <>
                      <div className="font-bold text-base pt-1">
                        Tomorrow's Events
                      </div>
                      {tomorrowEvents.slice(0, 5).map((e) => (
                        <EventRow key={e.id} e={e} memberById={memberById} />
                      ))}
                      {tomorrowEvents.length > 5 && (
                        <div className="text-center py-1">
                          <span className="text-xs font-semibold text-muted-foreground bg-muted/70 rounded-full px-3 py-1">
                            +{tomorrowEvents.length - 5} more
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Col 2: Chores widget ── */}
        <div className="row-start-2 flex flex-col min-h-0">
          {children.length > 0 ? (
            <ChoresWidget chores={allChores} children={children} />
          ) : (
            <Card
              className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden h-full"
              style={{ backgroundColor: "hsl(210 80% 52% / 0.07)" }}
            >
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-base font-bold">
                  Today's Chores
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0 space-y-2">
                {allChores.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4">
                    No chores due today 🎉
                  </p>
                ) : (
                  <>
                    {todoChores.map((c) => (
                      <div
                        key={c.id}
                        className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {c.assignedMember && (
                            <div className="text-xs font-semibold text-primary">
                              {c.assignedMember.name}
                            </div>
                          )}
                          <div className="text-sm font-medium truncate">
                            {c.title}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                          {c.pointsValue} pts
                        </span>
                      </div>
                    ))}
                    {approvalChores.map((c) => (
                      <div
                        key={c.id}
                        className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm"
                      >
                        <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          {c.assignedMember && (
                            <div className="text-xs font-semibold text-primary">
                              {c.assignedMember.name}
                            </div>
                          )}
                          <div className="text-sm font-medium truncate">
                            {c.title}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">
                          waiting
                        </span>
                      </div>
                    ))}
                    {doneChores.map((c) => (
                      <div
                        key={c.id}
                        className="bg-card/60 rounded-xl px-3 py-2.5 flex items-center gap-2 opacity-60"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate line-through">
                            {c.title}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Col 3: Leaderboard ── */}
        <div className="row-start-2 flex min-h-0 flex-col gap-4 overflow-hidden">
          {children.length > 0 ? (
            <Card
              className="min-h-0 flex-1 rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden"
              style={{ backgroundColor: "hsl(152 60% 45% / 0.07)" }}
            >
              <CardHeader className="pb-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-bold flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500" /> Leaderboard
                  </CardTitle>
                  {/* Toggle */}
                  <div className="flex rounded-xl overflow-hidden border border-border bg-background text-xs font-semibold shrink-0">
                    <button
                      onClick={() => setLeaderboardView("alltime")}
                      className={`px-3 py-1.5 transition-colors ${leaderboardView === "alltime" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      All Time
                    </button>
                    <button
                      onClick={() => setLeaderboardView("weekly")}
                      className={`px-3 py-1.5 transition-colors ${leaderboardView === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      This Week
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0 space-y-2 pr-2">
                {leaderboardView === "alltime" ? (
                  <>
                    {allTimeBoard.map((entry, i) => {
                      const member = summary.familyMembers.find(
                        (m) => m.id === entry.memberId,
                      );
                      return (
                        <div
                          key={entry.memberId}
                          className="bg-card rounded-xl p-3 shadow-sm flex items-center gap-3"
                        >
                          <div className="text-xl w-7 text-center font-bold shrink-0">
                            {rankMedal(i)}
                          </div>
                          <MemberAvatar
                            name={entry.name}
                            avatarUrl={entry.avatarUrl}
                            className="h-10 w-10"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm flex items-center truncate">
                              {entry.name}
                              {member && (
                                <ChildBadgeIcons memberId={member.id} />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span className="text-primary font-semibold">
                                {entry.pointsBalance} pts
                              </span>
                              <span className="mx-1 text-border">·</span>
                              available
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-base leading-tight">
                              {entry.lifetimePoints}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              score
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {allTimeBoard.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        No children added yet.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {[...weeklyBoard]
                      .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
                      .map((entry, i) => {
                        const member = summary.familyMembers.find(
                          (m) => m.id === entry.memberId,
                        );
                        const allTime = allTimeBoard.find(
                          (a) => a.memberId === entry.memberId,
                        );
                        return (
                          <div
                            key={entry.memberId}
                            className="bg-card rounded-xl p-3 shadow-sm flex items-center gap-3"
                          >
                            <div className="text-xl w-7 text-center font-bold shrink-0">
                              {rankMedal(i)}
                            </div>
                            <MemberAvatar
                              name={entry.name}
                              avatarUrl={entry.avatarUrl}
                              className="h-10 w-10"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm flex items-center truncate">
                                {entry.name}
                                {member && (
                                  <ChildBadgeIcons memberId={member.id} />
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                <span className="text-primary font-semibold">
                                  {allTime?.pointsBalance ?? 0} pts
                                </span>
                                <span className="mx-1 text-border">·</span>
                                available
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-bold text-base leading-tight text-green-600">
                                +{entry.weeklyPoints}
                              </div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                this wk
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {weeklyBoard.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        No data yet.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div />
          )}
          <GamesLeaderboardWidget />
        </div>
      </div>
    </>
  );
}
