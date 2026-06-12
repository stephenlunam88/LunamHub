import { useGetDashboardSummary, useGetFamilyMemberBadges } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";

function AvatarOrEmoji({ avatarUrl, emoji, sizeCls = "w-12 h-12 text-4xl" }: { avatarUrl?: string | null; emoji: string; sizeCls?: string }) {
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
  return <span className={sizeCls.split(" ").find(c => c.startsWith("text-")) ?? "text-4xl"}>{emoji}</span>;
}

function ChildBadgeIcons({ memberId }: { memberId: number }) {
  const { data: badges = [] } = useGetFamilyMemberBadges(memberId, {
    query: { queryKey: ["badges", memberId] }
  });
  const latest = badges.slice(-4);
  if (latest.length === 0) return null;
  return (
    <span className="ml-1 text-base" title={latest.map(b => b.title).join(", ")}>
      {latest.map(b => b.emoji).join("")}
    </span>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
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
  const sortedChildren = [...children].sort((a, b) => (b.lifetimePoints ?? 0) - (a.lifetimePoints ?? 0));
  const weeklyLeaderboard = summary.weeklyLeaderboard;
  const rankMedal = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

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
                    {e.startTime && <div className="text-muted-foreground">{e.startTime}</div>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm border-0 bg-secondary/20">
          <CardHeader>
            <CardTitle className="text-xl">Chores</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.todayChores.length === 0 ? (
              <p className="text-muted-foreground">No chores due today.</p>
            ) : (
              <ul className="space-y-3">
                {summary.todayChores.map(c => (
                  <li key={c.id} className="bg-background rounded-xl p-4 shadow-sm flex justify-between items-center">
                    <span className="font-medium">{c.title}</span>
                    <span className="bg-secondary/30 text-secondary-foreground px-3 py-1 rounded-full text-sm font-bold">
                      {c.pointsValue} pts
                    </span>
                  </li>
                ))}
              </ul>
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
          <CardContent className="space-y-3">
            {sortedChildren.map((m, i) => {
              const weekly = weeklyLeaderboard.find(w => w.memberId === m.id);
              return (
                <div key={m.id} className="bg-background rounded-2xl p-4 flex items-center gap-4">
                  <div className="text-2xl w-8 text-center font-bold shrink-0">{rankMedal(i)}</div>
                  <div className="shrink-0">
                    <AvatarOrEmoji avatarUrl={m.avatarUrl} emoji={m.emoji} sizeCls="w-12 h-12 text-4xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-lg flex items-center">
                      {m.name}
                      <ChildBadgeIcons memberId={m.id} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center shrink-0">
                    <div>
                      <div className="text-lg font-bold">{m.pointsBalance}</div>
                      <div className="text-xs text-muted-foreground">Store Balance</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-600">{m.lifetimePoints ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Achievement</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-600">+{weekly?.weeklyPoints ?? 0}</div>
                      <div className="text-xs text-muted-foreground">This Week</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
