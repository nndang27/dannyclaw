# Browser Tool Client API (`browser-tool.ts`)

## File Purpose
`browser-tool.ts` acts as the primary LLM tool entry point for the OpenClaw `browser` capability. It defines the JSON schema for LLMs to generate actions and acts as the main dispatcher.

It handles proxying logic: it decides whether the browser command should be executed locally on the host, inside a secure sandbox container, or remotely forwarded to a connected node (`browser.proxy`).

## Key Functions (Inputs/Outputs)
1. **`createBrowserTool(opts)`**:
   - **Inputs**: Options for the sandbox bridge URL and host control policies.
   - **Outputs**: Returns the `AnyAgentTool` structure defining the name (`browser`), description, and schema.

2. **`execute(_toolCallId, args)`**:
   - Switches based on `action` from the schema (e.g., `open`, `act`, `snapshot`, `upload`).
   - Resolves target routing via `resolveBrowserNodeTarget()` and `resolveBrowserBaseUrl()`.
   - If proxying to a node, routes the command via `callBrowserProxy()` using `node.invoke` REST calls.
   - If local/sandbox, imports and uses standard wrappers from `../../browser/client.js` or `browser-tool.actions.js`.

3. **`executeActAction()` / `executeSnapshotAction()` (from `browser-tool.actions.ts`)**:
   - **Inputs**: The payload for snapshotting (format, limit) or acting (kind: click, fill, targetId).
   - **Outputs**: Formats the Playwright result back into an `AgentToolResult<unknown>`. It heavily uses `wrapExternalContent()` to sanitize HTML/JSON outputs from the browser so they don't break the LLM's context.

## Dependencies
- `@sinclair/typebox`: Defines the tool arguments.
- `../../browser/client.js` & `../../browser/client-actions.js`: Lower-level fetch wrappers calling the actual server REST endpoints.
- `callGatewayTool`: The RPC dispatcher for Node proxy requests.
- `imageResultFromFile`: Wraps screenshot/snapshot outputs into visual VLM format arrays.
