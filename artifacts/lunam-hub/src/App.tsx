import { Switch, Route, Router as WouterRouter } from "wouter";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

function Router() {
  return (
    <Layout>
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
