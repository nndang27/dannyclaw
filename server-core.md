# Server Core & Playwright Driver (`browser/pw-*.ts`)

## File Purpose
These files (`pw-session.ts`, `pw-tools-core.interactions.ts`, `pw-tools-core.snapshot.ts`) make up the absolute bottom of the OpenClaw browser execution stack. While everything above this layer is REST APIs and JSON mappings, this layer is built directly on top of `playwright-core`. 

It is responsible for maintaining persistent WebSockets (CDP) to target Chrome instances and translating the LLM's requests into Chromium DOM events.

## Architecture

### 1. Connection Management (`pw-session.ts`)
- Maintains a cache of persistent browser connections (`cachedByCdpUrl`).
- Instead of launching a browser directly, it uses `chromium.connectOverCDP(endpoint)` to attach to existing external Chrome instances (or the OpenClaw Chrome Extension relay).
- **`PageState` WeakMap**: Buffers the last 500 console logs, page errors, and network requests on a per-tab basis, so the LLM can query them later via the `/console` and `/requests` observation endpoints.
- Contains extensive forced disconnection mechanisms (`forceDisconnectPlaywrightForTarget`) to recover from broken websockets or infinitely hanging `eval` commands.

### 2. Element Addressing & Interaction (`pw-tools-core.interactions.ts`)
This file is the action executor. The LLM never provides CSS selectors. It provides `ref` strings like `e23` or `e55`.
- **`refLocator(page, ref)`**: The magical function that converts the LLM's `ref` into a Playwright Locator.
  - If the mode is "aria", it translates `e23` into `page.locator('aria-ref=e23')`. (These DOM attributes are injected by the snapshot process).
  - If the mode is "role", it looks up `e23` from an internal cache mapping refs to `getByRole` definitions (e.g., `{ role: 'button', name: 'Submit' }`).
- Translates REST intent payloads into `locator.click()`, `locator.fill()`, `locator.dragTo()`, and `page.evaluate()` (running JS on the page).

### 3. Snapshot Engine (`pw-tools-core.snapshot.ts`)
How the LLM "sees" the page. Three major modes:
- **Visual (`takeScreenshotViaPlaywright`)**: Standard full-page or element JPEG/PNG capture. Also supports `screenshotWithLabelsViaPlaywright` which injects absolute-positioned yellow overlay diving boxes into the DOM so the LLM can see bounding boxes around elements.
- **Aria (`snapshotAriaViaPlaywright`)**: Connects directly to CDP `Accessibility.getFullAXTree` to dump a pristine accessibility tree, returning it as a nested JSON structure.
- **Hybrid (`snapshotAiViaPlaywright`)**: Utilizes an experimental Playwright function `page._snapshotForAI()`. This function parses the DOM, injects `aria-ref=e<number>` attributes into interactive elements, and returns a compacted text representation mapping spatial intent to those `e*` IDs.
