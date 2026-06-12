import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Calendar, CheckSquare, Gift, List, Utensils, Clock, Settings, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/chores", label: "Chores", icon: CheckSquare },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/lists", label: "Lists", icon: List },
  { href: "/meals", label: "Meals", icon: Utensils },
  { href: "/routines", label: "Routines", icon: Clock },
  { href: "/admin", label: "Admin", icon: Settings },
  { href: "/display", label: "Display", icon: MonitorPlay },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  if (location === "/display") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="w-64 bg-sidebar border-r flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-serif font-bold text-primary">LunamHub</h1>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors touch-manipulation",
                "h-14", // Large touch target
                isActive ? "bg-primary text-primary-foreground" : "hover:bg-sidebar-accent text-sidebar-foreground"
              )}>
                <Icon className="w-6 h-6" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
