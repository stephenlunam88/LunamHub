# ChatGPT connection

LunamHub exposes a remote MCP endpoint at `https://lunamhub.swimforge.com.au/mcp` for ChatGPT. It uses OAuth 2.1 authorization code + PKCE; it does not use an OpenAI API key.

## Enable it

The production environment must have a strong `APP_PASSWORD` and `SESSION_SECRET`. Set `MCP_PUBLIC_URL` to the exact public HTTPS origin (defaults to `https://lunamhub.swimforge.com.au`). The API creates its OAuth tables on startup. The web Nginx config proxies `/mcp`, OAuth endpoints, and OAuth discovery URLs to the API. Without `APP_PASSWORD`, the MCP integration fails closed.

Once this code is deployed, each ChatGPT account can add a custom MCP server using the `/mcp` URL and authorize it with the household password. Review the requested permissions on the LunamHub consent page. Connections are separate in ChatGPT, but they represent the same shared household and have the permissions approved for that connection; the current app does not provide per-person roles beyond the household password.

## Tools

- `get_profile` identifies the connected LunamHub household.
- `list_family_members` returns names and IDs for assignment.
- `list_calendar_events` reads calendar events in a date range, expanding recurring series into occurrences.
- `create_calendar_event` creates an event and uses LunamHub's existing Google Calendar sync when connected.
- `list_chores` reads active chore templates.
- `create_chore` creates a chore using LunamHub's existing template and instance generation.

OAuth permissions are scoped separately for household member lookup, calendar reads/writes, and chore reads/writes. Access and refresh tokens are stored as hashes; OAuth client secrets are encrypted using `SESSION_SECRET`.

This is a private household connector, not a publicly submitted ChatGPT app. After deployment, test OAuth discovery, consent, token refresh/revocation, and each tool through the ChatGPT connector or MCP Inspector before relying on it for family scheduling.
