export interface StreakInstance {
  childId: number | null;
  dueDate: string;
  status: string;
}

export interface ChoreStreak {
  current: number;
  longest: number;
}

/**
 * A successful scheduled day is one where every chore due for the child is done.
 * Unscheduled calendar days do not interrupt a streak. An unfinished current day
 * is treated as still in progress, so it neither increments nor breaks the streak.
 */
export function calculateChoreStreak(
  instances: readonly StreakInstance[],
  childId: number,
  today: string,
): ChoreStreak {
  const byDate = new Map<string, StreakInstance[]>();
  for (const instance of instances) {
    if (instance.childId !== childId || instance.dueDate > today) continue;
    const day = byDate.get(instance.dueDate) ?? [];
    day.push(instance);
    byDate.set(instance.dueDate, day);
  }

  const scheduledDates = [...byDate.keys()].sort();
  let longest = 0;
  let run = 0;
  for (const date of scheduledDates) {
    const allDone = byDate.get(date)!.every((instance) => instance.status === "done");
    if (allDone) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = scheduledDates.length - 1; i >= 0; i--) {
    const date = scheduledDates[i]!;
    const allDone = byDate.get(date)!.every((instance) => instance.status === "done");
    if (date === today && !allDone) continue;
    if (!allDone) break;
    current++;
  }

  return { current, longest };
}
