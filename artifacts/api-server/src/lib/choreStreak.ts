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
 * A successful scheduled day is one where every chore is done or excused and at
 * least one was done. A fully excused day is neutral: it pauses a streak without
 * increasing it. Unscheduled days do not interrupt a streak. An unfinished
 * current day remains in progress and neither increments nor breaks the streak.
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
    const day = byDate.get(date)!;
    const allResolved = day.every(
      (instance) => instance.status === "done" || instance.status === "excused",
    );
    const fullyExcused = day.every((instance) => instance.status === "excused");
    if (fullyExcused) continue;
    if (allResolved) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let current = 0;
  for (let i = scheduledDates.length - 1; i >= 0; i--) {
    const date = scheduledDates[i]!;
    const day = byDate.get(date)!;
    const allResolved = day.every(
      (instance) => instance.status === "done" || instance.status === "excused",
    );
    const fullyExcused = day.every((instance) => instance.status === "excused");
    if (fullyExcused) continue;
    if (date === today && !allResolved) continue;
    if (!allResolved) break;
    current++;
  }

  return { current, longest };
}
