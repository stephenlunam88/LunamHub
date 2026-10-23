import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventMapsUrl } from "@/lib/maps";

export function EventNavigateButton({ location }: { location?: string | null }) {
  if (!location?.trim()) return null;

  return (
    <Button asChild className="min-h-11 w-full rounded-xl">
      <a
        href={eventMapsUrl(location, navigator)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Navigate to ${location.trim()}`}
      >
        <Navigation aria-hidden="true" />
        Navigate
      </a>
    </Button>
  );
}
