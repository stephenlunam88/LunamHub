import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ConfirmDeleteDialogProps = {
  trigger: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
};

export function ConfirmDeleteDialog({
  trigger,
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-md rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 pt-2">
          <AlertDialogCancel className="h-12 rounded-xl px-6 text-base">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="h-12 rounded-xl bg-destructive px-6 text-base text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
