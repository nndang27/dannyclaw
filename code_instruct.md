# NanoClaw vs OpenClaw: Structural Code Mapping

This guide provides a rigorous 1-to-1 code translation mapping between NanoClaw (relying on the Claude Agent SDK) and OpenClaw (relying on local stateless LLMs like Ollama). 

---

### MODEL INITIALIZATION & CONNECTION

**NanoClaw (Claude SDK) Implementation:**
```typescript
// container/agent-runner/src/index.ts
const sdkEnv: Record<string, string | undefined> = { ...process.env };
for (const [key, value] of Object.entries(containerInput.secrets || {})) {
  sdkEnv[key] = value;
}

for await (const message of query({
  prompt: stream,
  options: {
    // ...
    env: sdkEnv,
  }
})) {
  // ...
}
```

**OpenClaw (Ollama Local) Equivalent:**
```typescript
// src/agents/ollama-stream.ts
export function resolveOllamaBaseUrlForRun(params: {
  modelBaseUrl?: string;
  providerBaseUrl?: string;
}): string {
  const providerBaseUrl = params.providerBaseUrl?.trim();
  if (providerBaseUrl) return providerBaseUrl;
  const modelBaseUrl = params.modelBaseUrl?.trim();
  if (modelBaseUrl) return modelBaseUrl;
  return OLLAMA_NATIVE_BASE_URL;
}

// Inside createOllamaStreamFn:
const response = await fetch(chatUrl, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
  signal: options?.signal,
});
```

**Architectural Translation Notes:** 
NanoClaw securely packages environment variables (API secrets) into `sdkEnv` and passes them entirely out-of-sight into Claude's `query()` SDK block to let the SDK broker HTTPS sessions to Anthropic securely.
OpenClaw operates explicitly over local socket ports, meaning it strips out the SDK container bindings entirely and handles raw connection URIs natively via a raw NodeJS HTTP `fetch` adapter block directed straight at the Ollama API interface.

---

### INPUT PROMPT & MEMORY INGESTION

**NanoClaw (Claude SDK) Implementation:**
```typescript
// container/agent-runner/src/index.ts
// Load global CLAUDE.md as additional system context (shared across all groups)
const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
let globalClaudeMd: string | undefined;
if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
  globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
}

// Inside query() options:
systemPrompt: globalClaudeMd
  ? { type: 'preset' as const, preset: 'claude_code' as const, append: globalClaudeMd }
  : undefined,
```

**OpenClaw (Ollama Local) Equivalent:**
```typescript
// src/agents/ollama-stream.ts
export function convertToOllamaMessages(
  messages: Array<{ role: string; content: unknown }>,
  system?: string,
): OllamaChatMessage[] {
  const result: OllamaChatMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    const { role } = msg;
    if (role === "user") {
      const text = extractTextContent(msg.content);
      const images = extractOllamaImages(msg.content);
      result.push({ role: "user", content: text, ...(images.length > 0 ? { images } : {}) });
    } else if (role === "assistant") {
      const text = extractTextContent(msg.content);
      const toolCalls = extractToolCalls(msg.content);
      result.push({ role: "assistant", content: text, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) });
    }
    // ...
  }

  return result;
}
```

**Architectural Translation Notes:** 
NanoClaw relies on Anthropic's continuous dynamic `MessageStream` and the SDK's native schema format, feeding it system prompts like `CLAUDE.md` through an abstracted `preset: 'claude_code'` layer.
OpenClaw requires a manual serialization transformer function (`convertToOllamaMessages`) to unpack the core Node.js application state down into simpler flattened role-based NDJSON payloads expected natively by Ollama's chat endpoint.

---

### BUILT-IN TOOLS REIMPLEMENTATION (CRITICAL)

**NanoClaw (Claude SDK) Implementation:**
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

**OpenClaw (Ollama Local) Equivalent:**
```typescript
// src/agents/pi-tools.ts
export function createOpenClawCodingTools(...) {
  const base = (codingTools as unknown as AnyAgentTool[]).flatMap((tool) => {
    // Replaces the "Read" allowedTool
    if (tool.name === readTool.name) {
      if (sandboxRoot) {
        return [ createSandboxedReadTool({ root: sandboxRoot, bridge: sandboxFsBridge! }) ];
      }
      return [ createOpenClawReadTool(createReadTool(workspaceRoot)) ];
    }
  });

  const execTool = createExecTool({ ... }); // Replaces the "Bash" allowedTool

  const tools: AnyAgentTool[] = [
    ...base,
    execTool as unknown as AnyAgentTool,
    processTool as unknown as AnyAgentTool,
    // ... further mappings ...
  ];
  return tools;
}

// src/agents/bash-tools.exec-runtime.ts ('Bash' Schema Equivalent)
export const execSchema = Type.Object({
  command: Type.String({ description: "Shell command to execute" }),
  workdir: Type.Optional(Type.String({ description: "Working directory (defaults to cwd)" })),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  yieldMs: Type.Optional(
    Type.Number({ description: "Milliseconds to wait before backgrounding (default 10000)" })
  ),
  background: Type.Optional(Type.Boolean({ description: "Run in background immediately" })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, kills process on expiry)" })),
  pty: Type.Optional(Type.Boolean({ description: "Run in a pseudo-terminal (PTY) when available" }))
});
```

**Architectural Translation Notes:** 
NanoClaw invokes Claude's native built-in capabilities by merely passing "magic strings" in an array (like `'Bash'` and `'Read'`), counting on the SDK to automatically generate exact tool bindings inside its safe internal execution context. 
Since Ollama has no default native tools, OpenClaw has to build and inject the exact functional equivalencies explicitly via Typescript structures (like Typescript `@sinclair/typebox` mappings, shown in `execSchema` for Bash), manually bridging file system operations (like `createSandboxedReadTool`) entirely from scratch.

---

### THE EXECUTION LOOP (THE ENGINE)

**NanoClaw (Claude SDK) Implementation:**
```typescript
// container/agent-runner/src/index.ts
for await (const message of query({
  prompt: stream,
  options: {
    // ... config
  }
})) {
  if (message.type === 'system' && message.subtype === 'init') {
    newSessionId = message.session_id;
  }
}
```

**OpenClaw (Ollama Local) Equivalent:**
```typescript
// src/agents/ollama-stream.ts
for await (const chunk of parseNdjsonStream(reader)) {
  if (chunk.message?.content) {
    accumulatedContent += chunk.message.content;
  }

  // Intercepting and accumulating function requests
  if (chunk.message?.tool_calls) {
    accumulatedToolCalls.push(...chunk.message.tool_calls);
  }

  if (chunk.done) {
    finalResponse = chunk;
    break;
  }
}

const hasToolCalls = toolCalls && toolCalls.length > 0;
// Intersects flow, signaling upstream orchestrators to process the actual functions.
const stopReason: StopReason = hasToolCalls ? "toolUse" : "stop";

stream.push({
  type: "done",
  reason: stopReason,
  message: assistantMessage,
});
```

**Architectural Translation Notes:** 
NanoClaw utilizes the `@anthropic-ai/claude-agent-sdk` to encapsulate the back-and-forth iteration of AI reasoning automatically under the hood within the `query(...)` abstraction blocks.
By contrast, OpenClaw operates an active iterative stream parser (`parseNdjsonStream(reader)`). When it parses a chunk mapped to a `.tool_calls`, OpenClaw intercepts the cycle directly with a forced `stopReason: "toolUse"` hook, driving its own custom local engine wrapper rather than relying on automated SDK tool callbacks.

---

### OUTPUT EXTRACTION

**NanoClaw (Claude SDK) Implementation:**
```typescript
// container/agent-runner/src/index.ts
if (message.type === 'result') {
  resultCount++;
  const textResult = 'result' in message ? (message as { result?: string }).result : null;
  writeOutput({
    status: 'success',
    result: textResult || null,
    newSessionId
  });
}
```

**OpenClaw (Ollama Local) Equivalent:**
```typescript
// src/agents/ollama-stream.ts
const text =
  response.message.content || response.message.thinking || response.message.reasoning || "";
if (text) {
  content.push({ type: "text", text });
}

const reason: Extract<StopReason, "stop" | "length" | "toolUse"> =
  assistantMessage.stopReason === "toolUse" ? "toolUse" : "stop";

stream.push({
  type: "done",
  reason,
  message: assistantMessage,
});
// When 'reason' is 'stop', OpenClaw has finalized the terminal sequence.
```

**Architectural Translation Notes:** 
Because NanoClaw trusts the nested internal engine to handle loop completion natively, it only monitors isolated system `result` event dispatches, fully bypassing the raw text responses representing internal thought patterns.
Conversely, OpenClaw must proactively check that `hasToolCalls` has resolved entirely to explicitly finalize the session loop (via `stopReason === "stop"`) before it can confirm the last streamed response actually represents the end terminal output to be processed.
