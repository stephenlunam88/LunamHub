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
  const hasDateOrTime =
    /\b(today|tonight|tomorrow|yesterday|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(
      latestUser.content,
    ) ||
    /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i.test(latestUser.content) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(latestUser.content);

  const explicitRemoval = /\b(remove|delete|cancel|take off)\b/i.test(
    latestUser.content,
  );
  const impliedRemoval =
    /\b(?:doesn['’]t have|does not have|no longer has|isn['’]t having|is not having)\b.{0,120}\banymore\b/i.test(
      latestUser.content,
    ) ||
    /\b(?:no longer needed|isn['’]t happening|is not happening|has been cancelled|has been canceled)\b/i.test(
      latestUser.content,
    );
  if (
    (explicitRemoval && (hasCalendarTarget || hasDateOrTime)) ||
    impliedRemoval
  )
    return true;
  if (!hasCalendarTarget) return false;

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
