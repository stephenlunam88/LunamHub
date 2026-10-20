import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  MessageCircle,
  Mic,
  Send,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatMessage = { role: "user" | "assistant"; content: string };
type PendingAction = {
  name: string;
  arguments: Record<string, unknown>;
  assignedNames?: string[];
};
type Pending = { id: string; actions: PendingAction[] };

function actionSummary(action: PendingAction) {
  const args = action.arguments;
  if (action.name === "call_lunamhub_api") {
    const method = String(args.method ?? "API");
    const path = String(args.path ?? "unknown endpoint");
    const query = args.query
      ? `?${new URLSearchParams(args.query as Record<string, string>)}`
      : "";
    const body = args.body ? ` · ${JSON.stringify(args.body)}` : "";
    return `${method} ${path}${query}${body}`.slice(0, 1_500);
  }
  if (action.name === "create_calendar_event") {
    const people = action.assignedNames?.length
      ? ` · ${action.assignedNames.join(", ")}`
      : Array.isArray(args.assignedMembers)
        ? ` · ${args.assignedMembers.length} family member${args.assignedMembers.length === 1 ? "" : "s"}`
        : "";
    const time = args.startTime
      ? ` · ${args.startTime}${args.endTime ? `–${args.endTime}` : ""}`
      : " · all day";
    return `${String(args.title ?? "Calendar event")} · ${String(args.date ?? "Date not set")}${time}${people}`;
  }
  if (action.name === "create_chore") {
    const due = args.dueDate ? ` · due ${String(args.dueDate)}` : "";
    const repeat =
      args.repeatType && args.repeatType !== "once"
        ? ` · ${String(args.repeatType)}`
        : "";
    const people = action.assignedNames?.length
      ? ` · ${action.assignedNames.join(", ")}`
      : "";
    return `${String(args.title ?? "Chore")}${people}${due}${repeat}`;
  }
  return action.name;
}

async function readResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  let body: { error?: string } & T = {} as { error?: string } & T;
  try {
    body = JSON.parse(responseText) as { error?: string } & T;
  } catch {
    // Reverse proxies can return an HTML error page instead of the API's JSON.
  }
  if (!response.ok) {
    throw new Error(
      body.error ??
        `Request failed (HTTP ${response.status}). Please try again.`,
    );
  }
  return body;
}

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    [messages, pending, busy],
  );
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  async function sendMessage(value = draft) {
    const message = value.trim();
    if (!message || busy || pending) return;
    setBusy(true);
    setError("");
    setDraft("");
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    try {
      const result = await readResponse<{
        text: string;
        pending: Pending | null;
      }>(
        await fetch("/api/assistant/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history: messages.slice(-30) }),
        }),
      );
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.text },
      ]);
      setPending(result.pending);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't reach the assistant.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmChanges() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await readResponse<{
        text: string;
        pending: Pending | null;
      }>(
        await fetch("/api/assistant/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pending.id }),
        }),
      );
      setPending(result.pending);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.text },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't confirm that change.",
      );
    } finally {
      setBusy(false);
    }
  }

  function discardChanges() {
    setPending(null);
    setError("");
    setMessages((current) => [
      ...current,
      { role: "assistant", content: "Okay, I haven't made that change." },
    ]);
  }

  async function toggleRecording() {
    setError("");
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Voice recording isn't supported by this browser. Try the latest Safari or Chrome.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(chunks.current, {
          type: instance.mimeType || "audio/webm",
        });
        chunks.current = [];
        if (!audio.size) return;
        setBusy(true);
        try {
          const result = await readResponse<{ text: string }>(
            await fetch("/api/assistant/transcribe", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": audio.type || "audio/webm" },
              body: audio,
            }),
          );
          setDraft((current) =>
            current ? `${current} ${result.text}` : result.text,
          );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn't transcribe that recording.",
          );
        } finally {
          setBusy(false);
        }
      };
      recorder.current = instance;
      instance.start();
      setRecording(true);
    } catch {
      setError("Allow microphone access in your browser, then try again.");
    }
  }

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 pt-5 pb-4 md:px-6 md:pt-6">
      <header className="mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif text-2xl font-bold">Family assistant</h1>
            <p className="text-sm text-muted-foreground">
              Ask about your calendar or chores. Speak or type.
            </p>
          </div>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-3xl border bg-card p-3 md:p-5"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-5 py-12 text-center">
            <MessageCircle className="mb-4 h-10 w-10 text-primary/60" />
            <h2 className="font-serif text-xl font-semibold">
              What can I help with?
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Try “What’s on this weekend?” or “Add basketball for Illidan on
              Saturday at 7.” I’ll show you any changes before saving them.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <p
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"}`}
              >
                {message.content}
              </p>
            </div>
          ))
        )}
        {busy && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {recording ? "Listening…" : "Working…"}
          </div>
        )}
        {pending && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="font-semibold">Confirm before I save</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {pending.actions.map((action, index) => (
                <li key={`${action.name}-${index}`}>
                  • {actionSummary(action)}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={confirmChanges}
                disabled={busy}
                className="min-h-11 flex-1"
              >
                <Check className="mr-2 h-4 w-4" />
                Confirm
              </Button>
              <Button
                onClick={discardChanges}
                disabled={busy}
                variant="outline"
                className="min-h-11 flex-1"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-3 flex shrink-0 items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          aria-label={recording ? "Stop recording" : "Record voice message"}
          onClick={() => void toggleRecording()}
          disabled={busy || !!pending}
        >
          {recording ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={
            recording
              ? "Listening… tap the square to finish"
              : "Type or tap the mic…"
          }
          rows={1}
          maxLength={4000}
          disabled={busy || !!pending}
          className="max-h-32 min-h-11 resize-none border-0 px-2 py-3 shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          aria-label="Send message"
          disabled={busy || !!pending || !draft.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-2 shrink-0 text-center text-xs text-muted-foreground">
        Voice and chat are sent securely to the configured AI service. Check
        details before confirming changes.
      </p>
    </section>
  );
}
