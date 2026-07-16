import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Card className="mx-4 w-full max-w-md rounded-3xl border-0 shadow-sm">
        <CardContent className="p-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold">Page not found</h1>
          </div>
          <p className="mb-6 text-muted-foreground">That page is not available on this display.</p>
          <Button asChild className="h-12 rounded-xl px-6 text-base"><Link href="/">Return to Dashboard</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
