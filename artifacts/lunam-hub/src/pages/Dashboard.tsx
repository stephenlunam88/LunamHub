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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, CheckCircle2, Clock, Star } from "lucide-react";
import type { Chore } from "@workspace/api-client-react";

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
  const latest = badges.slice(-4);
  if (latest.length === 0) return null;
  return (
    <span className="ml-1 text-base" title={latest.map(b => b.title).join(", ")}>
      {latest.map(b => b.emoji).join("")}
    </span>
  );
}

function ChoreRow({ chore }: { chore: Chore }) {
  const member = chore.assignedMember;
  return (
    <li className="bg-background rounded-xl p-3 shadow-sm flex items-center gap-3">
      {member && (
        <AvatarOrEmoji
          avatarUrl={member.avatarUrl}
          emoji={member.emoji}
          sizeCls="w-8 h-8 text-2xl"
        />
      )}
      <div className="flex-1 min-w-0">
        {member && <div className="text-xs font-semibold text-primary truncate">{member.name}</div>}
        <div className="font-medium truncate">{chore.title}</div>
      </div>
      <span className="bg-secondary/30 text-secondary-foreground px-3 py-1 rounded-full text-sm font-bold shrink-0">
        {chore.pointsValue} pts
      </span>
    </li>
  );
}

const rankMedal = (i: number) =>
  i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

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
    return <div className="space-y-4"><Skeleton className="h-64 w-full rounded-3xl" /></div>;
  }

  if (!summary) return <div>Failed to load dashboard</div>;

  const children = summary.familyMembers.filter(m => m.role === "child");

  const todoChores = summary.todayChores.filter(c => c.status === "todo");
  const approvalChores = summary.todayChores.filter(c => c.status === "pending_approval");
  const doneChores = summary.todayChores.filter(c => c.status === "done");
  const hasAnyChores = summary.todayChores.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-serif font-bold text-foreground">
            {format(now, "h:mm a")}
          </h1>
          <p className="text-2xl text-muted-foreground mt-2 font-medium">
            {format(now, "EEEE, MMMM do")}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="rounded-3xl shadow-sm border-0 bg-primary/10">
          <CardHeader>
            <CardTitle className="text-xl">Today's Events</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.todayEvents.length === 0 ? (
              <p className="text-muted-foreground">No events today.</p>
            ) : (
              <ul className="space-y-3">
                {summary.todayEvents.map(e => (
                  <li key={e.id} className="bg-background rounded-xl p-4 shadow-sm">
                    <div className="font-semibold text-lg">{e.title}</div>
                    {e.startTime && (
                      <div className="text-muted-foreground">{e.startTime}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm border-0 bg-secondary/20">
          <CardHeader>
            <CardTitle className="text-xl">Today's Chores</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasAnyChores ? (
              <p className="text-muted-foreground">No chores due today.</p>
            ) : (
              <div className="space-y-4">
                {todoChores.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Clock className="w-3.5 h-3.5 text-yellow-600" />
                      <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">
                        To Do ({todoChores.length})
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {todoChores.map(c => <ChoreRow key={c.id} chore={c} />)}
                    </ul>
                  </div>
                )}
                {approvalChores.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Star className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        Needs Approval ({approvalChores.length})
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {approvalChores.map(c => <ChoreRow key={c.id} chore={c} />)}
                    </ul>
                  </div>
                )}
                {doneChores.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                        Done Today ({doneChores.length})
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {doneChores.map(c => <ChoreRow key={c.id} chore={c} />)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {children.length > 0 && (
        <Card className="rounded-3xl shadow-sm border-0 bg-muted/40">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Points Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="alltime">
              <TabsList className="mb-4 rounded-xl bg-background">
                <TabsTrigger value="alltime" className="rounded-lg">All Time</TabsTrigger>
                <TabsTrigger value="weekly" className="rounded-lg">This Week</TabsTrigger>
              </TabsList>

              <TabsContent value="alltime" className="space-y-3">
                {allTimeBoard.map((entry, i) => {
                  const member = summary.familyMembers.find(m => m.id === entry.memberId);
                  const weekly = weeklyBoard.find(w => w.memberId === entry.memberId);
                  return (
                    <div
                      key={entry.memberId}
                      className="bg-background rounded-2xl p-4 flex items-center gap-4"
                    >
                      <div className="text-2xl w-8 text-center font-bold shrink-0">
                        {rankMedal(i)}
                      </div>
                      <div className="shrink-0">
                        <AvatarOrEmoji
                          avatarUrl={entry.avatarUrl}
                          emoji={entry.emoji}
                          sizeCls="w-12 h-12 text-4xl"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg flex items-center">
                          {entry.name}
                          {member && <ChildBadgeIcons memberId={member.id} />}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center shrink-0">
                        <div>
                          <div className="text-lg font-bold">{entry.pointsBalance}</div>
                          <div className="text-xs text-muted-foreground">Store Balance</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-600">
                            {entry.lifetimePoints}
                          </div>
                          <div className="text-xs text-muted-foreground">Achievement</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-600">
                            +{weekly?.weeklyPoints ?? 0}
                          </div>
                          <div className="text-xs text-muted-foreground">This Week</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {allTimeBoard.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No children added yet.</p>
                )}
              </TabsContent>

              <TabsContent value="weekly" className="space-y-3">
                {weeklyBoard.map((entry, i) => {
                  const member = summary.familyMembers.find(m => m.id === entry.memberId);
                  return (
                    <div
                      key={entry.memberId}
                      className="bg-background rounded-2xl p-4 flex items-center gap-4"
                    >
                      <div className="text-2xl w-8 text-center font-bold shrink-0">
                        {rankMedal(i)}
                      </div>
                      <div className="shrink-0">
                        <AvatarOrEmoji
                          avatarUrl={entry.avatarUrl}
                          emoji={entry.emoji}
                          sizeCls="w-12 h-12 text-4xl"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg flex items-center">
                          {entry.name}
                          {member && <ChildBadgeIcons memberId={member.id} />}
                        </div>
                        <div className="text-sm text-muted-foreground">Rank #{entry.rank} this week</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold text-green-600">
                          +{entry.weeklyPoints}
                        </div>
                        <div className="text-xs text-muted-foreground">pts this week</div>
                      </div>
                    </div>
                  );
                })}
                {weeklyBoard.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No children added yet.</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
