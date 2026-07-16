import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Calendar,
  CalendarPlus,
  CheckCheck,
  CheckSquare,
  Dice5,
  Gift,
  Home,
  List,
  ListPlus,
  Menu,
  MonitorPlay,
  Plus,
  Settings,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const QUICK_ACTIONS = [
  {
    href: "/chores?quick=approval",
    label: "Approve chores",
    help: "Review completed chores",
    icon: CheckCheck,
  },
  {
    href: "/chores?quick=add",
    label: "Add chore",
    help: "Assign a new household task",
    icon: CheckSquare,
  },
  {
    href: "/games?quick=record",
    label: "Record game",
    help: "Quickly add a Games Night result",
    icon: Dice5,
  },
  {
    href: "/calendar?quick=add",
    label: "Add event",
    help: "Put something on the family calendar",
    icon: CalendarPlus,
  },
  {
    href: "/lists?quick=item",
    label: "Add list item",
    help: "Quickly add to an existing list",
    icon: ListPlus,
  },
  {
    href: "/games?quick=record",
    label: "Add guest",
    help: "Add a guest during game entry",
    icon: UserPlus,
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (location === "/display") return <>{children}</>;

  const path = location.split("?")[0];
  const isDashboard = path === "/";
  const isCalendar = path === "/calendar";
  const go = (href: string) => {
    setQuickOpen(false);
    setMoreOpen(false);
    navigate(href);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <main
        className={cn(
          "min-h-0 flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] md:pt-0",
          (isDashboard || isCalendar) && "md:overflow-hidden",
        )}
      >
        <div
          className={cn(
            "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0",
            !isDashboard &&
              !isCalendar &&
              "mx-auto max-w-5xl px-4 pt-4 md:px-6 md:pt-6 md:pb-24",
          )}
        >
          {isCalendar ? (
            <div className="h-full px-4 pt-4 md:px-6 md:pt-6 md:pb-4">
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(76px+env(safe-area-inset-bottom))] grid-cols-5 items-start border-t bg-card px-1 pt-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] md:hidden"
      >
        <MobileLink href="/" label="Home" icon={Home} location={path} />
        <MobileLink
          href="/chores"
          label="Chores"
          icon={CheckSquare}
          location={path}
        />
        <button
          onClick={() => setQuickOpen(true)}
          className="-mt-6 flex flex-col items-center gap-1 text-primary"
          aria-label="Open quick actions"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Plus className="h-7 w-7" />
          </span>
          <span className="text-[10px] font-bold">Quick Add</span>
        </button>
        <MobileLink href="/games" label="Games" icon={Dice5} location={path} />
        <button
          onClick={() => setMoreOpen(true)}
          className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-bold">More</span>
        </button>
      </nav>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-50 hidden h-20 items-center justify-around border-t border-border bg-card px-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] md:flex"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = path === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-16 min-w-[72px] flex-col items-center justify-center gap-1 rounded-2xl px-2 transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[11px] font-bold">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="bottom-0 top-auto max-h-[85dvh] translate-y-0 rounded-b-none rounded-t-3xl p-5 sm:top-1/2 sm:max-w-md sm:-translate-y-1/2 sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Quick Add</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={`${action.label}-${action.href}`}
                  onClick={() => go(action.href)}
                  className="flex min-h-16 items-center gap-3 rounded-2xl bg-muted/70 p-3 text-left"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <b className="block">{action.label}</b>
                    <small className="text-muted-foreground">
                      {action.help}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="bottom-0 top-auto translate-y-0 rounded-b-none rounded-t-3xl p-5 sm:top-1/2 sm:max-w-sm sm:-translate-y-1/2 sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">More</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {NAV_ITEMS.filter(
              (item) => !["/", "/chores", "/games"].includes(item.href),
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => go(item.href)}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-muted"
                >
                  <Icon className="h-6 w-6 text-primary" />
                  <b>{item.label}</b>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileLink({
  href,
  label,
  icon: Icon,
  location,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  location: string;
}) {
  const active = location === href;
  return (
    <Link
      href={href}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-1 rounded-xl",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}
