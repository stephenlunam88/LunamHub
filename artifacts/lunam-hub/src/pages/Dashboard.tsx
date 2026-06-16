import {
  useGetDashboardSummary,
  useGetFamilyMemberBadges,
  useGetLeaderboard,
  useGetWeeklyLeaderboard,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, CheckCircle2, Clock, Star, Flame, X, ChevronRight } from "lucide-react";
import type { Chore, FamilyMember } from "@workspace/api-client-react";

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${mStr}${period}`;
}

function AvatarOrEmoji({
  avatarUrl,
  emoji,
  sizeCls = "w-12 h-12 text-4xl",
}: {
  avatarUrl?: string | null;
  emoji: string;
  sizeCls?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeCls} rounded-full object-cover border-2 border-muted`}
        onError={() => setFailed(true)}
      />
    );
  }
  const textSizeCls = sizeCls.split(" ").find(c => c.startsWith("text-")) ?? "text-4xl";
  return <span className={textSizeCls}>{emoji}</span>;
}

function ChildBadgeIcons({ memberId }: { memberId: number }) {
  const { data: badges = [] } = useGetFamilyMemberBadges(memberId);
  const latest = badges.slice(-3);
  if (latest.length === 0) return null;
  return (
    <span className="ml-1 text-sm" title={latest.map(b => b.title).join(", ")}>
      {latest.map(b => b.emoji).join("")}
    </span>
  );
}

const rankMedal = (i: number) =>
  i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

function ChoreStatusPill({ count, label, colorCls }: { count: number; label: string; colorCls: string }) {
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

function ChildChip({ member, todoCount, approvalCount, isSelected, onClick }: ChildChipProps) {
  const total = todoCount + approvalCount;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-2xl border-2 transition-all touch-manipulation min-h-[56px] text-left ${
        isSelected
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
      }`}
    >
      <AvatarOrEmoji avatarUrl={member.avatarUrl} emoji={member.emoji} sizeCls="w-9 h-9 text-2xl" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{member.name}</div>
        {total === 0 ? (
          <div className="text-xs text-accent font-semibold">All done! ✓</div>
        ) : (
          <div className="flex gap-1 flex-wrap mt-0.5">
            {todoCount > 0 && (
              <ChoreStatusPill count={todoCount} label="to do" colorCls="bg-amber-100 text-amber-800" />
            )}
            {approvalCount > 0 && (
              <ChoreStatusPill count={approvalCount} label="waiting" colorCls="bg-blue-100 text-blue-800" />
            )}
          </div>
        )}
      </div>
      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? "rotate-90 text-primary" : "text-muted-foreground"}`} />
    </button>
  );
}

function ChoresWidget({ chores, children }: { chores: Chore[]; children: FamilyMember[] }) {
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const choresByChild = (memberId: number) =>
    chores.filter(c => c.assignedMember?.id === memberId);

  const todoForChild = (memberId: number) =>
    choresByChild(memberId).filter(c => c.status === "todo");

  const approvalForChild = (memberId: number) =>
    choresByChild(memberId).filter(c => c.status === "pending_approval");

  const doneForChild = (memberId: number) =>
    choresByChild(memberId).filter(c => c.status === "done");

  const selectedChild = selectedChildId !== null ? children.find(c => c.id === selectedChildId) ?? null : null;
  const selectedTodo = selectedChildId !== null ? todoForChild(selectedChildId) : [];
  const selectedApproval = selectedChildId !== null ? approvalForChild(selectedChildId) : [];
  const selectedDone = selectedChildId !== null ? doneForChild(selectedChildId) : [];
  const selectedChores = [...selectedTodo, ...selectedApproval, ...selectedDone];

  return (
    <Card className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden" style={{ backgroundColor: "hsl(210 80% 52% / 0.07)" }}>
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
          <p className="text-muted-foreground text-sm py-4">No chores due today 🎉</p>
        ) : selectedChild ? (
          /* ── Child detail view ── */
          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50 shrink-0">
              <AvatarOrEmoji avatarUrl={selectedChild.avatarUrl} emoji={selectedChild.emoji} sizeCls="w-8 h-8 text-2xl" />
              <span className="font-bold">{selectedChild.name}</span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
              {selectedChores.length === 0 ? (
                <p className="text-muted-foreground text-sm py-2">No chores today 🎉</p>
              ) : (
                <>
                  {selectedTodo.map(c => (
                    <div key={c.id} className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="flex-1 text-sm font-medium truncate">{c.title}</span>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">{c.pointsValue} pts</span>
                    </div>
                  ))}
                  {selectedApproval.map(c => (
                    <div key={c.id} className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                      <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="flex-1 text-sm font-medium truncate">{c.title}</span>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">waiting</span>
                    </div>
                  ))}
                  {selectedDone.map(c => (
                    <div key={c.id} className="bg-card/60 rounded-xl px-3 py-2.5 flex items-center gap-2 opacity-60">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="flex-1 text-sm truncate line-through">{c.title}</span>
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">{c.pointsValue} pts</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          /* ── All-children summary chips ── */
          <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
            {children.map(child => (
              <ChildChip
                key={child.id}
                member={child}
                todoCount={todoForChild(child.id).length}
                approvalCount={approvalForChild(child.id).length}
                isSelected={selectedChildId === child.id}
                onClick={() => setSelectedChildId(child.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: allTimeBoard = [] } = useGetLeaderboard();
  const { data: weeklyBoard = [] } = useGetWeeklyLeaderboard();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-72px)] p-5 grid grid-cols-3 gap-4">
        <Skeleton className="rounded-3xl col-span-1" />
        <Skeleton className="rounded-3xl col-span-1" />
        <Skeleton className="rounded-3xl col-span-1" />
      </div>
    );
  }

  if (!summary) return <div className="p-8">Failed to load dashboard</div>;

  const children = summary.familyMembers.filter(m => m.role === "child");
  const memberById = Object.fromEntries(summary.familyMembers.map(m => [m.id, m]));

  const allChores = summary.todayChores;
  const todoChores = allChores.filter(c => c.status === "todo");
  const approvalChores = allChores.filter(c => c.status === "pending_approval");
  const doneChores = allChores.filter(c => c.status === "done");

  return (
    <div className="h-[calc(100vh-72px)] p-4 grid grid-cols-3 grid-rows-[auto_1fr] gap-4 animate-in fade-in duration-300">

      {/* ── Top bar: clock + date ── */}
      <header className="col-span-3 flex items-end justify-between px-1">
        <div>
          <div className="text-5xl font-serif font-bold tabular-nums leading-none">
            {format(now, "h:mm")}
            <span className="text-3xl text-muted-foreground ml-1">{format(now, "a")}</span>
          </div>
          <div className="text-lg text-muted-foreground font-semibold mt-1">
            {format(now, "EEEE, MMMM do")}
          </div>
        </div>

        {/* Streak mini-bar */}
        {summary.streaks.length > 0 && (
          <div className="flex items-center gap-2">
            {summary.streaks.slice(0, 4).map(({ memberId, currentStreak }) => {
              const member = children.find(m => m.id === memberId);
              if (!member || currentStreak === 0) return null;
              return (
                <div key={memberId} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-2xl px-3 py-1.5">
                  <AvatarOrEmoji avatarUrl={member.avatarUrl} emoji={member.emoji} sizeCls="w-6 h-6 text-base" />
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-bold text-orange-600">{currentStreak}</span>
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* ── Col 1: Events ── */}
      <Card className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden row-start-2" style={{ backgroundColor: "hsl(210 80% 52% / 0.07)" }}>
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-base font-bold">Today's Events</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0 space-y-2 pr-2">
          {summary.todayEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Nothing on today 🌤️</p>
          ) : (
            summary.todayEvents.map(e => (
              <div key={e.id} className="bg-card rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  {(e.assignedMembers ?? []).length > 0 && (
                    <div className="flex -space-x-1.5 shrink-0 mt-0.5">
                      {(e.assignedMembers ?? []).slice(0, 3).map(id => {
                        const m = memberById[id];
                        if (!m) return null;
                        return (
                          <div key={id} title={m.name} className="w-6 h-6 rounded-full ring-2 ring-background overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: m.color }}>
                            {m.avatarUrl
                              ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
                              : m.emoji}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{e.title}</div>
                    {e.startTime && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fmt12(e.startTime)}{e.endTime ? ` – ${fmt12(e.endTime)}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Col 2: Chores widget ── */}
      <div className="row-start-2 flex flex-col min-h-0">
        {children.length > 0 ? (
          <ChoresWidget chores={allChores} children={children} />
        ) : (
          <Card className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden flex-1" style={{ backgroundColor: "hsl(210 80% 52% / 0.07)" }}>
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-base font-bold">Today's Chores</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0 space-y-2">
              {allChores.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">No chores due today 🎉</p>
              ) : (
                <>
                  {todoChores.map(c => (
                    <div key={c.id} className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {c.assignedMember && <div className="text-xs font-semibold text-primary">{c.assignedMember.name}</div>}
                        <div className="text-sm font-medium truncate">{c.title}</div>
                      </div>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">{c.pointsValue} pts</span>
                    </div>
                  ))}
                  {approvalChores.map(c => (
                    <div key={c.id} className="bg-card rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
                      <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {c.assignedMember && <div className="text-xs font-semibold text-primary">{c.assignedMember.name}</div>}
                        <div className="text-sm font-medium truncate">{c.title}</div>
                      </div>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">waiting</span>
                    </div>
                  ))}
                  {doneChores.map(c => (
                    <div key={c.id} className="bg-card/60 rounded-xl px-3 py-2.5 flex items-center gap-2 opacity-60">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate line-through">{c.title}</div>
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
      {children.length > 0 && (
        <Card className="rounded-3xl shadow-sm border-0 flex flex-col overflow-hidden row-start-2" style={{ backgroundColor: "hsl(152 60% 45% / 0.07)" }}>
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base font-bold flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" /> Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0 space-y-2 pr-2">
            {allTimeBoard.map((entry, i) => {
              const member = summary.familyMembers.find(m => m.id === entry.memberId);
              const weekly = weeklyBoard.find(w => w.memberId === entry.memberId);
              return (
                <div key={entry.memberId} className="bg-card rounded-xl p-3 shadow-sm flex items-center gap-3">
                  <div className="text-xl w-7 text-center font-bold shrink-0">{rankMedal(i)}</div>
                  <AvatarOrEmoji avatarUrl={entry.avatarUrl} emoji={entry.emoji} sizeCls="w-10 h-10 text-3xl" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center truncate">
                      {entry.name}
                      {member && <ChildBadgeIcons memberId={member.id} />}
                    </div>
                    <div className="text-xs text-green-600 font-semibold">+{weekly?.weeklyPoints ?? 0} this week</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{entry.pointsBalance}</div>
                    <div className="text-xs text-muted-foreground">pts</div>
                  </div>
                </div>
              );
            })}
            {allTimeBoard.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">No children added yet.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
