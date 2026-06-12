import { useEffect, useState } from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { X } from "lucide-react";

const CATEGORY_EMOJI: Record<string, string> = {
  school: "📚", sport: "⚽", appointment: "🏥", birthday: "🎂", family: "🏠", other: "📌"
};

export default function Display() {
  const [, navigate] = useLocation();
  const [now, setNow] = useState(new Date());
  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 60000 }
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const children = summary?.familyMembers.filter(m => m.role === "child") ?? [];
  const todayMeals = summary?.todayMeals ?? [];
  const todayEvents = summary?.todayEvents ?? [];
  const todayChores = summary?.todayChores ?? [];
  const dinners = todayMeals.filter(m => m.mealType === "dinner");

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden relative">
      <button onClick={() => navigate("/")}
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors">
        <X className="w-6 h-6" />
      </button>

      <div className="h-full flex flex-col p-8 gap-6">
        <header className="flex items-end justify-between">
          <div>
            <div className="text-8xl font-bold font-mono tabular-nums tracking-tight">
              {format(now, "h:mm")}
              <span className="text-5xl text-white/60 ml-3">{format(now, "a")}</span>
            </div>
            <div className="text-3xl text-white/70 mt-2 font-light">
              {format(now, "EEEE, MMMM do")}
            </div>
          </div>
          {dinners.length > 0 && (
            <div className="text-right">
              <div className="text-white/50 text-sm uppercase tracking-widest mb-1">Tonight's dinner</div>
              {dinners.map(m => (
                <div key={m.id} className="text-3xl font-semibold">🍽️ {m.meal?.name}</div>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
          <div className="space-y-4 overflow-hidden">
            <h2 className="text-white/50 text-sm uppercase tracking-widest font-semibold">Today's Events</h2>
            {todayEvents.length === 0 && <p className="text-white/40 text-lg">Nothing scheduled</p>}
            {todayEvents.slice(0, 6).map(e => (
              <div key={e.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
                <div className="text-xl font-semibold">{CATEGORY_EMOJI[e.category ?? "other"]} {e.title}</div>
                {e.startTime && <div className="text-white/60 mt-1">{e.startTime}{e.endTime ? ` – ${e.endTime}` : ""}</div>}
              </div>
            ))}
          </div>

          <div className="space-y-4 overflow-hidden">
            <h2 className="text-white/50 text-sm uppercase tracking-widest font-semibold">Chores To Do</h2>
            {todayChores.length === 0 && <p className="text-white/40 text-lg">All done! 🎉</p>}
            {todayChores.slice(0, 6).map(c => (
              <div key={c.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm flex justify-between items-center">
                <div className="text-lg font-medium">{c.title}</div>
                <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">{c.pointsValue} pts</div>
              </div>
            ))}
          </div>

          <div className="space-y-4 overflow-hidden">
            <h2 className="text-white/50 text-sm uppercase tracking-widest font-semibold">Points Leaderboard</h2>
            {[...children].sort((a, b) => b.pointsBalance - a.pointsBalance).map((m, i) => (
              <div key={m.id} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm flex items-center gap-4">
                <div className="text-3xl font-bold text-white/30 w-8">#{i + 1}</div>
                <div className="text-4xl">{m.emoji}</div>
                <div className="flex-1">
                  <div className="text-xl font-semibold">{m.name}</div>
                </div>
                <div className="text-3xl font-bold text-yellow-400">{m.pointsBalance}</div>
              </div>
            ))}
          </div>
        </div>

        {summary && (summary.pendingApprovals > 0 || summary.pendingRedemptions > 0) && (
          <div className="flex gap-4 flex-wrap">
            {summary.pendingApprovals > 0 && (
              <div className="bg-blue-500/20 border border-blue-500/30 rounded-2xl px-5 py-3 text-blue-300 font-medium">
                {summary.pendingApprovals} chore{summary.pendingApprovals !== 1 ? "s" : ""} awaiting approval
              </div>
            )}
            {summary.pendingRedemptions > 0 && (
              <div className="bg-amber-500/20 border border-amber-500/30 rounded-2xl px-5 py-3 text-amber-300 font-medium">
                {summary.pendingRedemptions} reward request{summary.pendingRedemptions !== 1 ? "s" : ""} pending
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
