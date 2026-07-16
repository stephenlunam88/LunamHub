import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
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
import GamesNight from "@/pages/GamesNight";
import Cameras from "@/pages/Cameras";
import {
  useGetSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

function InactivityWatcher() {
  const [location, navigate] = useLocation();
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) return;
    if (location === "/display") {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const timeoutMs = (settings?.screensaverTimeout ?? 5) * 60 * 1000;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => navigate("/display"), timeoutMs);
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
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
        <Route path="/games" component={GamesNight} />
        <Route path="/cameras" component={Cameras} />
        <Route path="/meals" component={Meals} />
        <Route path="/routines" component={Routines} />
        <Route path="/admin" component={Admin} />
        <Route path="/display" component={Display} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { authenticated, passwordRequired, isLoading } = useAuth();

  if (isLoading) return null;
  if (passwordRequired && !authenticated) return <Login />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
