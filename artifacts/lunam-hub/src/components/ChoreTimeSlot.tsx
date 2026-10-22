import { Moon, Sun, Sunset } from "lucide-react";

const TIME_SLOT_STYLES = {
  morning: {
    label: "Morning",
    Icon: Sun,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  afternoon: {
    label: "Afternoon",
    Icon: Sunset,
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  evening: {
    label: "Evening",
    Icon: Moon,
    className: "border-violet-200 bg-violet-50 text-violet-800",
  },
} as const;

export function ChoreTimeSlot({
  period,
  className = "",
}: {
  period?: "morning" | "afternoon" | "evening" | null;
  className?: string;
}) {
  if (!period) return null;
  const { label, Icon, className: tone } = TIME_SLOT_STYLES[period];

  return (
    <span
      aria-label={`Intended time: ${label}`}
      title={`Intended time: ${label}`}
      className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${tone} ${className}`}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}
