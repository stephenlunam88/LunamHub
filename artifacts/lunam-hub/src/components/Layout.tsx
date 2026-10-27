import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Calendar,
  CalendarPlus,
  Camera,
  CheckCheck,
  CheckSquare,
  Dice5,
  Gift,
  Home,
  List,
  ListPlus,
  Menu,
  MessageCircle,
  MonitorPlay,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const NAV_ITEMS = [
  { href: "/", label: "Today", icon: Home },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/chores", label: "Chores", icon: CheckSquare },
  { href: "/rewards", label: "Rewards", icon: Gift },
  { href: "/lists", label: "Lists", icon: List },
  { href: "/games", label: "Games", icon: Dice5 },
  { href: "/assistant", label: "Assistant", icon: MessageCircle },
  { href: "/cameras", label: "Cameras", icon: Camera },
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
    const target = new URL(href, window.location.origin);
    if (target.pathname === path) {
      window.dispatchEvent(
        new CustomEvent("lunamhub:quick-action", {
          detail: target.searchParams.get("quick"),
        }),
      );
      return;
    }
    navigate(href);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] text-foreground md:pt-0">
      <main
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          isDashboard && "md:overflow-hidden",
        )}
      >
        <div
          className={cn(
            "pb-6 md:pb-0",
            (isDashboard || isCalendar) && "md:h-full",
            path === "/assistant" && "h-full",
            !isDashboard &&
              !isCalendar &&
              "mx-auto max-w-5xl px-4 pt-4 md:px-6 md:pt-6",
          )}
        >
          {isCalendar ? (
            <div className="px-4 pt-4 md:h-full md:px-6 md:pt-6 md:pb-4">
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      <nav
        aria-label="Mobile navigation"
        className="relative z-50 grid h-[calc(64px+env(safe-area-inset-bottom)/4)] shrink-0 grid-cols-5 items-end border-t bg-card px-1 pt-2 pb-[calc(env(safe-area-inset-bottom)/4)] shadow-[0_-4px_24px_rgba(0,0,0,0.08)] md:hidden"
      >
        <MobileLink href="/" label="Today" icon={Home} location={path} />
        <MobileLink
          href="/calendar"
          label="Calendar"
          icon={Calendar}
          location={path}
        />
        <button
          onClick={() => navigate("/assistant")}
          className="relative flex h-14 w-full flex-col items-center justify-end gap-1 rounded-xl pb-2 text-primary"
          aria-label="Open Family Assistant"
        >
          <span className="absolute left-1/2 top-2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <MessageCircle className="h-6 w-6" />
          </span>
          <span className="relative z-10 text-[10px] font-bold leading-none">
            Assistant
          </span>
        </button>
        <MobileLink href="/lists" label="Lists" icon={List} location={path} />
        <button
          onClick={() => setMoreOpen(true)}
          className="flex h-14 flex-col items-center justify-end gap-1 rounded-xl pb-2 text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-bold">More</span>
        </button>
      </nav>

      <nav
        aria-label="Main navigation"
        className="relative z-50 hidden h-20 shrink-0 items-center justify-around border-t border-border bg-card px-2 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] md:flex"
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

      <Drawer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        shouldScaleBackground={false}
      >
        <DrawerContent className="max-h-[85dvh] rounded-t-3xl">
          <DrawerHeader className="relative px-5 pb-3 pt-4 text-left">
            <DrawerTitle className="font-serif text-2xl">More</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="absolute right-4 top-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground"
                aria-label="Close More menu"
              >
                <X className="h-5 w-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <button
              onClick={() => {
                setMoreOpen(false);
                setQuickOpen(true);
              }}
              className="col-span-2 flex min-h-16 items-center gap-3 rounded-2xl bg-primary/10 px-4 text-left text-primary"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Plus className="h-5 w-5" />
              </span>
              <span>
                <b className="block">Quick Add</b>
                <small className="text-muted-foreground">
                  Add an event, chore, list item, or game result
                </small>
              </span>
            </button>
            {NAV_ITEMS.filter(
              (item) =>
                !["/", "/calendar", "/lists", "/assistant"].includes(
                  item.href,
                ),
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
        </DrawerContent>
      </Drawer>
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
        "flex h-14 w-full min-w-0 flex-col items-center justify-end gap-1 rounded-xl pb-2",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}
