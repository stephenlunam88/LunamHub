import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex shrink-0 flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <h1 className="truncate font-serif text-4xl font-bold">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-3">{actions}</div>}
    </header>
  );
}
