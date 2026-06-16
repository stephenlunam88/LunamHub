import { useState } from "react";
import {
  useListLists, useGetList, useCreateList, useDeleteList,
  useCreateListItem, useUpdateListItem, useDeleteListItem,
  getListListsQueryKey, getGetListQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, List, ShoppingCart, School, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SharedListInput } from "@workspace/api-client-react";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  grocery: <ShoppingCart className="w-5 h-5" />,
  school: <School className="w-5 h-5" />,
  packing: <span className="text-base">🧳</span>,
  reminders: <Bell className="w-5 h-5" />,
  other: <List className="w-5 h-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  grocery: "bg-green-50 border-green-200",
  school: "bg-blue-50 border-blue-200",
  packing: "bg-purple-50 border-purple-200",
  reminders: "bg-yellow-50 border-yellow-200",
  other: "bg-gray-50 border-gray-200",
};

export default function Lists() {
  const qc = useQueryClient();
  const { data: lists = [] } = useListLists();
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const { data: selectedList } = useGetList(selectedListId ?? 0, {
    query: { enabled: selectedListId !== null, queryKey: getGetListQueryKey(selectedListId ?? 0) }
  });
  const [listOpen, setListOpen] = useState(false);
  const [listForm, setListForm] = useState<SharedListInput>({ name: "", category: "other" });
  const [newItemText, setNewItemText] = useState("");

  const invalidateLists = () => qc.invalidateQueries({ queryKey: getListListsQueryKey() });
  const invalidateList = (id: number) => qc.invalidateQueries({ queryKey: getGetListQueryKey(id) });

  const createList = useCreateList({ mutation: { onSuccess: (l) => { invalidateLists(); setListOpen(false); setListForm({ name: "", category: "other" }); setSelectedListId(l.id); } } });
  const deleteList = useDeleteList({ mutation: { onSuccess: () => { invalidateLists(); setSelectedListId(null); } } });
  const createItem = useCreateListItem({ mutation: { onSuccess: () => { if (selectedListId) invalidateList(selectedListId); setNewItemText(""); } } });
  const updateItem = useUpdateListItem({ mutation: { onSuccess: () => { if (selectedListId) invalidateList(selectedListId); } } });
  const deleteItem = useDeleteListItem({ mutation: { onSuccess: () => { if (selectedListId) invalidateList(selectedListId); } } });

  type ListWithItems = { id: number; name: string; category: string; createdAt: string; items?: { id: number; text: string; completed: boolean; listId: number; createdAt: string }[] };
  const listWithItems = selectedList as ListWithItems | undefined;
  const items = listWithItems?.items ?? [];
  const checked = items.filter(i => i.completed).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-serif font-bold">Lists</h1>
        <Dialog open={listOpen} onOpenChange={setListOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-6 rounded-2xl text-lg gap-2"><Plus className="w-5 h-5" /> New List</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="text-xl font-serif">Create List</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={listForm.name} onChange={e => setListForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl h-12" /></div>
              <div><Label>Category</Label>
                <Select value={listForm.category ?? "other"} onValueChange={v => setListForm(f => ({ ...f, category: v as SharedListInput["category"] }))}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["grocery","school","packing","reminders","other"].map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full h-14 rounded-xl" onClick={() => createList.mutate({ data: listForm })} disabled={!listForm.name || createList.isPending}>
                {createList.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          {lists.length === 0 && <p className="text-muted-foreground text-center py-12">No lists yet</p>}
          {lists.map(l => (
            <button key={l.id} onClick={() => setSelectedListId(l.id)}
              className={cn("w-full text-left rounded-2xl border-2 p-4 transition-all touch-manipulation",
                CATEGORY_COLORS[l.category ?? "other"],
                selectedListId === l.id ? "ring-2 ring-primary ring-offset-2" : "hover:shadow-sm")}>
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">{CATEGORY_ICONS[l.category ?? "other"]}</div>
                <div className="flex-1">
                  <div className="font-semibold text-lg">{l.name}</div>
                  <Badge variant="outline" className="text-xs mt-1">{l.category}</Badge>
                </div>
              </div>
            </button>
          ))}
        </div>

        {selectedListId !== null && listWithItems && (
          <div className="lg:col-span-2 space-y-4">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-2xl font-serif">{listWithItems.name}</CardTitle>
                  <p className="text-muted-foreground text-sm mt-1">{checked}/{items.length} completed</p>
                </div>
                <button onClick={() => deleteList.mutate({ id: selectedListId })} className="text-muted-foreground hover:text-destructive p-2">
                  <Trash2 className="w-5 h-5" />
                </button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <Input
                    placeholder="Add an item…"
                    value={newItemText}
                    onChange={e => setNewItemText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newItemText.trim())
                        createItem.mutate({ listId: selectedListId, data: { text: newItemText.trim() } });
                    }}
                    className="rounded-xl h-14 flex-1"
                  />
                  <Button className="h-14 px-5 rounded-xl" onClick={() => {
                    if (newItemText.trim()) createItem.mutate({ listId: selectedListId, data: { text: newItemText.trim() } });
                  }}>
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>

                {items.filter(i => !i.completed).map(item => (
                  <div key={item.id} className="flex items-center gap-4 bg-muted rounded-2xl p-4 group">
                    <Checkbox checked={false}
                      onCheckedChange={() => updateItem.mutate({ listId: selectedListId, itemId: item.id, data: { completed: true } })}
                      className="h-6 w-6 rounded-lg" />
                    <span className="flex-1 text-base">{item.text}</span>
                    <button onClick={() => deleteItem.mutate({ listId: selectedListId, itemId: item.id })}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {items.filter(i => i.completed).map(item => (
                  <div key={item.id} className="flex items-center gap-4 rounded-2xl p-4 opacity-50">
                    <Checkbox checked={true}
                      onCheckedChange={() => updateItem.mutate({ listId: selectedListId, itemId: item.id, data: { completed: false } })}
                      className="h-6 w-6 rounded-lg" />
                    <span className="flex-1 text-base line-through">{item.text}</span>
                    <button onClick={() => deleteItem.mutate({ listId: selectedListId, itemId: item.id })}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {items.length === 0 && <p className="text-center text-muted-foreground py-8">Empty list — add some items!</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedListId === null && lists.length > 0 && (
          <div className="lg:col-span-2 flex items-center justify-center text-muted-foreground">
            <div className="text-center"><List className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Select a list to view its items</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
