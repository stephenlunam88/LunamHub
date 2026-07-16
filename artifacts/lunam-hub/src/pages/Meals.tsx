import { useState } from "react";
import {
  useListMeals, useGetMealPlan, useCreateMeal, useDeleteMeal,
  useAddMealPlanEntry, useDeleteMealPlanEntry, useAddMealIngredientsToGrocery,
  getListMealsQueryKey, getGetMealPlanQueryKey, getListListsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ShoppingCart, UtensilsCrossed } from "lucide-react";
import type { MealInput, MealPlanEntryInput } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export default function Meals() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const weekStart = format(startOfWeek(new Date()), "yyyy-MM-dd");
  const invalidateMeals = () => qc.invalidateQueries({ queryKey: getListMealsQueryKey() });
  const invalidatePlan = () => qc.invalidateQueries({ queryKey: getGetMealPlanQueryKey({ weekStart }) });

  const { data: meals = [] } = useListMeals();
  const { data: mealPlan = [] } = useGetMealPlan({ weekStart });

  const [mealOpen, setMealOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [mealForm, setMealForm] = useState<MealInput>({ name: "" });
  const [planForm, setPlanForm] = useState<MealPlanEntryInput>({ mealId: 0, date: weekStart, mealType: "dinner" });

  const createMeal = useCreateMeal({ mutation: { onSuccess: () => { invalidateMeals(); setMealOpen(false); setMealForm({ name: "" }); } } });
  const deleteMeal = useDeleteMeal({ mutation: { onSuccess: invalidateMeals } });
  const addPlanEntry = useAddMealPlanEntry({ mutation: { onSuccess: () => { invalidatePlan(); setPlanOpen(false); } } });
  const deletePlanEntry = useDeleteMealPlanEntry({ mutation: { onSuccess: invalidatePlan } });
  const addToGrocery = useAddMealIngredientsToGrocery({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListListsQueryKey() });
        toast({ title: "Grocery list updated", description: `Added ${data.added} ingredients.` });
      },
      onError: () => toast({ title: "Could not update grocery list", description: "Please try again.", variant: "destructive" }),
    }
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfWeek(new Date()), i);
    return { date, dateStr: format(date, "yyyy-MM-dd"), label: DAYS[date.getDay()] };
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-4xl font-serif font-bold">Meal Planner</h1>
        <div className="flex gap-3">
          <Dialog open={planOpen} onOpenChange={setPlanOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> Plan a Meal</Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader><DialogTitle className="text-xl font-serif">Add to Meal Plan</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Meal</Label>
                  <Select value={planForm.mealId ? planForm.mealId.toString() : ""} onValueChange={v => setPlanForm(f => ({ ...f, mealId: Number(v) }))}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Choose a meal" /></SelectTrigger>
                    <SelectContent>{meals.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Date</Label><Input type="date" value={planForm.date} onChange={e => setPlanForm(f => ({ ...f, date: e.target.value }))} className="rounded-xl h-12" /></div>
                <div><Label>Meal type</Label>
                  <Select value={planForm.mealType ?? "dinner"} onValueChange={v => setPlanForm(f => ({ ...f, mealType: v as MealPlanEntryInput["mealType"] }))}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>{MEAL_TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button className="w-full h-12 rounded-xl" onClick={() => addPlanEntry.mutate({ data: planForm })} disabled={!planForm.mealId || addPlanEntry.isPending}>
                  {addPlanEntry.isPending ? "Adding…" : "Add to Plan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={mealOpen} onOpenChange={setMealOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> New Meal</Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader><DialogTitle className="text-xl font-serif">New Meal</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={mealForm.name} onChange={e => setMealForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl h-12" /></div>
                <div><Label>Notes</Label><Input value={mealForm.notes ?? ""} onChange={e => setMealForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl h-12" /></div>
                <div><Label>Ingredients (comma-separated)</Label>
                  <Textarea value={mealForm.ingredients ?? ""} onChange={e => setMealForm(f => ({ ...f, ingredients: e.target.value }))} className="rounded-xl" rows={3} />
                </div>
                <Button className="w-full h-12 rounded-xl" onClick={() => createMeal.mutate({ data: mealForm })} disabled={!mealForm.name || createMeal.isPending}>
                  {createMeal.isPending ? "Saving…" : "Save Meal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="plan">
        <TabsList className="rounded-2xl h-14 p-1">
          <TabsTrigger value="plan" className="rounded-xl h-11 px-6 text-base">This Week</TabsTrigger>
          <TabsTrigger value="library" className="rounded-xl h-11 px-6 text-base">Meal Library</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {weekDays.map(({ date, dateStr, label }) => {
              const dayEntries = mealPlan.filter(e => e.date === dateStr);
              const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
              return (
                <Card key={dateStr} className={`rounded-3xl border-0 shadow-sm ${isToday ? "ring-2 ring-primary" : ""}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">{label}</CardTitle>
                    <p className="text-sm text-muted-foreground">{format(date, "MMM d")}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dayEntries.length === 0 && <p className="text-sm text-muted-foreground italic">Nothing planned</p>}
                    {dayEntries.map(e => (
                      <div key={e.id} className="bg-muted rounded-2xl p-3">
                        <div className="text-sm font-medium">{e.meal?.name}</div>
                        <Badge variant="outline" className="text-xs mt-1">{e.mealType}</Badge>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => addToGrocery.mutate({ id: e.id })} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" /> +grocery
                          </button>
                          <button onClick={() => deletePlanEntry.mutate({ id: e.id })} className="text-xs text-muted-foreground hover:text-destructive ml-auto">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meals.map(m => (
              <Card key={m.id} className="rounded-3xl border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="text-3xl mb-2">🍽️</div>
                    <button onClick={() => deleteMeal.mutate({ id: m.id })} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="font-bold text-xl">{m.name}</div>
                  {m.notes && <div className="text-muted-foreground text-sm mt-1">{m.notes}</div>}
                  {m.ingredients && (
                    <div className="mt-3 text-sm text-muted-foreground">
                      <span className="font-medium">Ingredients: </span>{m.ingredients}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {meals.length === 0 && (
              <div className="col-span-3 text-center py-20 text-muted-foreground">
                <UtensilsCrossed className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-xl">No meals in library yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
