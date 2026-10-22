import { Clock3, Moon, Sun, Sunset } from "lucide-react";

const TIME_SLOT_STYLES = {
  morning: {
    label: "Morning",
    Icon: Sun,
    className: "text-amber-700",
  },
  afternoon: {
    label: "Afternoon",
    Icon: Sunset,
    className: "text-sky-700",
  },
  evening: {
    label: "Evening",
    Icon: Moon,
    className: "text-violet-700",
  },
  anytime: {
    label: "Anytime",
    Icon: Clock3,
    className: "text-slate-500",
  },
} as const;

export function ChoreTimeSlot({
  period,
  className = "",
}: {
  period?: "morning" | "afternoon" | "evening" | null;
  className?: string;
}) {
  const { label, Icon, className: tone } =
    TIME_SLOT_STYLES[period ?? "anytime"];

  return (
    <span
      aria-label={`Intended time: ${label}`}
      title={`Intended time: ${label}`}
      className={`inline-flex w-fit shrink-0 items-center gap-1 text-xs font-medium leading-5 ${tone} ${className}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
