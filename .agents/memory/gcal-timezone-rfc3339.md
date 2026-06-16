---
name: GCal timezone — send UTC to bypass proxy stripping
description: Replit's Google Calendar proxy strips timezone offsets from dateTime strings. Must convert local→UTC on the server and send a Z-suffix UTC string.
---

## Rule
When creating or updating Google Calendar events via the Replit connectors-sdk proxy, **convert the local time to UTC on the server** and send the `dateTime` as a `Z`-suffix UTC string. Do NOT send a local time with a `+HH:MM` offset.

**Wrong — proxy strips the +10:00 offset, GCal treats string as UTC:**
```json
{ "dateTime": "2026-06-16T18:45:00+10:00" }
```
Proxy strips `+10:00` → GCal receives `"2026-06-16T18:45:00"` → stores UTC 18:45 = AEST 04:45 next day.

**Wrong — a separate timeZone field is completely ignored by the proxy:**
```json
{ "dateTime": "2026-06-16T18:45:00", "timeZone": "Australia/Sydney" }
```

**Correct — server converts local→UTC, sends unambiguous UTC:**
```json
{ "dateTime": "2026-06-16T08:45:00Z" }
```
Even if proxy strips the `Z`, GCal receives `"2026-06-16T08:45:00"` floating → stores UTC 08:45 → displays as 18:45 AEST ✓

## How to apply
Use `localTimeToUTC(dateStr, timeStr, timezone)` in `google-calendar.ts`.

Algorithm:
1. Probe `new Date(`${dateStr}T12:00:00Z`)` in target timezone with `Intl.DateTimeFormat` `timeZoneName: "longOffset"` → get `"GMT+10:00"` style string
2. Parse sign + hours + minutes → `offsetMinutes`
3. UTC = `Date.UTC(year, month-1, day, hours, minutes) - offsetMinutes * 60_000`
4. Format result as `"YYYY-MM-DDTHH:MM:00Z"`

The browser sends its IANA timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) as a `timezone` field in the request body. The route handler extracts it (does NOT insert into DB) and passes it to `createGCalEvent`/`updateGCalEvent`.

**Why:**
Confirmed by server logs — embedding `+10:00` in the dateTime string produced the same wrong result as a floating datetime (stored at UTC 18:45 instead of UTC 08:45). The Replit connectors-sdk proxy strips any timezone suffix from dateTime strings before forwarding to Google Calendar.

## Sync-back
During GCal sync, GCal returns events as `"2026-06-16T18:45:00+10:00"` (local time with offset). The `stripTzSuffix` helper in `gcalToLocal` strips `[+-]\d{2}:\d{2}$` to extract the local time portion (`"2026-06-16T18:45:00"`), then splits on `T` to get date and time. This is correct — GCal returns events in the calendar's local timezone.

The sync intentionally does NOT overwrite date/time of existing local events — only title/description — because the round-trip is reliable: local event → UTC to GCal → GCal returns local time → local event date/time unchanged.
