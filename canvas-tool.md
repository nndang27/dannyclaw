# Canvas Tool API (`canvas-tool.ts`)

## File Purpose
The `canvas` tool isn't a traditional web browser. Instead, it seems to be an interactive OpenClaw UI/Canvas renderer that the LLM can push visual states to, or read states from. It uses the same RPC gateway infrastructure (`node.invoke`) as the `nodes` and `browser` proxy tools.

## Key Functions (Inputs/Outputs)
- **`present` & `hide`**: Commands the local (or remote node) UI to present a specific layout or `url`.
- **`eval`**: Allows the LLM to execute raw JavaScript (`javaScript` string) directly within the context of the running canvas. It returns the text output of the evaluation.
- **`snapshot`**: Asks the canvas renderer to take a visual snapshot (JPEG/PNG). Similar to `browser screenshot`, returning an `imageResult` containing a local `filePath` and `base64` representation for the LLM to "see" its own UI.
- **`a2ui_push` & `a2ui_reset`**: Pushes A2UI (Agent to User Interface) JSONL schemas. This looks like a declarative UI framework used by OpenClaw where the Agent streams JSON definitions of buttons, forms, and charts, and the canvas renders them.

## Relationship to the `browser` tool
The `canvas` tool uses the exact same `callGatewayTool("node.invoke")` mechanism that the `browser` tool relies on when proxying commands to remote nodes.

While `browser` is for manipulating external web pages (DOM, Chromium), `canvas` is for controlling the Agent's *own* user interface presented to the human. Both return images (via `snapshot`) that feed into the Vision Language Model (VLM) for multimodal grounding.
