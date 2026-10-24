import { ChevronDown, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { eventMapsUrl, type MapsApp } from "@/lib/maps";

const MAPS_APPS: { app: MapsApp; label: string }[] = [
  { app: "google", label: "Google Maps" },
  { app: "waze", label: "Waze" },
  { app: "default", label: "Default maps" },
];

export function EventNavigateButton({ location }: { location?: string | null }) {
  if (!location?.trim()) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="min-h-11 w-full rounded-xl" aria-label={`Navigate to ${location.trim()}`}>
          <Navigation aria-hidden="true" />
          Navigate
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl" align="start">
        {MAPS_APPS.map(({ app, label }) => (
          <DropdownMenuItem key={app} asChild className="min-h-11 cursor-pointer rounded-lg">
            <a
              href={eventMapsUrl(location, navigator, app)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
