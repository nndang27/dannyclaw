# Image Tool API (`image-tool.ts`)

## File Purpose
The `image` tool is the Vision Language Model (VLM) ingestion pipeline for OpenClaw. It allows the agent to pass image paths or URLs to a vision-capable LLM for analysis. This is a critical component for the browser automation ecosystem because it consumes the visual output of the `browser` and `canvas` tools.

## Key Functions (Inputs/Outputs)
- **Model Resolution (`resolveImageModelConfigForTool`)**: Dynamically attempts to pair the current primary model with an equivalent image-capable model (e.g. if using `openai` it tries to find `gpt-5-mini` or `gpt-4o`, if `anthropic` it uses `claude-opus`).
- **Input Normalization**:
  - The tool accepts an `image` (string) or `images` (array) parameter. 
  - These can be `file://` URLs, `http(s)` URLs, `data:image/png;base64,...`, or pseudo-URIs pointing to local paths.
- **Media Loading (`loadWebMedia`)**: 
  - Resolves the references using `resolveSandboxedBridgeMediaPath` or general `resolveUserPath`.
  - Converts images into base64 encoded strings (`buffer.toString("base64")`) and determines their exact `mimeType` (`image/png`, `image/jpeg`).
- **Prompt Execution (`runImagePrompt` -> `complete()`)**:
  - Constructs an `@mariozechner/pi-ai` `Context` array with `{ type: "image", data: base64, mimeType }`.
  - Dispatches the API completion payload with the user's `prompt` (default: "Describe the image.").

## The Browser/Image Workflow Pipeline
When the user asks the agent to interact with a remote browser visually, the ecosystem operates in a multi-step chain:
1. Agent commands the `browser` tool: `action="screenshot"`.
2. The `browser` proxy asks the Gateway/Host to render a snapshot.
3. The `browser` tool parses the result and outputs a formatted string such as `MEDIA:/tmp/screenshot-xyz.png`.
4. The Agent sees this response, recognizes the local file path, and immediately commands the `image` tool, providing the `MEDIA:<path>` string as the `image` argument.
5. `image-tool.ts` dynamically loads the local file, base64 encodes it, and sends it to the vision LLM, bridging the gap between raw backend DOM manipulation and semantic visual understanding.
