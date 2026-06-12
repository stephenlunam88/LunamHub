import { useGetDashboardSummary } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
            <ul className="space-y-3">
              {sortedChildren.map((m, i) => (
                <li key={m.id} className="bg-background rounded-xl p-4 shadow-sm flex items-center gap-4">
                  <div className="text-2xl font-bold text-muted-foreground w-6 text-center">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </div>
                  <div className="text-3xl" style={{ textShadow: `0 0 10px ${m.color}40` }}>{m.emoji}</div>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.pointsBalance} pts available</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-amber-600">{m.lifetimePoints ?? 0}</div>
                    <div className="text-xs text-muted-foreground">all-time</div>
                  </div>
                </li>
              ))}
              {summary.familyMembers.filter(m => m.role === "parent").map(m => (
                <li key={m.id} className="bg-background rounded-xl p-4 shadow-sm flex items-center gap-4 opacity-70">
                  <div className="text-3xl">{m.emoji}</div>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{m.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{m.role}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
