import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Calendar from "@/pages/Calendar";
import Chores from "@/pages/Chores";
import Rewards from "@/pages/Rewards";
import Lists from "@/pages/Lists";
import Meals from "@/pages/Meals";
import Routines from "@/pages/Routines";
import Admin from "@/pages/Admin";
import Display from "@/pages/Display";
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

// Navigates to /display after N minutes of inactivity (any touch/mouse/key resets the timer).
// Does nothing when already on the display/screensaver page.
function InactivityWatcher() {
  const [location, navigate] = useLocation();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't run on the display/screensaver page itself
    if (location === "/display") {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const timeoutMs = (settings?.screensaverTimeout ?? 5) * 60 * 1000;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => navigate("/display"), timeoutMs);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [location, navigate, settings?.screensaverTimeout]);

  return null;
}

function Router() {
  return (
    <Layout>
      <InactivityWatcher />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/chores" component={Chores} />
        <Route path="/rewards" component={Rewards} />
        <Route path="/lists" component={Lists} />
        <Route path="/meals" component={Meals} />
        <Route path="/routines" component={Routines} />
        <Route path="/admin" component={Admin} />
        <Route path="/display" component={Display} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
