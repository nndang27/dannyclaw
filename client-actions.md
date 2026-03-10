# Browser Action Wrappers (`browser/client-actions-*.ts`)

## File Purpose
These files (`client-actions-core.ts`, `client-actions-observe.ts`) extend the core REST client to handle more complex or state-mutating Playwright interactions. They wrap the HTTP JSON payloads for DOM interactions.

## Key Functions & Workflows (Inputs/Outputs)
1. **`BrowserActRequest` (Core Schema)**:
   - Defines the exact shape of the payload sent to `/act`. 
   - Operations: `click`, `type`, `press`, `hover`, `scrollIntoView`, `drag`, `select`, `fill`, `resize`, `wait`, `evaluate`, `close`.
   - **`browserAct(baseUrl, req)`**: Serializes the `BrowserActRequest` and POSTs it to the backend `/act` route.

2. **Downloads & Dialogs**:
   - `browserWaitForDownload`, `browserDownload`: Handle waiting for and saving file downloads.
   - `browserArmDialog`, `browserArmFileChooser`: Arm the backend to auto-accept upcoming `window.alert` or `<input type="file">` prompts using predefined paths/responses.

3. **Snapshots & Visuals**:
   - `browserScreenshotAction(baseUrl, opts)`: Hits `/screenshot` POST. Can target a specific element `ref` or take a `fullPage`.

4. **Observation & Tracing (`client-actions-observe.ts`)**:
   - `browserConsoleMessages` and `browserPageErrors`: Pulls buffered console logs and unhandled exceptions from the target page.
   - `browserRequests`: Dumps filtered Network tab activity.
   - `browserTraceStart` / `browserTraceStop`: Starts standard Playwright Tracing (screenshots, snapshots, sources) and saves the .zip.

## Dependencies
- `./client-fetch.js`: For the `fetchBrowserJson` implementation.
- `./pw-session.js`: Types mapping to Playwright's Page and Network structures (`BrowserConsoleMessage`, `BrowserNetworkRequest`).
