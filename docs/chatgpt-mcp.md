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
- `read_lunamhub_api` reads supported household APIs, including family, dashboard, lists, meals, routines, rewards, points, badges, Games Night, and weather.
- `write_lunamhub_api` creates or updates supported household data with POST, PATCH, or PUT.
- `delete_lunamhub_api` deletes a specific household item through a supported DELETE endpoint.

The general API tools are restricted to household feature routes. Authentication, settings and secrets, Google account connections, camera/avatar uploads, and file storage remain unavailable through MCP. Read, write, and delete permissions are separate OAuth scopes (`api:read`, `api:write`, and `api:delete`). A connection that predates these scopes must reconnect and approve them. Access and refresh tokens are stored as hashes; OAuth client secrets are encrypted using `SESSION_SECRET`.

The API tools execute writes when called; the MCP client may ask for its own approval. The assistant must only delete an identified item after a clear user request, and must clarify whether a recurring calendar event means one occurrence or the entire series.

## Lists

- Read `/lists` to resolve the current list ID. Read `/lists/{id}` for the list and its items, or `/lists/{id}/items` for just the items.
- Create a list with `POST /lists` and a body such as `{"name":"Shopping","category":"grocery"}`. Category can be `grocery`, `packing`, `school`, `reminders`, or `other`; omitting it defaults to `other`.
- Add an item with `POST /lists/{id}/items` and `{"text":"Milk"}`.
- Delete the entire list and all its items with `DELETE /lists/{id}`. Delete one item with `DELETE /lists/{id}/items/{itemId}`. Missing IDs return 404, and item updates/deletions must use the item's actual parent list.

The Lists screen refreshes every 15 seconds while open so changes made through ChatGPT appear without a manual reload.

The list/MCP regression test uses an isolated PostgreSQL database and creates and drops only its own randomly named schema. Run it with `LISTS_TEST_DATABASE_URL` pointing to a disposable test database: `pnpm --filter @workspace/api-server exec node --import tsx --test test/lists.test.ts`.

This is a private household connector, not a publicly submitted ChatGPT app. After deployment, test OAuth discovery, consent, token refresh/revocation, and each tool through the ChatGPT connector or MCP Inspector before relying on it for family scheduling.
