import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Calendar, CheckSquare, Dice5, Gift, List, Settings, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/chores", label: "Chores", icon: CheckSquare },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/lists", label: "Lists", icon: List },
  { href: "/games", label: "Games", icon: Dice5 },
  { href: "/admin", label: "Parents", icon: Settings },
  { href: "/display", label: "Display", icon: MonitorPlay },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  if (location === "/display") {
    return <>{children}</>;
  }

  const isDashboard = location === "/";
  const isCalendar = location === "/calendar";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {isDashboard || isCalendar ? (
        <main className="overflow-hidden" style={{ height: "calc(100dvh - 80px)" }}>
          {isCalendar ? (
            <div className="w-full px-6 pt-6 pb-4 h-full flex flex-col">
              {children}
            </div>
          ) : children}
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-5xl mx-auto px-6 pt-6 pb-24 space-y-6">
            {children}
          </div>
        </main>
      )}

      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 flex h-20 items-center justify-around border-t border-border bg-card px-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-2xl transition-all touch-manipulation",
                "h-16 min-w-[72px] px-2",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-label={item.label}
              title={item.label}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span className="text-[11px] font-bold leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
