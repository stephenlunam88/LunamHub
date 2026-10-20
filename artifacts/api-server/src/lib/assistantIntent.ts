type ConversationMessage = Record<string, unknown>;

/** Detect a calendar-delete lookup, including a short "find it" follow-up. */
export function needsCalendarLookupForRemoval(messages: ConversationMessage[]) {
  const recent = messages.slice(-8);
  const latestUser = [...recent]
    .reverse()
    .find((message) => message.role === "user");
  if (typeof latestUser?.content !== "string") return false;

  const context = recent
    .map((message) =>
      typeof message.content === "string" ? message.content : "",
    )
    .join(" ");
  const hasCalendarTarget = /\b(calendar|event|appointment|meeting)\b/i.test(
    context,
  );
  if (!hasCalendarTarget) return false;

  if (/\b(remove|delete|cancel|take off)\b/i.test(latestUser.content))
    return true;

  const isLookupFollowUp =
    /\b(find it|find the event|look it up|search for it|check for it)\b/i.test(
      latestUser.content,
    );
  const assistantAskedToFind = recent.some(
    (message) =>
      message.role === "assistant" &&
      typeof message.content === "string" &&
      /\b(find|look up|search).{0,50}\b(event|calendar|appointment)\b/i.test(
        message.content,
      ),
  );
  const hasRecentRemovalRequest = recent.some(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      /\b(remove|delete|cancel|take off)\b/i.test(message.content),
  );
  return isLookupFollowUp && assistantAskedToFind && hasRecentRemovalRequest;
}
