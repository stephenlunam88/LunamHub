# LunamHub mobile assistant

The Family Assistant page is available at `/assistant` in the LunamHub web app and is designed for phones and Home Screen bookmarks. It reuses the MCP household tools for family lookup, calendar reads/writes, and chore creation. Write actions are held for an explicit in-app confirmation.

Chat and optional voice transcription use the OpenAI API directly. This is separate from a ChatGPT subscription and requires API billing. In LunamHub, open **Parent Area → Connections → LunamHub Assistant** to enter the key and the model enabled for your API account. The key is encrypted in the database and is never returned to the browser. Keep `SESSION_SECRET` stable: it is used to encrypt and decrypt the saved key. Back up the database and `.env` together.

Alternatively, set `OPENAI_API_KEY` and `OPENAI_MODEL` in the server's ignored `.env`; these are used as fallbacks when no in-app values are saved.

Never share the API key in chat. Voice recordings are sent to OpenAI for transcription; recognized text is placed in the composer so the user can review it before sending. Conversation history is held in the browser for the current page session and sent to the API with each turn; it is not stored in the LunamHub database.
