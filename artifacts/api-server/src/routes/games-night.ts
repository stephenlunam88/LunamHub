import { Router } from "express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  familyMembersTable,
  gameGuestsTable,
  gameParticipantsTable,
  gameSessionsTable,
  gamesTable,
} from "@workspace/db";

const router = Router();
const Id = z.coerce.number().int().positive();
const PlayerKey = z.string().regex(/^(member|guest):\d+$/);
const CustomOutcome = z.object({
  id: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  target: z.enum(["role", "others", "side", "all"]),
  points: z.number().int().min(-100).max(100),
});
const PointsConfig = z
  .object({
    winner: z.number().int().min(0).max(100).optional(),
    first: z.number().int().min(0).max(100).optional(),
    second: z.number().int().min(0).max(100).optional(),
    third: z.number().int().min(0).max(100).optional(),
    escaped: z.number().int().min(0).max(100).optional(),
    caught: z.number().int().min(0).max(100).optional(),
    guessed: z.number().int().min(0).max(100).optional(),
    roleLabel: z.string().trim().min(1).max(60).optional(),
    outcomes: z.array(CustomOutcome).max(20).optional(),
  })
  .passthrough();
type PointsConfiguration = z.infer<typeof PointsConfig>;

const DEFAULT_GAMES: Array<typeof gamesTable.$inferInsert> = [
  {
    name: "Monopoly Deal",
    icon: "🏠",
    minPlayers: 2,
    maxPlayers: 5,
    resultType: "winner" as const,
    pointsConfig: { winner: 3 },
  },
  {
    name: "Rummikub",
    icon: "🔢",
    minPlayers: 2,
    maxPlayers: 4,
    resultType: "placement" as const,
    pointsConfig: { first: 3, second: 2, third: 1 },
  },
  {
    name: "Chameleon",
    icon: "🦎",
    minPlayers: 3,
    maxPlayers: 12,
    resultType: "team" as const,
    pointsConfig: { escaped: 3, caught: 1, guessed: 1 },
  },
];

const GuestInput = z.object({
  name: z.string().trim().min(1).max(80),
  nickname: z.string().trim().max(80).nullish(),
  avatarUrl: z.string().max(500).nullish(),
  avatarEmoji: z.string().max(16).nullish(),
  guestType: z.enum(["regular", "one_time"]).default("regular"),
  active: z.boolean().default(true),
});

const GameInputBase = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(16).default("🎲"),
  imageUrl: z.string().max(500).nullish(),
  minPlayers: z.number().int().min(1).max(20).default(2),
  maxPlayers: z.number().int().min(1).max(30).default(8),
  resultType: z.enum(["winner", "placement", "team", "custom", "manual"]),
  pointsConfig: PointsConfig.default({}),
  active: z.boolean().default(true),
});
const GameInput = GameInputBase.refine((v) => v.maxPlayers >= v.minPlayers, {
  message: "Maximum players must be at least the minimum",
  path: ["maxPlayers"],
});

const ResultInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("winner"), winnerKey: PlayerKey }),
  z.object({
    type: z.literal("placement"),
    orderedPlayerKeys: z.array(PlayerKey).min(1),
    winnerOnly: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("team"),
    winningPlayerKeys: z.array(PlayerKey).min(1),
    winningSide: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal("chameleon"),
    chameleonKey: PlayerKey,
    outcome: z.enum(["escaped", "caught", "caught_guessed"]),
  }),
  z.object({
    type: z.literal("custom"),
    rolePlayerKey: PlayerKey.optional(),
    selectedPlayerKeys: z.array(PlayerKey).default([]),
    outcomeId: z.string().min(1),
  }),
  z.object({
    type: z.literal("manual"),
    points: z.record(PlayerKey, z.number().int().min(-100).max(100)),
  }),
]);

const SessionInput = z.object({
  gameId: z.number().int().positive(),
  playerKeys: z.array(PlayerKey).min(1),
  playedAt: z.string().datetime().optional(),
  result: ResultInput,
});

async function ensureDefaultGames() {
  for (const game of DEFAULT_GAMES) {
    await db
      .insert(gamesTable)
      .values(game)
      .onConflictDoNothing({ target: gamesTable.name });
  }
}

async function allPlayers(includeArchived = false) {
  const [members, guests] = await Promise.all([
    db.select().from(familyMembersTable).orderBy(asc(familyMembersTable.name)),
    db.select().from(gameGuestsTable).orderBy(asc(gameGuestsTable.name)),
  ]);
  return [
    ...members.map((m) => ({
      key: `member:${m.id}`,
      type: "member" as const,
      id: m.id,
      name: m.name,
      nickname: null,
      avatarUrl: m.avatarUrl,
      avatarEmoji: null,
      color: m.color,
      active: true,
      guestType: null,
    })),
    ...guests
      .filter((g) => includeArchived || g.active)
      .map((g) => ({
        key: `guest:${g.id}`,
        type: "guest" as const,
        id: g.id,
        name: g.name,
        nickname: g.nickname,
        avatarUrl: g.avatarUrl,
        avatarEmoji: g.avatarEmoji,
        color: null,
        active: g.active,
        guestType: g.guestType,
      })),
  ];
}

async function scoreSession(input: z.infer<typeof SessionInput>) {
  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, input.gameId));
  if (!game || !game.active) throw new Error("Game not found or archived");
  const uniqueKeys = [...new Set(input.playerKeys)];
  if (uniqueKeys.length !== input.playerKeys.length)
    throw new Error("A player can only be selected once");
  if (
    uniqueKeys.length < game.minPlayers ||
    uniqueKeys.length > game.maxPlayers
  )
    throw new Error(
      `Select between ${game.minPlayers} and ${game.maxPlayers} players`,
    );
  const players = await allPlayers();
  const byKey = new Map(players.map((p) => [p.key, p]));
  if (uniqueKeys.some((k) => !byKey.has(k)))
    throw new Error("One or more players are unavailable");
  const cfg = (game.pointsConfig ?? {}) as PointsConfiguration;
  const values = new Map(
    uniqueKeys.map((k) => [
      k,
      {
        points: 0,
        placement: null as number | null,
        team: null as string | null,
        isWinner: false,
        role: null as string | null,
      },
    ]),
  );
  let summary = "Result recorded";
  const result = input.result;
  if (result.type === "winner") {
    if (!values.has(result.winnerKey))
      throw new Error("Winner must be a selected player");
    Object.assign(values.get(result.winnerKey)!, {
      points: cfg.winner ?? 3,
      placement: 1,
      isWinner: true,
    });
    summary = `${byKey.get(result.winnerKey)!.name} won`;
  } else if (result.type === "placement") {
    if (result.orderedPlayerKeys.some((k) => !values.has(k)))
      throw new Error("Placements must use selected players");
    result.orderedPlayerKeys.forEach((key, index) =>
      Object.assign(values.get(key)!, {
        points:
          index === 0
            ? (cfg.first ?? 3)
            : index === 1
              ? (cfg.second ?? 2)
              : index === 2
                ? (cfg.third ?? 1)
                : 0,
        placement: index + 1,
        isWinner: index === 0,
      }),
    );
    summary = `${byKey.get(result.orderedPlayerKeys[0])!.name} won`;
  } else if (result.type === "team") {
    result.winningPlayerKeys.forEach((key) => {
      if (!values.has(key))
        throw new Error("Winning team must use selected players");
      Object.assign(values.get(key)!, {
        points: cfg.winner ?? 1,
        team: result.winningSide ?? "Winning side",
        isWinner: true,
      });
    });
    summary = result.winningSide
      ? `${result.winningSide} won`
      : "Winning team recorded";
  } else if (result.type === "chameleon") {
    if (!values.has(result.chameleonKey))
      throw new Error("Chameleon must be a selected player");
    values.get(result.chameleonKey)!.role = "Chameleon";
    if (result.outcome === "escaped" || result.outcome === "caught_guessed") {
      Object.assign(values.get(result.chameleonKey)!, {
        points:
          result.outcome === "escaped"
            ? (cfg.escaped ?? 3)
            : (cfg.guessed ?? 1),
        isWinner: true,
      });
      summary =
        result.outcome === "escaped"
          ? "Chameleon escaped"
          : "Chameleon guessed the word";
    } else {
      uniqueKeys
        .filter((k) => k !== result.chameleonKey)
        .forEach((k) =>
          Object.assign(values.get(k)!, {
            points: cfg.caught ?? 1,
            team: "Group",
            isWinner: true,
          }),
        );
      summary = "Group caught the Chameleon";
    }
  } else if (result.type === "custom") {
    const outcomes = Array.isArray(cfg.outcomes) ? cfg.outcomes : [];
    const outcome = outcomes.find((item) => item.id === result.outcomeId);
    if (!outcome) throw new Error("Select a valid result outcome");
    if (result.rolePlayerKey && !values.has(result.rolePlayerKey))
      throw new Error("The selected role must be a player");
    if (result.selectedPlayerKeys.some((key) => !values.has(key)))
      throw new Error("The selected side must use players in this game");
    const awarded =
      outcome.target === "role"
        ? result.rolePlayerKey
          ? [result.rolePlayerKey]
          : []
        : outcome.target === "others"
          ? uniqueKeys.filter((key) => key !== result.rolePlayerKey)
          : outcome.target === "side"
            ? [...new Set(result.selectedPlayerKeys)]
            : uniqueKeys;
    if (!awarded.length)
      throw new Error(
        outcome.target === "side"
          ? "Select at least one player on the awarded side"
          : "Select the special role player",
      );
    awarded.forEach((key) =>
      Object.assign(values.get(key)!, {
        points: outcome.points,
        isWinner: outcome.points > 0,
        team: outcome.target === "side" ? outcome.name : null,
      }),
    );
    if (result.rolePlayerKey)
      values.get(result.rolePlayerKey)!.role =
        typeof cfg.roleLabel === "string" ? cfg.roleLabel : "Special role";
    summary = outcome.name;
  } else {
    for (const key of uniqueKeys)
      values.get(key)!.points = result.points[key] ?? 0;
    const max = Math.max(...[...values.values()].map((v) => v.points));
    values.forEach((v) => {
      v.isWinner = v.points === max && max > 0;
    });
    summary = "Manual points recorded";
  }
  return { game, byKey, values, summary, uniqueKeys };
}

async function saveSession(
  input: z.infer<typeof SessionInput>,
  sessionId?: number,
) {
  const scored = await scoreSession(input);
  return db.transaction(async (tx) => {
    let id = sessionId;
    if (id) {
      const [existing] = await tx
        .select()
        .from(gameSessionsTable)
        .where(eq(gameSessionsTable.id, id));
      if (!existing) throw new Error("Result not found");
      await tx
        .update(gameSessionsTable)
        .set({
          gameId: input.gameId,
          playedAt: input.playedAt
            ? new Date(input.playedAt)
            : existing.playedAt,
          resultSummary: scored.summary,
          updatedAt: new Date(),
        })
        .where(eq(gameSessionsTable.id, id));
      await tx
        .delete(gameParticipantsTable)
        .where(eq(gameParticipantsTable.sessionId, id));
    } else {
      const [created] = await tx
        .insert(gameSessionsTable)
        .values({
          gameId: input.gameId,
          playedAt: input.playedAt ? new Date(input.playedAt) : new Date(),
          resultSummary: scored.summary,
        })
        .returning();
      id = created.id;
    }
    await tx.insert(gameParticipantsTable).values(
      scored.uniqueKeys.map((key) => {
        const player = scored.byKey.get(key)!;
        const score = scored.values.get(key)!;
        return {
          sessionId: id!,
          familyMemberId: player.type === "member" ? player.id : null,
          guestId: player.type === "guest" ? player.id : null,
          playerKey: key,
          displayName: player.nickname || player.name,
          avatarUrl: player.avatarUrl,
          avatarEmoji: player.avatarEmoji,
          ...score,
        };
      }),
    );
    return id!;
  });
}

async function formatSessions(limit?: number) {
  const sessions = await db
    .select()
    .from(gameSessionsTable)
    .orderBy(desc(gameSessionsTable.playedAt));
  const games = await db.select().from(gamesTable);
  const participants = await db.select().from(gameParticipantsTable);
  const gameMap = new Map(games.map((g) => [g.id, g]));
  return sessions
    .slice(0, limit)
    .map((s) => ({
      ...s,
      playedAt: s.playedAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      game: gameMap.get(s.gameId)!,
      participants: participants.filter((p) => p.sessionId === s.id),
    }));
}

router.get("/players", async (req, res) =>
  res.json(await allPlayers(req.query.includeArchived === "true")),
);

router.get("/guests", async (_req, res) =>
  res.json(
    await db.select().from(gameGuestsTable).orderBy(asc(gameGuestsTable.name)),
  ),
);
router.post("/guests", async (req, res) => {
  const body = GuestInput.parse(req.body);
  const [row] = await db.insert(gameGuestsTable).values(body).returning();
  res.status(201).json(row);
});
router.patch("/guests/:id", async (req, res) => {
  const id = Id.parse(req.params.id);
  const body = GuestInput.partial().parse(req.body);
  const [row] = await db
    .update(gameGuestsTable)
    .set(body)
    .where(eq(gameGuestsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Guest not found" });
    return;
  }
  res.json(row);
});

router.get("/games", async (req, res) => {
  await ensureDefaultGames();
  const rows = await db.select().from(gamesTable).orderBy(asc(gamesTable.name));
  res.json(
    req.query.includeArchived === "true" ? rows : rows.filter((g) => g.active),
  );
});
router.post("/games", async (req, res) => {
  const body = GameInput.parse(req.body);
  const [row] = await db.insert(gamesTable).values(body).returning();
  res.status(201).json(row);
});
router.patch("/games/:id", async (req, res) => {
  const id = Id.parse(req.params.id);
  const body = GameInputBase.partial().parse(req.body);
  const [row] = await db
    .update(gamesTable)
    .set(body)
    .where(eq(gamesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(row);
});

router.get("/history", async (req, res) =>
  res.json(
    await formatSessions(
      req.query.limit ? Math.max(1, Number(req.query.limit)) : undefined,
    ),
  ),
);
router.post("/results", async (req, res) => {
  try {
    const input = SessionInput.parse(req.body);
    const id = await saveSession(input);
    const row = (await formatSessions()).find((s) => s.id === id);
    res.status(201).json(row);
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Could not record result",
      });
  }
});
router.patch("/results/:id", async (req, res) => {
  try {
    const id = Id.parse(req.params.id);
    const input = SessionInput.parse(req.body);
    await saveSession(input, id);
    const row = (await formatSessions()).find((s) => s.id === id);
    res.json(row);
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Could not update result",
      });
  }
});
router.delete("/results/:id", async (req, res) => {
  const id = Id.parse(req.params.id);
  await db.delete(gameSessionsTable).where(eq(gameSessionsTable.id, id));
  res.status(204).send();
});

router.get("/dashboard", async (req, res) => {
  await ensureDefaultGames();
  const gameId = req.query.gameId ? Id.parse(req.query.gameId) : null;
  const period = req.query.period === "month" ? "month" : "overall";
  const since =
    period === "month"
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      : null;
  const sessions = since
    ? await db
        .select()
        .from(gameSessionsTable)
        .where(gte(gameSessionsTable.playedAt, since))
        .orderBy(desc(gameSessionsTable.playedAt))
    : await db
        .select()
        .from(gameSessionsTable)
        .orderBy(desc(gameSessionsTable.playedAt));
  const filtered = gameId
    ? sessions.filter((s) => s.gameId === gameId)
    : sessions;
  const ids = new Set(filtered.map((s) => s.id));
  const participants = (await db.select().from(gameParticipantsTable)).filter(
    (p) => ids.has(p.sessionId),
  );
  const players = await allPlayers(true);
  const stats = new Map<
    string,
    {
      key: string;
      name: string;
      avatarUrl: string | null;
      avatarEmoji: string | null;
      totalPoints: number;
      gamesPlayed: number;
      wins: number;
    }
  >();
  for (const p of participants) {
    const live = players.find((player) => player.key === p.playerKey);
    const row = stats.get(p.playerKey) ?? {
      key: p.playerKey,
      name: live?.nickname || live?.name || p.displayName,
      avatarUrl: live?.avatarUrl ?? p.avatarUrl,
      avatarEmoji: live?.avatarEmoji ?? p.avatarEmoji,
      totalPoints: 0,
      gamesPlayed: 0,
      wins: 0,
    };
    row.totalPoints += p.points;
    row.gamesPlayed += 1;
    if (p.isWinner) row.wins += 1;
    stats.set(p.playerKey, row);
  }
  const leaderboard = [...stats.values()]
    .map((s) => ({
      ...s,
      pointsPerGame: s.gamesPlayed
        ? Number((s.totalPoints / s.gamesPlayed).toFixed(1))
        : 0,
    }))
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.wins - a.wins ||
        a.name.localeCompare(b.name),
    );
  res.json({
    period,
    gameId,
    leaderboard,
    recentResults: (await formatSessions())
      .filter((s) => ids.has(s.id))
      .slice(0, 8),
  });
});

router.get("/players/:key/profile", async (req, res) => {
  const key = PlayerKey.parse(req.params.key);
  const player = (await allPlayers(true)).find((p) => p.key === key);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  const all = await formatSessions();
  const results = all.filter((s) =>
    s.participants.some((p) => p.playerKey === key),
  );
  const parts = results.flatMap((s) =>
    s.participants
      .filter((p) => p.playerKey === key)
      .map((p) => ({
        ...p,
        game: s.game,
        playedAt: s.playedAt,
        sessionId: s.id,
        resultSummary: s.resultSummary,
      })),
  );
  const totalPoints = parts.reduce((sum, p) => sum + p.points, 0);
  const byGame = new Map<
    string,
    {
      gameId: number;
      name: string;
      gamesPlayed: number;
      points: number;
      wins: number;
    }
  >();
  for (const p of parts) {
    const current = byGame.get(p.game.name) ?? {
      gameId: p.game.id,
      name: p.game.name,
      gamesPlayed: 0,
      points: 0,
      wins: 0,
    };
    current.gamesPlayed++;
    current.points += p.points;
    if (p.isWinner) current.wins++;
    byGame.set(p.game.name, current);
  }
  res.json({
    player,
    totalPoints,
    gamesPlayed: parts.length,
    pointsPerGame: parts.length
      ? Number((totalPoints / parts.length).toFixed(1))
      : 0,
    totalWins: parts.filter((p) => p.isWinner).length,
    resultsByGame: [...byGame.values()],
    recentResults: parts.slice(0, 10),
  });
});

export { router as gamesNightRouter };
