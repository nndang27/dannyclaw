# Nodes Tool API (`nodes-tool.ts`)

## File Purpose
The `nodes` tool is a high-level orchestration interface for communicating with remote devices (companion apps or node hosts) paired to the OpenClaw gateway. It is fundamentally an RPC (Remote Procedure Call) dispatcher.

Crucially, this is the infrastructure that allows the `browser` tool to manipulate web pages running on entirely different physical machines (e.g., executing a Playwright script on a remote Raspberry Pi).

## Key Functions (Inputs/Outputs)
- **`invokeNodeCommandPayload`**: Core underlying wrapper that POSTs a `node.invoke` command to the OpenClaw Gateway.
- **Node Management (`status`, `describe`, `pending`, `approve`)**: Commands to pair new physical devices (like phones or other PCs) to the agent's ecosystem.
- **Device Sensors (`camera_snap`, `location_get`, `screen_record`)**: Directly requests external telemetry from the paired node. Returns `MEDIA:<path>` or `FILE:<path>` strings which other tools (like the VLM `image` tool) can immediately perceive.
- **Execution (`run`, `invoke`)**: 
  - `run` executes native OS terminal commands (`argv`) on the remote node, utilizing a Resumable Approval flow if the user needs to confirm the execution.
  - `invoke` runs custom raw commands (e.g. `system.notify` or `browser.proxy`). 

## Relationship to the `browser` tool
In `browser-tool.ts`, if the user sets `target="node"`, the browser tool uses `callBrowserProxy`. That proxy call eventually routes through the exact same Gateway RPC mechanism defined here. The browser tool asks the `nodes` infrastructure to send UI commands (`click`, `scroll`) across the network to the assigned physical node.
