# Browser Client REST Wrappers (`browser/client.ts`)

## File Purpose
This file contains the core HTTP wrappers that the browser tool uses to talk to the actual browser control server. These functions are unaware of LLM tool schemas and exist purely to serialize TypeScript function calls into HTTP `GET`, `POST`, and `DELETE` requests.

## Key Functions (Inputs/Outputs)
- **`browserStatus(baseUrl)`**: Hits `GET /` to fetch the status of the browser (running, profile, cdpPort, headless, etc.).
- **`browserProfiles(baseUrl)`**: Hits `GET /profiles` to list all available browser profiles (including OpenClaw isolated vs. Chrome extension).
- **`browserStart`, `browserStop`, `browserCreateProfile`, `browserDeleteProfile`**: Server state management points.
- **`browserOpenTab`, `browserCloseTab`, `browserFocusTab`, `browserTabs`**: Interacts with the `/tabs` and `/tabs/open` REST endpoints to manage active browser tabs.
- **`browserSnapshot(baseUrl, opts)`**:
  - **Inputs**: Formatting options (`aria` vs `ai`), `targetId`, `limit` limits for DOM chunks.
  - **Outputs**: Hits `GET /snapshot?format=ai&limit=...` and returns the `SnapshotResult` containing the serialized HTML or simplified accessibility tree (ARIA nodes).

## Dependencies
- `./client-fetch.js`: Handles the raw HTTP `fetch` logic using Node.js `undici` or `fetch`, providing timeout mechanics.
