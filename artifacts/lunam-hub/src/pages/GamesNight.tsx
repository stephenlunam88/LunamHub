import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronRight,
  Dice5,
  History,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Player = {
  key: string;
  type: "member" | "guest";
  id: number;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  color: string | null;
  active: boolean;
  guestType: "regular" | "one_time" | null;
};
type CustomOutcome = {
  id: string;
  name: string;
  target: "role" | "others" | "side" | "all";
  points: number;
};
type PointsConfig = Record<string, unknown> & {
  roleLabel?: string;
  outcomes?: CustomOutcome[];
};
type Game = {
  id: number;
  name: string;
  icon: string;
  imageUrl: string | null;
  minPlayers: number;
  maxPlayers: number;
  resultType: "winner" | "placement" | "team" | "custom" | "manual";
  pointsConfig: PointsConfig;
  active: boolean;
};
type Participant = {
  id: number;
  playerKey: string;
  displayName: string;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  points: number;
  placement: number | null;
  team: string | null;
  isWinner: boolean;
  role: string | null;
};
type GameResult = {
  id: number;
  gameId: number;
  playedAt: string;
  resultSummary: string | null;
  game: Game;
  participants: Participant[];
};
type Leader = {
  key: string;
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  totalPoints: number;
  gamesPlayed: number;
  wins: number;
  pointsPerGame: number;
};
type Dashboard = { leaderboard: Leader[]; recentResults: GameResult[] };
type Guest = {
  id: number;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  guestType: "regular" | "one_time";
  active: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/games-night${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error || "Something went wrong");
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

function pointValue(config: PointsConfig, key: string, fallback = 0) {
  return typeof config[key] === "number" ? (config[key] as number) : fallback;
}

function localDateValue(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

function PlayerAvatar({
  player,
  className = "h-14 w-14",
}: {
  player: Pick<
    Player,
    "name" | "nickname" | "avatarUrl" | "avatarEmoji" | "color"
  >;
  className?: string;
}) {
  const display = player.nickname || player.name;
  const initials = display
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <Avatar
      className={cn("shrink-0 border-2 border-background shadow-sm", className)}
    >
      {player.avatarUrl && (
        <AvatarImage
          src={player.avatarUrl}
          alt={`${display}'s profile`}
          className="object-cover"
        />
      )}
      <AvatarFallback
        style={
          player.color
            ? { backgroundColor: player.color, color: "white" }
            : undefined
        }
        className="bg-primary/10 font-bold text-primary"
      >
        {player.avatarEmoji || initials || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

function CompactPlayerAvatar({
  name,
  avatarUrl,
  avatarEmoji,
}: {
  name: string;
  avatarUrl: string | null;
  avatarEmoji: string | null;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="relative block h-8 w-8 min-w-8 shrink-0 overflow-hidden rounded-full border-2 border-background bg-primary/10 text-primary shadow-sm">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold leading-none">
          {avatarEmoji || initial}
        </span>
      )}
    </span>
  );
}

const BUILT_IN_AVATARS = [
  "🦊",
  "🐼",
  "🐯",
  "🐸",
  "🐙",
  "🦄",
  "🤖",
  "👻",
  "🧙",
  "🦸",
  "🥷",
  "👑",
];

function GuestDialog({
  open,
  onOpenChange,
  guest,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guest?: Guest | null;
  onSaved?: (guest: Guest) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: guest?.name ?? "",
    nickname: guest?.nickname ?? "",
    avatarUrl: guest?.avatarUrl ?? "",
    avatarEmoji: guest?.avatarEmoji ?? "",
    guestType: guest?.guestType ?? "regular",
    active: guest?.active ?? true,
  });
  const [preview, setPreview] = useState<string | null>(
    guest?.avatarUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: (body: typeof form) =>
      api<Guest>(guest ? `/guests/${guest.id}` : "/guests", {
        method: guest ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["games-night"] });
      toast({ title: guest ? "Guest updated" : "Guest added" });
      onSaved?.(data);
      if (!guest) {
        setForm({
          name: "",
          nickname: "",
          avatarUrl: "",
          avatarEmoji: "",
          guestType: "regular",
          active: true,
        });
        setPreview(null);
      }
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({
        title: "Could not save guest",
        description: e.message,
        variant: "destructive",
      }),
  });

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      setPreview(URL.createObjectURL(file));
      const request = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      if (!request.ok) throw new Error("Could not prepare upload");
      const { uploadURL, objectPath } = (await request.json()) as {
        uploadURL: string;
        objectPath: string;
      };
      const result = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!result.ok) throw new Error("Photo upload failed");
      setForm((current) => ({
        ...current,
        avatarUrl: `/api/storage${objectPath}`,
        avatarEmoji: "",
      }));
    } catch (error) {
      toast({
        title: "Could not upload photo",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {guest ? "Edit Guest" : "Add Guest"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <PlayerAvatar
              player={{
                name: form.name || "Guest",
                nickname: form.nickname,
                avatarUrl: preview || form.avatarUrl || null,
                avatarEmoji: form.avatarEmoji || null,
                color: null,
              }}
              className="h-20 w-20"
            />
            <div className="grid flex-1 grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4" /> Gallery
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl gap-2"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="h-4 w-4" /> Camera
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                className="mt-1 h-12 rounded-xl"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Nickname (optional)</Label>
              <Input
                className="mt-1 h-12 rounded-xl"
                value={form.nickname}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nickname: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label>Built-in avatar (optional)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {BUILT_IN_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Use ${emoji} avatar`}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      avatarEmoji: emoji,
                      avatarUrl: "",
                    }));
                    setPreview(null);
                  }}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl border-2 text-2xl",
                    form.avatarEmoji === emoji
                      ? "border-primary bg-primary/10"
                      : "border-border",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Guest type</Label>
              <Select
                value={form.guestType}
                onValueChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    guestType: value as "regular" | "one_time",
                  }))
                }
              >
                <SelectTrigger className="mt-1 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular guest</SelectItem>
                  <SelectItem value="one_time">One-time guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex h-12 w-full items-center justify-between rounded-xl border px-3">
                <span>Active</span>
                <Switch
                  checked={form.active}
                  onCheckedChange={(active) =>
                    setForm((f) => ({ ...f, active }))
                  }
                />
              </label>
            </div>
          </div>
          <Button
            className="h-14 w-full rounded-xl text-lg"
            disabled={!form.name.trim() || uploading || save.isPending}
            onClick={() => save.mutate(form)}
          >
            {save.isPending ? "Saving…" : guest ? "Save Guest" : "Add Guest"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ResultPayload = { type: string; [key: string]: unknown };

function RecordGameDialog({
  open,
  onOpenChange,
  games,
  players,
  editResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  games: Game[];
  players: Player[];
  editResult?: GameResult | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const initialGame = editResult
    ? (games.find((g) => g.id === editResult.gameId) ?? null)
    : null;
  const [step, setStep] = useState(editResult ? 3 : 1);
  const [game, setGame] = useState<Game | null>(initialGame);
  const [selected, setSelected] = useState<string[]>(
    editResult?.participants.map((p) => p.playerKey) ?? [],
  );
  const [winner, setWinner] = useState(
    editResult?.participants.find((p) => p.isWinner)?.playerKey ?? "",
  );
  const [placement, setPlacement] = useState<string[]>(
    editResult?.participants
      .slice()
      .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
      .map((p) => p.playerKey) ?? [],
  );
  const [winnerOnly, setWinnerOnly] = useState(false);
  const [winningTeam, setWinningTeam] = useState<string[]>(
    editResult?.participants
      .filter((p) => p.isWinner)
      .map((p) => p.playerKey) ?? [],
  );
  const [chameleon, setChameleon] = useState(
    editResult?.participants.find((p) => p.role === "Chameleon")?.playerKey ??
      "",
  );
  const [chameleonOutcome, setChameleonOutcome] = useState<
    "escaped" | "caught" | "caught_guessed"
  >("caught");
  const [customRole, setCustomRole] = useState("");
  const [customOutcome, setCustomOutcome] = useState("");
  const [customSide, setCustomSide] = useState<string[]>([]);
  const [playedDate, setPlayedDate] = useState(
    editResult
      ? localDateValue(new Date(editResult.playedAt))
      : localDateValue(),
  );
  const [manual, setManual] = useState<Record<string, number>>(
    Object.fromEntries(
      editResult?.participants.map((p) => [p.playerKey, p.points]) ?? [],
    ),
  );
  const [saved, setSaved] = useState<GameResult | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const byKey = new Map(players.map((p) => [p.key, p]));

  const save = useMutation({
    mutationFn: (body: unknown) =>
      api<GameResult>(editResult ? `/results/${editResult.id}` : "/results", {
        method: editResult ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["games-night"] });
      setSaved(result);
      setStep(4);
    },
    onError: (e: Error) =>
      toast({
        title: "Could not record game",
        description: e.message,
        variant: "destructive",
      }),
  });
  function chooseGame(value: Game) {
    setGame(value);
    setSelected([]);
    setWinner("");
    setPlacement([]);
    setWinningTeam([]);
    setChameleon("");
    setCustomRole("");
    setCustomOutcome("");
    setCustomSide([]);
    setManual({});
  }
  function togglePlayer(key: string) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  }
  function resultPayload(): ResultPayload {
    if (!game) return { type: "manual", points: manual };
    if (game.name === "Chameleon")
      return {
        type: "chameleon",
        chameleonKey: chameleon,
        outcome: chameleonOutcome,
      };
    if (game.resultType === "winner")
      return { type: "winner", winnerKey: winner };
    if (game.resultType === "placement")
      return winnerOnly
        ? { type: "winner", winnerKey: winner }
        : { type: "placement", orderedPlayerKeys: placement };
    if (game.resultType === "team")
      return {
        type: "team",
        winningPlayerKeys: winningTeam,
        winningSide: "Winning side",
      };
    if (game.resultType === "custom")
      return {
        type: "custom",
        rolePlayerKey: customRole || undefined,
        selectedPlayerKeys: customSide,
        outcomeId: customOutcome,
      };
    return { type: "manual", points: manual };
  }
  const canContinuePlayers =
    !!game &&
    selected.length >= game.minPlayers &&
    selected.length <= game.maxPlayers;
  const resultReady =
    game?.name === "Chameleon"
      ? !!chameleon
      : game?.resultType === "winner"
        ? !!winner
        : game?.resultType === "placement"
          ? winnerOnly
            ? !!winner
            : placement.length === selected.length
          : game?.resultType === "team"
            ? winningTeam.length > 0 && winningTeam.length < selected.length
            : game?.resultType === "custom"
              ? !!customOutcome &&
                ((game.pointsConfig.outcomes?.find(
                  (o) => o.id === customOutcome,
                )?.target === "side" &&
                  customSide.length > 0) ||
                  game.pointsConfig.outcomes?.find(
                    (o) => o.id === customOutcome,
                  )?.target === "all" ||
                  !!customRole)
              : true;
  function submit() {
    if (game)
      save.mutate({
        gameId: game.id,
        playerKeys: selected,
        result: resultPayload(),
        playedAt: playedDate || localDateValue(),
      });
  }
  function resetResult() {
    setWinner("");
    setPlacement([...selected]);
    setWinningTeam([]);
    setChameleon("");
    setCustomRole("");
    setCustomOutcome("");
    setCustomSide([]);
    setManual({});
    setSaved(null);
    setStep(3);
  }
  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[88dvh] sm:max-w-4xl sm:rounded-3xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-3 font-serif text-3xl">
            <Dice5 className="h-7 w-7 text-primary" />{" "}
            {editResult ? "Correct Game Result" : "Record Game"}
          </DialogTitle>
          <div className="flex gap-2 pt-2">
            {["Game", "Players", "Result"].map((label, i) => (
              <span
                key={label}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  step >= i + 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {games.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    chooseGame(g);
                    setStep(2);
                  }}
                  className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-border bg-card p-5 text-center transition hover:border-primary hover:bg-primary/5"
                >
                  {g.imageUrl ? (
                    <img
                      src={g.imageUrl}
                      alt=""
                      className="h-16 w-16 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="text-5xl">{g.icon}</span>
                  )}
                  <span className="text-xl font-bold">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.minPlayers}–{g.maxPlayers} players
                  </span>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">Who is playing?</h3>
                  <p className="text-muted-foreground">
                    Select {game?.minPlayers}–{game?.maxPlayers} players
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-12 rounded-xl gap-2"
                  onClick={() => setGuestOpen(true)}
                >
                  <UserPlus className="h-4 w-4" /> Add Guest
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
                {players
                  .filter((p) => p.active)
                  .map((player) => {
                    const active = selected.includes(player.key);
                    return (
                      <button
                        key={player.key}
                        onClick={() => togglePlayer(player.key)}
                        className={cn(
                          "relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-transparent bg-muted/50",
                        )}
                      >
                        <PlayerAvatar player={player} />{" "}
                        <span className="max-w-full truncate text-sm font-bold">
                          {player.nickname || player.name}
                        </span>
                        {active && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          {step === 3 && game && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{game.icon}</span>
                <div>
                  <h3 className="text-2xl font-bold">{game.name}</h3>
                  <p className="text-muted-foreground">Record the result</p>
                </div>
              </div>
              <div className="max-w-xs">
                <Label htmlFor="game-played-date">Date played</Label>
                <Input
                  id="game-played-date"
                  type="date"
                  max={localDateValue()}
                  className="mt-1 h-12 rounded-xl text-base"
                  value={playedDate}
                  onChange={(event) => setPlayedDate(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Defaults to today. Future dates are not allowed.
                </p>
              </div>
              {game.name === "Chameleon" ? (
                <>
                  <div>
                    <Label>Who was the Chameleon?</Label>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {selected.map((key) => {
                        const p = byKey.get(key)!;
                        return (
                          <button
                            key={key}
                            onClick={() => setChameleon(key)}
                            className={cn(
                              "flex items-center gap-2 rounded-2xl border-2 p-3",
                              chameleon === key
                                ? "border-primary bg-primary/10"
                                : "border-border",
                            )}
                          >
                            <PlayerAvatar player={p} className="h-10 w-10" />
                            {p.nickname || p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["escaped", "Chameleon escaped", "3 pts to Chameleon"],
                        [
                          "caught",
                          "Group caught them",
                          "1 pt to each group member",
                        ],
                        [
                          "caught_guessed",
                          "Caught, guessed word",
                          "1 pt to Chameleon",
                        ],
                      ] as const
                    ).map(([value, label, help]) => (
                      <button
                        key={value}
                        onClick={() => setChameleonOutcome(value)}
                        className={cn(
                          "min-h-28 rounded-2xl border-2 p-3 text-center",
                          chameleonOutcome === value
                            ? "border-primary bg-primary/10"
                            : "border-border",
                        )}
                      >
                        <div className="font-bold">{label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {help}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : game.resultType === "winner" ? (
                <PlayerChoices
                  title="Select the winner"
                  keys={selected}
                  byKey={byKey}
                  selected={winner ? [winner] : []}
                  onToggle={(key) => setWinner(key)}
                />
              ) : game.resultType === "placement" ? (
                <>
                  <label className="flex items-center justify-between rounded-2xl bg-muted p-4">
                    <span>
                      <b>Winner only</b>
                      <span className="ml-2 text-sm text-muted-foreground">
                        Skip full finishing order
                      </span>
                    </span>
                    <Switch
                      checked={winnerOnly}
                      onCheckedChange={setWinnerOnly}
                    />
                  </label>
                  {winnerOnly ? (
                    <PlayerChoices
                      title="Select the winner"
                      keys={selected}
                      byKey={byKey}
                      selected={winner ? [winner] : []}
                      onToggle={setWinner}
                    />
                  ) : (
                    <PlacementEditor
                      keys={placement.length ? placement : selected}
                      byKey={byKey}
                      onChange={setPlacement}
                    />
                  )}
                </>
              ) : game.resultType === "team" ? (
                <PlayerChoices
                  title="Select everyone on the winning side"
                  keys={selected}
                  byKey={byKey}
                  selected={winningTeam}
                  onToggle={(key) =>
                    setWinningTeam((current) =>
                      current.includes(key)
                        ? current.filter((k) => k !== key)
                        : [...current, key],
                    )
                  }
                />
              ) : game.resultType === "custom" ? (
                <CustomResultEditor
                  game={game}
                  keys={selected}
                  byKey={byKey}
                  rolePlayer={customRole}
                  onRolePlayer={setCustomRole}
                  outcomeId={customOutcome}
                  onOutcome={setCustomOutcome}
                  side={customSide}
                  onSide={setCustomSide}
                />
              ) : (
                <ManualPoints
                  keys={selected}
                  byKey={byKey}
                  values={manual}
                  onChange={setManual}
                />
              )}
            </div>
          )}
          {step === 4 && saved && (
            <div className="mx-auto max-w-xl space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700">
                <Check className="h-10 w-10" />
              </div>
              <div>
                <h3 className="font-serif text-3xl font-bold">
                  Game recorded!
                </h3>
                <p className="mt-2 text-xl">
                  {saved.game.icon} {saved.game.name}
                </p>
                <p className="text-muted-foreground">{saved.resultSummary}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Played {format(new Date(saved.playedAt), "d MMMM yyyy")}
                </p>
              </div>
              <div className="space-y-2 rounded-3xl bg-muted p-4 text-left">
                {saved.participants
                  .slice()
                  .sort((a, b) => b.points - a.points)
                  .map((p) => (
                    <div
                      key={p.playerKey}
                      className="flex items-center justify-between rounded-xl bg-background px-4 py-3"
                    >
                      <span className="font-bold">{p.displayName}</span>
                      <span className="font-bold text-primary">
                        +{p.points} pts
                      </span>
                    </div>
                  ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Button
                  variant="outline"
                  className="h-14 rounded-xl"
                  onClick={resetResult}
                >
                  Rematch
                </Button>
                <Button
                  variant="outline"
                  className="h-14 rounded-xl"
                  onClick={() => {
                    setGame(null);
                    setSelected([]);
                    setSaved(null);
                    setStep(1);
                  }}
                >
                  Another Game
                </Button>
                <Button className="h-14 rounded-xl" onClick={close}>
                  Finish
                </Button>
              </div>
            </div>
          )}
        </div>
        {step < 4 && (
          <div className="flex items-center justify-between border-t bg-background px-6 py-4">
            <Button
              variant="ghost"
              className="h-12 rounded-xl"
              onClick={() => (step === 1 ? close() : setStep(step - 1))}
            >
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            {step === 2 && (
              <Button
                className="h-12 rounded-xl px-8"
                disabled={!canContinuePlayers}
                onClick={() => {
                  setPlacement([...selected]);
                  setStep(3);
                }}
              >
                Enter Result <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {step === 3 && (
              <Button
                className="h-12 rounded-xl px-8"
                disabled={!resultReady || save.isPending}
                onClick={submit}
              >
                {save.isPending
                  ? "Saving…"
                  : editResult
                    ? "Save Correction"
                    : "Save Result"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
      <GuestDialog
        open={guestOpen}
        onOpenChange={setGuestOpen}
        onSaved={(guest) =>
          setSelected((current) => [...current, `guest:${guest.id}`])
        }
      />
    </Dialog>
  );
}

function CustomResultEditor({
  game,
  keys,
  byKey,
  rolePlayer,
  onRolePlayer,
  outcomeId,
  onOutcome,
  side,
  onSide,
}: {
  game: Game;
  keys: string[];
  byKey: Map<string, Player>;
  rolePlayer: string;
  onRolePlayer: (key: string) => void;
  outcomeId: string;
  onOutcome: (id: string) => void;
  side: string[];
  onSide: (keys: string[]) => void;
}) {
  const outcomes = game.pointsConfig.outcomes ?? [];
  const outcome = outcomes.find((item) => item.id === outcomeId);
  return (
    <div className="space-y-5">
      {outcomes.some(
        (item) => item.target === "role" || item.target === "others",
      ) && (
        <PlayerChoices
          title={`Select ${game.pointsConfig.roleLabel || "the special role"}`}
          keys={keys}
          byKey={byKey}
          selected={rolePlayer ? [rolePlayer] : []}
          onToggle={onRolePlayer}
        />
      )}
      <div>
        <Label className="text-base">What happened?</Label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {outcomes.map((item) => (
            <button
              key={item.id}
              onClick={() => onOutcome(item.id)}
              className={cn(
                "min-h-24 rounded-2xl border-2 p-4 text-left",
                outcomeId === item.id
                  ? "border-primary bg-primary/10"
                  : "border-border",
              )}
            >
              <div className="font-bold">{item.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {item.points} points ·{" "}
                {item.target === "role"
                  ? game.pointsConfig.roleLabel || "special role"
                  : item.target === "others"
                    ? "everyone except the role"
                    : item.target === "side"
                      ? "selected side"
                      : "all players"}
              </div>
            </button>
          ))}
        </div>
      </div>
      {outcome?.target === "side" && (
        <PlayerChoices
          title="Select the players on the awarded side"
          keys={keys}
          byKey={byKey}
          selected={side}
          onToggle={(key) =>
            onSide(
              side.includes(key)
                ? side.filter((item) => item !== key)
                : [...side, key],
            )
          }
        />
      )}
    </div>
  );
}

function PlayerChoices({
  title,
  keys,
  byKey,
  selected,
  onToggle,
}: {
  title: string;
  keys: string[];
  byKey: Map<string, Player>;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <Label className="text-base">{title}</Label>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {keys.map((key) => {
          const p = byKey.get(key)!;
          const active = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={cn(
                "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3",
                active ? "border-primary bg-primary/10" : "border-border",
              )}
            >
              <PlayerAvatar player={p} className="h-12 w-12" />
              <span className="font-bold">{p.nickname || p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function PlacementEditor({
  keys,
  byKey,
  onChange,
}: {
  keys: string[];
  byKey: Map<string, Player>;
  onChange: (keys: string[]) => void;
}) {
  function move(i: number, delta: number) {
    const next = [...keys];
    const target = i + delta;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target]!, next[i]!];
    onChange(next);
  }
  return (
    <div>
      <Label className="text-base">Finishing order</Label>
      <div className="mt-3 space-y-2">
        {keys.map((key, i) => {
          const p = byKey.get(key)!;
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-2xl bg-muted p-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-white">
                {i + 1}
              </span>
              <PlayerAvatar player={p} className="h-11 w-11" />
              <span className="flex-1 font-bold">{p.nickname || p.name}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${p.name} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Move ${p.name} down`}
                disabled={i === keys.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ManualPoints({
  keys,
  byKey,
  values,
  onChange,
}: {
  keys: string[];
  byKey: Map<string, Player>;
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}) {
  return (
    <div>
      <Label className="text-base">Points awarded</Label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {keys.map((key) => {
          const p = byKey.get(key)!;
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-2xl bg-muted p-3"
            >
              <PlayerAvatar player={p} className="h-11 w-11" />
              <span className="flex-1 font-bold">{p.nickname || p.name}</span>
              <Input
                type="number"
                className="h-11 w-20 rounded-xl text-center"
                value={values[key] ?? 0}
                onChange={(e) =>
                  onChange({ ...values, [key]: Number(e.target.value) })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerProfileDialog({
  playerKey,
  open,
  onOpenChange,
}: {
  playerKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["games-night", "profile", playerKey],
    queryFn: () => api<any>(`/players/${playerKey}/profile`),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Player Profile
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <p className="py-10 text-center text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <PlayerAvatar player={data.player} className="h-24 w-24" />
              <div>
                <h2 className="font-serif text-3xl font-bold">
                  {data.player.nickname || data.player.name}
                </h2>
                {data.player.type === "guest" && (
                  <Badge variant="outline">
                    {data.player.guestType === "regular"
                      ? "Regular guest"
                      : "One-time guest"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                ["Points", data.totalPoints],
                ["Played", data.gamesPlayed],
                ["Pts / game", data.pointsPerGame],
                ["Wins", data.totalWins],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-2xl bg-muted p-4 text-center"
                >
                  <div className="text-2xl font-bold text-primary">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-bold">Results by game</h3>
              <div className="space-y-2">
                {data.resultsByGame.map((g: any) => (
                  <div
                    key={g.gameId}
                    className="flex justify-between rounded-xl bg-muted px-4 py-3"
                  >
                    <b>{g.name}</b>
                    <span>
                      {g.points} pts · {g.gamesPlayed} played · {g.wins} wins
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-bold">Recent results</h3>
              <div className="space-y-2">
                {data.recentResults.map((r: any) => (
                  <div
                    key={`${r.sessionId}-${r.id}`}
                    className="flex justify-between rounded-xl border px-4 py-3"
                  >
                    <span>
                      {r.game.icon} {r.game.name} ·{" "}
                      {format(new Date(r.playedAt), "d MMM")}
                    </span>
                    <b className="text-primary">+{r.points} pts</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomScoringEditor({
  config,
  onChange,
}: {
  config: PointsConfig;
  onChange: (config: PointsConfig) => void;
}) {
  const outcomes = config.outcomes ?? [];
  const updateOutcome = (index: number, patch: Partial<CustomOutcome>) =>
    onChange({
      ...config,
      outcomes: outcomes.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div>
        <Label>Special role name</Label>
        <Input
          className="mt-1 h-11 rounded-xl"
          placeholder="e.g. Spy, Traitor, Detective"
          value={config.roleLabel ?? ""}
          onChange={(e) => onChange({ ...config, roleLabel: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Result outcomes</Label>
          <p className="text-xs text-muted-foreground">
            Add each possible result and who receives its points.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() =>
            onChange({
              ...config,
              outcomes: [
                ...outcomes,
                {
                  id: `outcome-${Date.now()}`,
                  name: "New outcome",
                  target: "role",
                  points: 1,
                },
              ],
            })
          }
        >
          <Plus className="mr-1 h-4 w-4" /> Outcome
        </Button>
      </div>
      <div className="space-y-2">
        {outcomes.map((outcome, index) => (
          <div
            key={outcome.id}
            className="grid grid-cols-[1fr_150px_70px_40px] items-end gap-2 rounded-xl bg-muted p-2"
          >
            <div>
              <Label className="text-xs">Outcome name</Label>
              <Input
                className="mt-1 h-10 rounded-lg"
                value={outcome.name}
                onChange={(e) => updateOutcome(index, { name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Award points to</Label>
              <Select
                value={outcome.target}
                onValueChange={(target) =>
                  updateOutcome(index, {
                    target: target as CustomOutcome["target"],
                  })
                }
              >
                <SelectTrigger className="mt-1 h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Special role</SelectItem>
                  <SelectItem value="others">Everyone else</SelectItem>
                  <SelectItem value="side">Selected side</SelectItem>
                  <SelectItem value="all">All players</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Points</Label>
              <Input
                type="number"
                className="mt-1 h-10 rounded-lg"
                value={outcome.points}
                onChange={(e) =>
                  updateOutcome(index, { points: Number(e.target.value) })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 text-destructive"
              aria-label={`Remove ${outcome.name}`}
              onClick={() =>
                onChange({
                  ...config,
                  outcomes: outcomes.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamesManager({ games, guests }: { games: Game[]; guests: Guest[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [gameOpen, setGameOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [form, setForm] = useState({
    name: "",
    icon: "🎲",
    imageUrl: "",
    minPlayers: 2,
    maxPlayers: 8,
    resultType: "winner" as Game["resultType"],
    pointsConfig: {
      winner: 3,
      first: 3,
      second: 2,
      third: 1,
      escaped: 3,
      caught: 1,
      guessed: 1,
    } as PointsConfig,
    active: true,
  });
  const saveGame = useMutation({
    mutationFn: () =>
      api<Game>(editingGame ? `/games/${editingGame.id}` : "/games", {
        method: editingGame ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, imageUrl: form.imageUrl || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games-night"] });
      setGameOpen(false);
      toast({ title: editingGame ? "Game updated" : "Game added" });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not save game",
        description: e.message,
        variant: "destructive",
      }),
  });
  function openGame(game?: Game) {
    setEditingGame(game ?? null);
    setForm(
      game
        ? {
            name: game.name,
            icon: game.icon,
            imageUrl: game.imageUrl ?? "",
            minPlayers: game.minPlayers,
            maxPlayers: game.maxPlayers,
            resultType: game.resultType,
            pointsConfig: game.pointsConfig,
            active: game.active,
          }
        : {
            name: "",
            icon: "🎲",
            imageUrl: "",
            minPlayers: 2,
            maxPlayers: 8,
            resultType: "winner",
            pointsConfig: { winner: 3, first: 3, second: 2, third: 1 },
            active: true,
          },
    );
    setGameOpen(true);
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <Card className="rounded-3xl border-0 shadow-sm">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Games</CardTitle>
          <Button className="rounded-xl" onClick={() => openGame()}>
            <Plus className="mr-2 h-4 w-4" /> Add Game
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => openGame(g)}
              className="flex w-full items-center gap-3 rounded-2xl bg-muted p-4 text-left"
            >
              <span className="text-3xl">{g.icon}</span>
              <span className="flex-1">
                <b>{g.name}</b>
                <span className="block text-xs text-muted-foreground">
                  {g.minPlayers}–{g.maxPlayers} · {g.resultType}
                </span>
              </span>
              <Badge variant={g.active ? "secondary" : "outline"}>
                {g.active ? "Active" : "Archived"}
              </Badge>
              <Pencil className="h-4 w-4" />
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-3xl border-0 shadow-sm">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Guests</CardTitle>
          <Button
            className="rounded-xl"
            onClick={() => {
              setEditingGuest(null);
              setGuestOpen(true);
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" /> Add Guest
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {guests.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setEditingGuest(g);
                setGuestOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-muted p-3 text-left"
            >
              <PlayerAvatar
                player={{ ...g, color: null }}
                className="h-11 w-11"
              />
              <span className="flex-1">
                <b>{g.nickname || g.name}</b>
                <span className="block text-xs text-muted-foreground">
                  {g.guestType === "regular"
                    ? "Regular guest"
                    : "One-time guest"}
                </span>
              </span>
              <Badge variant={g.active ? "secondary" : "outline"}>
                {g.active ? "Active" : "Archived"}
              </Badge>
            </button>
          ))}
        </CardContent>
      </Card>
      <Dialog open={gameOpen} onOpenChange={setGameOpen}>
        <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editingGame ? "Edit Game" : "Add Game"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[90px_1fr] gap-3">
              <div>
                <Label>Icon</Label>
                <Input
                  className="mt-1 h-12 rounded-xl text-center text-2xl"
                  value={form.icon}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, icon: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  className="mt-1 h-12 rounded-xl"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Image URL (optional)</Label>
              <Input
                className="mt-1 h-12 rounded-xl"
                placeholder="https://…"
                value={form.imageUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, imageUrl: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Minimum players</Label>
                <Input
                  type="number"
                  className="mt-1 h-12 rounded-xl"
                  value={form.minPlayers}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      minPlayers: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Maximum players</Label>
                <Input
                  type="number"
                  className="mt-1 h-12 rounded-xl"
                  value={form.maxPlayers}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      maxPlayers: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Result type</Label>
              <Select
                value={form.resultType}
                onValueChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    resultType: value as Game["resultType"],
                  }))
                }
              >
                <SelectTrigger className="mt-1 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="winner">Winner only</SelectItem>
                  <SelectItem value="placement">Placement</SelectItem>
                  <SelectItem value="team">Team or side</SelectItem>
                  <SelectItem value="custom">Custom outcomes</SelectItem>
                  <SelectItem value="manual">Manual points</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.resultType !== "manual" && form.resultType !== "custom" && (
              <div>
                <Label>Default points</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(form.name.trim().toLowerCase() === "chameleon"
                    ? [
                        ["escaped", "Escaped"],
                        ["caught", "Group caught"],
                        ["guessed", "Caught + guessed"],
                      ]
                    : form.resultType === "placement"
                      ? [
                          ["first", "First"],
                          ["second", "Second"],
                          ["third", "Third"],
                        ]
                      : [
                          [
                            "winner",
                            form.resultType === "team"
                              ? "Each winner"
                              : "Winner",
                          ],
                        ]
                  ).map(([key, label]) => (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground">
                        {label}
                      </Label>
                      <Input
                        type="number"
                        className="mt-1 h-11 rounded-xl"
                        value={pointValue(form.pointsConfig, key)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            pointsConfig: {
                              ...f.pointsConfig,
                              [key]: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {form.resultType === "custom" && (
              <CustomScoringEditor
                config={form.pointsConfig}
                onChange={(pointsConfig) =>
                  setForm((f) => ({ ...f, pointsConfig }))
                }
              />
            )}
            <label className="flex h-12 items-center justify-between rounded-xl border px-3">
              <span>Active</span>
              <Switch
                checked={form.active}
                onCheckedChange={(active) => setForm((f) => ({ ...f, active }))}
              />
            </label>
            <Button
              className="h-14 w-full rounded-xl"
              disabled={
                !form.name ||
                saveGame.isPending ||
                (form.resultType === "custom" &&
                  !form.pointsConfig.outcomes?.length)
              }
              onClick={() => saveGame.mutate()}
            >
              {saveGame.isPending ? "Saving…" : "Save Game"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <GuestDialog
        key={editingGuest?.id ?? "new"}
        open={guestOpen}
        onOpenChange={setGuestOpen}
        guest={editingGuest}
      />
    </div>
  );
}

export default function GamesNight() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [period, setPeriod] = useState<"overall" | "month">("overall");
  const [gameFilter, setGameFilter] = useState("all");
  const [recordOpen, setRecordOpen] = useState(
    new URLSearchParams(window.location.search).get("quick") === "record",
  );
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [editResult, setEditResult] = useState<GameResult | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  useEffect(() => {
    const handleQuickAction = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "record") {
        setEditResult(null);
        setRecordOpen(true);
      }
    };
    window.addEventListener("lunamhub:quick-action", handleQuickAction);
    return () => window.removeEventListener("lunamhub:quick-action", handleQuickAction);
  }, []);
  const { data: games = [] } = useQuery({
    queryKey: ["games-night", "games", "all"],
    queryFn: () => api<Game[]>("/games?includeArchived=true"),
  });
  const { data: players = [] } = useQuery({
    queryKey: ["games-night", "players"],
    queryFn: () => api<Player[]>("/players"),
  });
  const { data: guests = [] } = useQuery({
    queryKey: ["games-night", "guests"],
    queryFn: () => api<Guest[]>("/guests"),
  });
  const { data: history = [] } = useQuery({
    queryKey: ["games-night", "history"],
    queryFn: () => api<GameResult[]>("/history"),
  });
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["games-night", "dashboard", period, gameFilter],
    queryFn: () =>
      api<Dashboard>(
        `/dashboard?period=${period}${gameFilter !== "all" ? `&gameId=${gameFilter}` : ""}`,
      ),
  });
  const deleteResult = useMutation({
    mutationFn: (id: number) =>
      api<void>(`/results/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games-night"] });
      toast({ title: "Game result deleted" });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not delete result",
        description: e.message,
        variant: "destructive",
      }),
  });
  async function unlock() {
    const response = await fetch("/api/settings/verify-pin", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await response.json()) as { valid: boolean };
    if (data.valid) {
      setAdminUnlocked(true);
      setPinOpen(false);
      setPin("");
      setPinError(false);
    } else {
      setPinError(true);
      setPin("");
    }
  }
  const activeGames = games.filter((g) => g.active);
  const leaders = dashboard?.leaderboard ?? [];
  return (
    <div className="space-y-4 animate-in fade-in duration-300 sm:space-y-6">
      <PageHeader
        title="Games Night"
        icon={<Dice5 className="h-8 w-8 text-primary" />}
        actions={
          <Button
            className="h-12 w-full rounded-2xl px-5 text-base gap-2 sm:h-14 sm:w-auto sm:px-7 sm:text-lg"
            onClick={() => {
              setEditResult(null);
              setRecordOpen(true);
            }}
          >
            <Plus className="h-5 w-5" /> Record Game
          </Button>
        }
      />
      <Tabs defaultValue="leaderboard">
        <TabsList className="grid h-14 w-full grid-cols-3 rounded-2xl p-1">
          <TabsTrigger value="leaderboard" className="h-11 min-w-0 rounded-xl px-2 sm:px-6">
            <Trophy className="mr-2 h-4 w-4" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="history" className="h-11 min-w-0 rounded-xl px-2 sm:px-6">
            <History className="mr-2 h-4 w-4" /> History
          </TabsTrigger>
          <TabsTrigger
            value="manage"
            className="h-11 min-w-0 rounded-xl px-2 sm:px-6"
            onClick={() => !adminUnlocked && setPinOpen(true)}
          >
            <Settings className="mr-2 h-4 w-4" /> Manage
          </TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard" className="space-y-5">
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            <div className="grid grid-cols-2 rounded-2xl bg-muted p-1 sm:flex">
              <Button
                variant={period === "overall" ? "default" : "ghost"}
                className="rounded-xl"
                onClick={() => setPeriod("overall")}
              >
                Overall
              </Button>
              <Button
                variant={period === "month" ? "default" : "ghost"}
                className="rounded-xl"
                onClick={() => setPeriod("month")}
              >
                This month
              </Button>
            </div>
            <Select value={gameFilter} onValueChange={setGameFilter}>
              <SelectTrigger className="h-12 w-full rounded-xl sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All games</SelectItem>
                {activeGames.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.icon} {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] md:gap-6">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="py-10 text-center text-muted-foreground">
                    Loading…
                  </p>
                ) : leaders.length === 0 ? (
                  <div className="py-12 text-center">
                    <Dice5 className="mx-auto h-12 w-12 text-muted-foreground/40" />
                    <h3 className="mt-3 text-xl font-bold">
                      No games recorded yet
                    </h3>
                    <p className="text-muted-foreground">
                      Record the first game to start the leaderboard.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaders.map((leader, index) => (
                      <button
                        key={leader.key}
                        onClick={() => setProfileKey(leader.key)}
                        className="grid w-full grid-cols-[36px_48px_1fr_64px] items-center gap-2 rounded-2xl bg-muted/60 p-3 text-left transition hover:bg-muted md:grid-cols-[48px_64px_1fr_110px_100px_110px] md:gap-3"
                      >
                        <span className="text-center text-xl font-bold">
                          {index < 3
                            ? ["🥇", "🥈", "🥉"][index]
                            : `#${index + 1}`}
                        </span>
                        <PlayerAvatar
                          player={{
                            name: leader.name,
                            nickname: null,
                            avatarUrl: leader.avatarUrl,
                            avatarEmoji: leader.avatarEmoji,
                            color: null,
                          }}
                          className="h-12 w-12"
                        />
                        <span className="font-bold">{leader.name}</span>
                        <span className="text-center">
                          <b className="text-xl text-primary">
                            {leader.totalPoints}
                          </b>
                          <small className="block text-muted-foreground">
                            points
                          </small>
                        </span>
                        <span className="hidden text-center md:block">
                          <b>{leader.gamesPlayed}</b>
                          <small className="block text-muted-foreground">
                            played
                          </small>
                        </span>
                        <span className="hidden text-center md:block">
                          <b>{leader.pointsPerGame}</b>
                          <small className="block text-muted-foreground">
                            pts / game
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <RecentResults results={dashboard?.recentResults ?? []} />
          </div>
        </TabsContent>
        <TabsContent value="history">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Game history</CardTitle>
              {!adminUnlocked && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setPinOpen(true)}
                >
                  Unlock corrections
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {history.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">
                  No game history yet.
                </p>
              ) : (
                history.map((result) => (
                  <div
                    key={result.id}
                    className="grid grid-cols-[110px_190px_1fr_190px_auto] items-center gap-4 rounded-2xl bg-muted/60 p-4"
                  >
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(result.playedAt), "d MMM yyyy")}
                    </span>
                    <span className="font-bold">
                      {result.game.icon} {result.game.name}
                    </span>
                    <div className="flex -space-x-2">
                      {result.participants.map((p) => (
                        <PlayerAvatar
                          key={p.playerKey}
                          player={{
                            name: p.displayName,
                            nickname: null,
                            avatarUrl: p.avatarUrl,
                            avatarEmoji: p.avatarEmoji,
                            color: null,
                          }}
                          className="h-9 w-9"
                        />
                      ))}
                    </div>
                    <span>
                      <b>{result.resultSummary}</b>
                      <small className="block text-muted-foreground">
                        {result.participants
                          .map(
                            (p) =>
                              `${p.displayName} ${p.points >= 0 ? "+" : ""}${p.points}`,
                          )
                          .join(" · ")}
                      </small>
                    </span>
                    {adminUnlocked && (
                      <span className="flex">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit result"
                          onClick={() => {
                            setEditResult(result);
                            setRecordOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDeleteDialog
                          title={`Delete ${result.game.name} result?`}
                          description="This removes the result and its points from the leaderboard."
                          onConfirm={() => deleteResult.mutate(result.id)}
                          trigger={
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Delete result"
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </span>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="manage">
          {adminUnlocked ? (
            <GamesManager games={games} guests={guests} />
          ) : (
            <Card className="rounded-3xl border-0">
              <CardContent className="py-16 text-center">
                <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-3 text-muted-foreground">
                  Enter the parent PIN to manage games and guests.
                </p>
                <Button
                  className="mt-4 rounded-xl"
                  onClick={() => setPinOpen(true)}
                >
                  Unlock management
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      {recordOpen && (
        <RecordGameDialog
          key={`${editResult?.id ?? "new"}-${recordOpen}`}
          open={recordOpen}
          onOpenChange={setRecordOpen}
          games={activeGames}
          players={players}
          editResult={editResult}
        />
      )}
      {profileKey && (
        <PlayerProfileDialog
          playerKey={profileKey}
          open={!!profileKey}
          onOpenChange={(open) => !open && setProfileKey(null)}
        />
      )}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              Parent PIN
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              className={cn(
                "h-14 rounded-xl text-center text-2xl tracking-[.4em]",
                pinError && "border-destructive",
              )}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setPinError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && pin && unlock()}
            />
            {pinError && (
              <p className="text-center text-sm text-destructive">
                Incorrect PIN — try again
              </p>
            )}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={!pin}
              onClick={unlock}
            >
              Unlock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecentResults({ results }: { results: GameResult[] }) {
  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardHeader>
        <CardTitle>Recent results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Results will appear here.
          </p>
        ) : (
          results.slice(0, 5).map((result) => (
            <div key={result.id} className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center justify-between">
                <b>
                  {result.game.icon} {result.game.name}
                </b>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(result.playedAt), "d MMM")}
                </span>
              </div>
              <p className="mt-1 text-sm">{result.resultSummary}</p>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {result.participants.map((p) => (
                  <div
                    key={p.playerKey}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    <CompactPlayerAvatar
                      name={p.displayName}
                      avatarUrl={p.avatarUrl}
                      avatarEmoji={p.avatarEmoji}
                    />
                    <span className="min-w-0 truncate text-xs font-medium">
                      {p.displayName}{" "}
                      <b className="whitespace-nowrap text-primary">
                        {p.points >= 0 ? "+" : ""}
                        {p.points}
                      </b>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
