---
name: Replit connectors-sdk proxy path
description: Correct proxy path format for @replit/connectors-sdk with Google Calendar (and likely other Google connectors)
---

# Replit connectors-sdk proxy path format

## The rule

When calling `connectors.proxy("google-calendar", path, options)`, the path must:

1. Start with `/calendar/v3/` (the Google Calendar API path prefix)
2. Include `headers: { "Connection-Id": "<conn_id>" }` in options

**Why:** The proxy at `connectors.replit.com/api/v2/proxy` forwards the path as-is to the upstream Google API. It does NOT prepend `https://www.googleapis.com/calendar/v3` — instead the path itself must include `/calendar/v3/`. Without the `Connection-Id` header the proxy returns 400; with wrong path Google returns HTML 404.

**How to apply:** For any Google Calendar proxy call:
```ts
connectors.proxy("google-calendar", "/calendar/v3/calendars/primary/events?...", {
  method: "GET",
  headers: { "Connection-Id": CONN_ID },
});
```

## What does NOT work

- Path `/users/me/calendarList` → Google 404 (missing prefix)
- Path `/calendars/primary/events` → Google 404 (missing prefix)  
- Full URL `https://www.googleapis.com/...` → Google 404 (resolveProxyTarget strips to path)
- `Connector-Name: google-calendar` header instead of `Connection-Id` → proxied but Google 404
- `connectors.replit.com/api/v2/proxy` without auth → returns 400 "Connector-Name or Connection-Id required"

## The hardcoded connection ID

`conn_google-calendar_01KV6ZVBT2KG2NVAWJ8RJV9R6A` — set at integration time. If the user reconnects Google Calendar, this ID will change and `google-calendar.ts` must be updated.

## SDK version

`@replit/connectors-sdk@0.4.1` — proxy method sends to `${baseUrl}/api/v2/proxy${path}` with auth headers built from `replit identity create` CLI or `REPL_IDENTITY` env var.
