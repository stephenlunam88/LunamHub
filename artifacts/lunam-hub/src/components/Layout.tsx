import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Calendar, CheckSquare, Gift, List, Settings, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/chores", label: "Chores", icon: CheckSquare },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/lists", label: "Lists", icon: List },
  { href: "/admin", label: "Admin", icon: Settings },
  { href: "/display", label: "Display", icon: MonitorPlay },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  if (location === "/display") {
    return <>{children}</>;
  }

  const isDashboard = location === "/";

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {isDashboard ? (
        <main className="overflow-hidden" style={{ height: "calc(100vh - 72px)" }}>
          {children}
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-5xl mx-auto px-6 pt-6 pb-24 space-y-6">
            {children}
          </div>
        </main>
      )}

      <nav className="fixed bottom-0 left-0 right-0 h-[72px] bg-card border-t border-border flex items-center justify-around px-2 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-2xl transition-all touch-manipulation",
                "w-14 h-14 min-w-[56px]",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title={item.label}
            >
              <Icon className="w-6 h-6" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
