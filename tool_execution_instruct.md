# Tool Execution Logic Mapping (NanoClaw vs OpenClaw)

This document extracts the exact Node.js execution logic powering the tools in OpenClaw, showing how Ollama's tool requests are processed locally by the Node.js runtime, as opposed to Claude SDK execution in NanoClaw.

---

### 1. BASH / EXECUTION LOGIC

**Tool Handling in OpenClaw:**
OpenClaw uses a custom `ProcessSupervisor` leveraging `node:child_process` to spawn and manage shell processes securely, handling PTY, timeouts, background execution, and stream parsing.

**Execution Code:**
```typescript
// src/process/supervisor/adapters/child.ts
export async function createChildAdapter(params: {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  windowsVerbatimArguments?: boolean;
  input?: string;
  stdinMode?: "inherit" | "pipe-open" | "pipe-closed";
}): Promise<ChildAdapter> {
  // ... Setup arguments and standard OpenClaw execution environment 
  const useDetached = process.platform !== "win32" && !isServiceManagedRuntime();

  const options: SpawnOptions = {
    cwd: params.cwd,
    env: params.env ? toStringEnv(params.env) : undefined,
    stdio: ["pipe", "pipe", "pipe"],
    detached: useDetached,
    windowsHide: true,
    windowsVerbatimArguments: params.windowsVerbatimArguments,
  };

  const spawned = await spawnWithFallback({
    argv: resolvedArgv,
    options,
    // ...
  });

  const child = spawned.child as ChildProcessWithoutNullStreams;
  
  // Binding output streams back to the tool stream
  const onStdout = (listener: (chunk: string) => void) => {
    child.stdout.on("data", (chunk) => {
      listener(chunk.toString());
    });
  };

  // ...
}
```
*Note: The orchestrator in `src/agents/bash-tools.exec-runtime.ts` wraps this adapter via `supervisor.spawn({ ...mode: "child", argv: childArgv })` or `mode: "pty"`, capturing `stdout` to return as `AgentToolResult`.*

---

### 2. FILE SYSTEM OPERATIONS (READ/WRITE)

**Tool Handling in OpenClaw:**
Filesystem reads and writes are encapsulated behind safe bounds-checking utilities (`openFileWithinRoot`, `writeFileWithinRoot`) to prevent directory traversal and symlink exploits inside the sandbox.

**Execution Code (Read & Write Wrappers):**
```typescript
// src/agents/pi-tools.read.ts
function createSandboxReadOperations(params: SandboxToolParams) {
  return {
    readFile: (absolutePath: string) =>
      params.bridge.readFile({ filePath: absolutePath, cwd: params.root }),
    // ...
  } as const;
}

// src/infra/fs-safe.ts (The actual Node.js runtime filesystem logic)
export async function openFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
}): Promise<SafeOpenResult> {
  const { rootWithSep, resolved } = await resolvePathWithinRoot(params);
  let opened = await openVerifiedLocalFile(resolved);

  if (!isPathInside(rootWithSep, opened.realPath)) {
    await opened.handle.close().catch(() => {});
    throw new SafeOpenError("outside-workspace", "file is outside workspace root");
  }
  return opened;
}

export async function writeFileWithinRoot(params: {
  rootDir: string;
  relativePath: string;
  data: string | Buffer;
}): Promise<void> {
  const target = await openWritableFileWithinRoot({
    rootDir: params.rootDir,
    relativePath: params.relativePath,
  });
  
  // Atomic Temp Write
  const tempPath = buildAtomicWriteTempPath(target.openedRealPath);
  await writeTempFileForAtomicReplace({ tempPath, data: params.data, mode: 0o600 });
  await fs.rename(tempPath, target.openedRealPath);
}
```

---

### 3. WEB SEARCH / FETCH LOGIC

**Tool Handling in OpenClaw:**
OpenClaw implements `Web Fetch` via an internal pipeline that handles raw `fetch`, checks SSRF (Server Side Request Forgery) guardrails, and extracts readable content via Readability or Firecrawl. Web Search operations are often mapped to `qmd` memory tools or direct `Firecrawl` API calls.

**Execution Code:**
```typescript
// src/agents/tools/web-fetch.ts
export async function fetchFirecrawlContent(params: {
  url: string;
  extractMode: ExtractMode;
  apiKey: string;
  baseUrl: string;
  // ...
}) {
  const endpoint = resolveFirecrawlEndpoint(params.baseUrl);
  const body = { url: params.url, formats: ["markdown"], /* ... */ };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Timeout limits model stalls
    signal: withTimeout(undefined, params.timeoutSeconds * 1000), 
  });

  const payload = await res.json();
  const rawText = typeof payload.data?.markdown === "string" ? payload.data.markdown : "";
  const text = params.extractMode === "text" ? markdownToText(rawText) : rawText;

  return { text, title: payload.data?.metadata?.title /* ... */ };
}
```

---

### 4. MCP CLIENT WORKAROUND (Crucial Translation)

**NanoClaw Context:**
NanoClaw uses the `@anthropic-ai/claude-agent-sdk` to transparently spin up an MCP (Model Context Protocol) Session by hooking `ipc-mcp-stdio.ts` into `mcpServers:` config. When the model invokes `mcp__nanoclaw__Search`, the SDK parses JSON-RPC over `stdio` behind the scenes.

**OpenClaw Workaround & Translation:**
Because OpenClaw relies on standard Open Source / Generic tool specifications (using JSON Schema definitions via Ollama), it **does not use the generic Anthropic MCP Client SDK natively for automated bridging**. 
Instead, OpenClaw features a dedicated **translating gateway / ACP gateway** (`src/acp/translator.ts`) which maps native custom tools into ACP (Agent Client Protocol) and handles external sessions natively.

If you are replacing NanoClaw MCP tools directly in an OpenClaw fork, you perform **Direct Function Mapping**, adding them natively into `src/agents/pi-tools.ts` rather than spawning a separate Node standard I/O process:

**OpenClaw Dynamic Tool Dispatch Pattern:**
```typescript
// In the execution loop of OpenClaw (src/agents/ollama-stream.ts)
for await (const chunk of parseNdjsonStream(reader)) {
  if (chunk.message?.tool_calls) {
    // 1. Array of tool calls parsed natively by Ollama
    accumulatedToolCalls.push(...chunk.message.tool_calls);
  }
}

// Upstream Orchestration equivalent dispatch:
for (const toolCall of accumulatedToolCalls) {
  // 2. OpenClaw maps the custom name matched against the injected Tools Array
  const toolConf = registeredTools.find(t => t.name === toolCall.function.name);
  
  // 3. Directly executes custom async functions internally (bypassing JSON-RPC MCP complexity)
  if (toolConf) {
     const result = await toolConf.execute(toolCall.id, toolCall.function.arguments);
     stream.push(result);
  }
}
```
*Takeaway:* To implement custom NanoClaw MCP tools (`Task`, `TeamCreate`, `Search`) in OpenClaw, you will need to bypass the `ipc-mcp-stdio.ts` server completely. Instead, port the exact controller logic of those tools directly into standard Typescript functions inside OpenClaw, wrap them in JSON Schema, and append them to the `createOpenClawCodingTools` factory return array.
