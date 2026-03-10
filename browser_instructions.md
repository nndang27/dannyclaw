# NanoClaw Browser Ecosystem Instructions

## Overview
This document serves as the master guide for the OpenClaw browser automation architecture. After reverse-engineering `browser-tool.ts`, the client REST wrappers, the server Playwright core, and sibling tools (`image`, `nodes`, `canvas`), we have mapped the complete execution flow from LLM intent to DOM manipulation.

The OpenClaw ecosystem is a multi-tiered, decoupled architecture designed primarily to let LLMs "see" and "act" on remote, sandboxed browsers using accessibility trees and bounding box visual labels, rather than raw CSS selectors or coordinates.

## Architecture & Data Flow

### The Execution Path
1. **The Request (LLM Side)**:
   The LLM invokes the `browser` tool with an action (e.g., `{"action": "click", "target": "node", "ref": "e15"}`).
2. **The Tool Router (`browser-tool.ts`)**:
   The tool catches the request. Depending on the `target`, it routes the payload. If the target is a remote physical/sandboxed machine (`target: "node"`), it wraps the request and forwards it to the `nodes` tool infrastructure via `callBrowserProxy`.
3. **The Gateway / RPC (`nodes-tool.ts`)**:
   The request is dispatched over an internal Gateway WebSocket to the remote machine's daemon as a `node.invoke` payload containing a serializable `BrowserActRequest`.
4. **The REST Client (`browser/client-actions.ts`)**:
   On the target host, a client wrapper receives the intent and POSTs the exact JSON payload to the local Playwright backend server (e.g., `POST /act {kind: "click", ref: "e15"}`).
5. **The Playwright Core (`browser/pw-session.ts` & `pw-tools-core.interactions.ts`)**:
   The server receives the POST, locates the cached WebSocket (CDP) connection to the Chromium tab (`cachedByCdpUrl`), and resolves the target Page.
6. **Interaction Execution**:
   It feeds the `ref` ("e15") into `refLocator(page, "e15")`. That locator resolves to `page.locator("aria-ref=e15")`. It then runs Playwright's native `locator.click()`.
7. **Visual Feedback (`image-tool.ts`)**:
   When the LLM requests an `action: "screenshot"`, the entire chain reverses. Playwright captures the PNG, writes it locally, and the `browser` tool returns a string: `MEDIA:/tmp/snap.png`. The Agent reads this string and invokes the `image` tool, which base64-encodes the image and submits it to the VLM (e.g., Claude Opus or MiniMax).

## Sibling Dependencies
- **`image` Tool**: Essential for VLM ingestion. Understands the `MEDIA:<file>` protocol to read local files captured by the browser.
- **`nodes` Tool**: Critical for distributed execution. It proxies browser intents over the network to hardware running in sandboxes, phones, or Raspberry Pis.
- **`canvas` Tool**: An A2UI (Agent to UI) interface operating independently of the browser DOM, used for rendering custom widget overlays to humans, which the LLM can also snapshot and evaluate.

## Adapting for NanoClaw Trading Bots

The OpenClaw architecture is extremely robust for general-purpose, exploratory Web browsing (reading Wikipedia, booking flights). However, modifying it for high-speed Trading Bots requires significant changes due to its latency profile and element addressing mechanism.

### The Problem with "Aria Refs" for Trading
OpenClaw relies heavily on `snapshotAiViaPlaywright()` which injects `aria-ref=e[num]` IDs (like `e55`) into the DOM. This happens on every snapshot. 
- **Latency**: Generating accessibility trees and injecting IDs takes hundreds of milliseconds to seconds.
- **Volatility**: In trading terminals (like TradingView, DexScreener, or CEX UIs), the DOM updates dozens of times per second. By the time the LLM sees `e55`, the React/Vue engine has likely destroyed and re-rendered the Virtual DOM, wiping out the injected `aria-ref`.

### Recommended Adaptations

1. **Bypass the Snapshot Cycle for Trade Execution**
   You cannot afford to wait for a VLM snapshot -> ID injection -> LLM inference -> Click loop when executing a trade.
   * **Solution**: Your trading bot must use **deterministic paths or coordinates** discovered ahead of time.
   * Implement a direct Playwright Evaluation tool that bypasses the `browser -> client -> REST POST -> pw-session` queue and executes directly on the Chromium tab.

2. **Add Native WebSocket Interceptors**
   Instead of asking the LLM to read prices via visual screenshots, your adaptation should hook into Playwright's Network interceptor (already somewhat implemented in `BrowserNetworkRequest` inside `pw-session.ts`).
   * **Solution**: Expose an API that lets your Agent subscribe to the trading site's native WebSocket feeds (WSS) and stream the parsed JSON directly into the Agent's context or a sidecar database.

3. **Coordinate-Based Clicking (The "Canvas" Approach)**
   If you must use visual targeting, skip the `aria-ref` injection. 
   * **Solution**: Use `screenshotWithLabelsViaPlaywright`. This draws bounding boxes with coordinate data. Map the coordinates, and introduce an `action: "clickCoordinate"` tool to the Playwright core (`page.mouse.click(x, y)`). Coordinate clicks are far less brittle against fast React DOM refreshes since they don't depend on the DOM node remaining exactly the same at the moment of the click.

4. **Streamline the Stack**
   Remove the `nodes` RPC Gateway layer if your Trading bot runs on the same machine as the browser. Directly import `browser/pw-tools-core.interactions.ts` and initialize `connectBrowser(cdpUrl)` from your central TypeScript orchestrator to cut out three layers of JSON serialization overhead.
