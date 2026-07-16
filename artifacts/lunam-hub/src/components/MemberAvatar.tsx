import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type MemberAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
};

export function MemberAvatar({ name, avatarUrl, className = "h-8 w-8" }: MemberAvatarProps) {
  return (
    <Avatar className={cn("shrink-0 border border-muted", className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={`${name}'s profile`} className="object-cover" />}
      <AvatarFallback className="bg-primary/10 text-primary">
        <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
        <span className="sr-only">No profile picture for {name}</span>
      </AvatarFallback>
    </Avatar>
  );
}

export function MemberOption({ name, avatarUrl }: Pick<MemberAvatarProps, "name" | "avatarUrl">) {
  return (
    <span className="flex items-center gap-2">
      <MemberAvatar name={name} avatarUrl={avatarUrl} className="h-6 w-6" />
      <span>{name}</span>
    </span>
  );
}
