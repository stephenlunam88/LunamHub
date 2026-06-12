import { useGetDashboardSummary } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy } from "lucide-react";

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

  type WeeklyEntry = { memberId: number; name: string; emoji: string; weeklyPoints: number };
  const weeklyLeaderboard: WeeklyEntry[] = ((summary as unknown as Record<string, unknown>).weeklyLeaderboard as WeeklyEntry[] | undefined) ?? [];

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

        <Card className="rounded-3xl shadow-sm border-0 bg-muted">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="alltime">
              <TabsList className="w-full rounded-xl mb-4">
                <TabsTrigger value="alltime" className="flex-1 rounded-lg">All-Time</TabsTrigger>
                <TabsTrigger value="weekly" className="flex-1 rounded-lg">This Week</TabsTrigger>
              </TabsList>
              <TabsContent value="alltime">
                <ul className="space-y-3">
                  {sortedChildren.map((m, i) => (
                    <li key={m.id} className="bg-background rounded-xl p-4 shadow-sm flex items-center gap-3">
                      <div className="text-xl w-6 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}</div>
                      <div className="text-3xl">{m.emoji}</div>
                      <div className="flex-1">
                        <div className="font-bold">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.pointsBalance} pts available</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-amber-600">{m.lifetimePoints ?? 0}</div>
                        <div className="text-xs text-muted-foreground">all-time</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="weekly">
                {weeklyLeaderboard.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No points earned this week yet</p>
                ) : (
                  <ul className="space-y-3">
                    {weeklyLeaderboard.map((entry, i) => (
                      <li key={entry.memberId} className="bg-background rounded-xl p-4 shadow-sm flex items-center gap-3">
                        <div className="text-xl w-6 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}</div>
                        <div className="text-3xl">{entry.emoji}</div>
                        <div className="flex-1">
                          <div className="font-bold">{entry.name}</div>
                          <div className="text-xs text-muted-foreground">this week</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-green-600">+{entry.weeklyPoints}</div>
                          <div className="text-xs text-muted-foreground">pts</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
