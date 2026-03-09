# NanoClaw Architecture: Claude Agent SDK Integration

This guide provides a deep dive into how NanoClaw tightly integrates the proprietary `@anthropic-ai/claude-agent-sdk` to execute LLM agent reasoning natively within a container. Unlike OpenClaw which builds a custom loop, NanoClaw relies on Claude's built-in advanced abstractions.

---

## 1. SDK INITIALIZATION & CONFIGURATION

NanoClaw initializes the Claude Agent SDK inside the container runner process. The core configuration and initialization happen inside:
- `container/agent-runner/src/index.ts`

### Code Implementation
Rather than exposing all environment variables directly to the shell tools where subprocesses might leak keys, NanoClaw explicitly builds an isolated `sdkEnv` object that gets passed to the SDK. 

```typescript
// container/agent-runner/src/index.ts
// Build SDK env: merge secrets into process.env for the SDK only.
// Secrets never touch process.env itself, so Bash subprocesses can't see them.
const sdkEnv: Record<string, string | undefined> = { ...process.env };
for (const [key, value] of Object.entries(containerInput.secrets || {})) {
  sdkEnv[key] = value;
}
```

This `sdkEnv` dictionary is then directly injected during query execution, keeping system processes secure while the AI retains access to essential credentials (like `ANTHROPIC_API_KEY`).

---

## 2. PROMPT INGESTION & CONTEXT (MEMORY)

Instead of transforming conversations into NDJSON role-based schema payloads (like Ollama), NanoClaw handles memory ingestion by leveraging stdin capabilities and continuous text streaming schemas provided by Anthropic's SDK.

### Code Implementation
The initial prompt payload is received via `readStdin()`. It's buffered into an asynchronous `MessageStream` iterator.

Then, NanoClaw checks for contextual `CLAUDE.md` files mounted into the workspace and dynamically injects them into the agent's `systemPrompt` configuration.

```typescript
// container/agent-runner/src/index.ts
// Load global CLAUDE.md as additional system context (shared across all groups)
const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
let globalClaudeMd: string | undefined;
if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
  globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
}

// Inside the query() options block:
systemPrompt: globalClaudeMd
  ? { type: 'preset' as const, preset: 'claude_code' as const, append: globalClaudeMd }
  : undefined,
```
This enables flexible prompt conditioning across distinct isolated runtime environments without needing to mangle the chat history structures explicitly.

---

## 3. TOOL (CÁNH TAY) DEFINITIONS & MCP INTEGRATION

Unlike OpenClaw where custom tool wrappers are constructed and funneled back natively through Ollama schemas, NanoClaw heavily leverages native Claude capacities alongside the standardized Model Context Protocol (MCP).

### Code Implementation - Built-in Tools
Built-in tooling for file access, bash commands, and web operations are natively enabled directly in the `allowedTools` array inside `query()` configuration:

```typescript
// container/agent-runner/src/index.ts
allowedTools: [
  'Bash',
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'WebSearch', 'WebFetch',
  'Task', 'TaskOutput', 'TaskStop',
  'TeamCreate', 'TeamDelete', 'SendMessage',
  'TodoWrite', 'ToolSearch', 'Skill',
  'NotebookEdit',
  'mcp__nanoclaw__*'
],
```

### Code Implementation - Custom MCP Servers
NanoClaw connects specific logical tools (like Telegram database messaging or scheduled tasks) via an internally hosted standard STDIO MCP server located in `container/agent-runner/src/ipc-mcp-stdio.ts`.

It launches this local MCP server within `index.ts`:

```typescript
// container/agent-runner/src/index.ts
mcpServers: {
  nanoclaw: {
    command: 'node',
    args: [mcpServerPath],
    env: {
      NANOCLAW_CHAT_JID: containerInput.chatJid,
      NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
      NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
    },
  },
},
```

In `ipc-mcp-stdio.ts`, these unique tools are cleanly orchestrated:

```typescript
// container/agent-runner/src/ipc-mcp-stdio.ts
server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running...",
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name...'),
  },
  async (args) => {
    // Write message into IPC payload mapping back to host processing
  }
);
```

---

## 4. THE PROPRIETARY EXECUTION LOOP (CRITICAL)

The most structurally distinct aspect from OpenClaw is the execution loop. OpenClaw relies entirely on a custom `While (Not Done)` logic to iterate responses back and forth to Ollama. NanoClaw offloads this complexity completely to the `@anthropic-ai/claude-agent-sdk`.

### Code Implementation
Anthropic's SDK exports a native continuous `query()` iterator block. Tool calling limits, tool-calling response packing, and error recovery sequences are completely abstracted away from developers under a simple `for await` traversal.

```typescript
// container/agent-runner/src/index.ts
for await (const message of query({
  prompt: stream,
  options: {
    // ... config
  }
})) {
  messageCount++;
  
  // Track continuous session changes under the hood 
  if (message.type === 'system' && message.subtype === 'init') {
    newSessionId = message.session_id;
  }

  // Intercept the conclusive "result" emission to stream out context back 
  // to the main process runner while keeping inner tool chains totally obscured from the user 
  if (message.type === 'result') {
    resultCount++;
    const textResult = 'result' in message ? (message as { result?: string }).result : null;
    
    writeOutput({
      status: 'success',
      result: textResult || null,
      newSessionId
    });
  }
}
```

The underlying mechanism hides reasoning logic within Claude API boundaries. If Claude calls `Bash`, the SDK spins up the process, validates output, feeds it straight back into the chat history, and loops again—only returning the final textual result marked as `message.type === 'result'` to NanoClaw's output stream, completely bypassing manual function-callback orchestration.
