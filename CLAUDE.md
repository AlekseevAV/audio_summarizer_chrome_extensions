# CLAUDE.md

Project map for the model. Chrome extension (Manifest V3) for transcribing and
summarizing Google Meet calls.

## What it does

Captures the Meet tab audio + microphone, streams PCM to the OpenAI Realtime API
(WebSocket) for live transcription, scrapes call metadata from the DOM (title,
description, participants, time), shows a panel inside an iframe, and can produce
a summary via Chat Completions and save the result as Markdown (the format targets
Obsidian: frontmatter + `[[wiki-links]]`).

## Build

- `npm run build` -> bundles via esbuild into `dist/` (4 entry points, IIFE format).
- `npm run watch` -> rebuild on change + copy static assets.
- Bundler: `build.js`. Load the `dist/` folder into Chrome (Load unpacked).
- `dist/` is a build artifact, do not edit by hand. Sources live in `chrome-extension/`.

Entry points (see `build.js`): `background`, `content`, `panel`, `offscreen`.
Each is bundled from `chrome-extension/<context>/<context>.js`.

Static files copied as-is (NOT bundled):
`panel.html`, `panel.css`, `offscreen.html`, `options.html`, `options.js`,
`pcm-processor.js` (AudioWorklet - must stay a separate file), `manifest.json`, `icons/`.

## Architecture: 4 extension contexts

Code in `chrome-extension/` is split into modules by execution context. Each
context follows the same layout: an entry file named after the context, plus
`state.js`, `messages.js`, `logger.js`, and domain modules.

### `background/` - service worker
Message router and owner of the recording session lifecycle.
- `background.js` - entry point: icon click (toggle panel), tab close / navigate
  away -> stop recording. Wires up the message listener.
- `messages.js` - central router: routes messages by `source`
  (panel/content/offscreen) and relays offscreen events -> panel.
- `recording.js` - `startRecordingForTab` / `stopRecordingForTab`: commands the
  offscreen document, reads settings from `chrome.storage.sync`.
- `offscreen.js` - create/close the offscreen document (created lazily, closed
  when there is no active session).
- `state.js` - `activeSession` ({ tabId, status }).
- `icon.js` - change/blink the extension icon.

### `offscreen/` - offscreen document (audio capture + WebSocket to OpenAI)
Needed because the service worker has no access to Web Audio / getUserMedia.
- `recording.js` - the core: grabs the tab stream by `streamId`, the microphone
  (looks for a device whose label contains "default"), mixes them through an
  `AudioContext` (sampleRate 24000), opens the WebSocket, starts PCM streaming.
  Also plays the tab audio to the speakers (monitoring).
- `websocket.js` - connects to `wss://api.openai.com/v1/realtime?intent=transcription`,
  configures the session (transcription model, `semantic_vad`), forwards all events
  back as `TRANSCRIPTION_EVENT`.
- `audio.js` - PCM streaming: float32 -> PCM16 -> base64, sends
  `input_audio_buffer.append` to the WebSocket.
- `pcm-processor.js` - AudioWorkletProcessor (loaded by URL, not bundled).
- `state.js` - `currentSession` (ws, contexts, streams, workletNode).
- mute from content arrives as `MIC_MUTE_CHANGE` and toggles the mic `track.enabled`.

### `content/` - content script on `meet.google.com`
Scrapes the Meet DOM and injects the panel.
- `content.js` - entry point: clicks the Details/People tabs so Meet loads the
  data, periodically (10s) refreshes metadata, injects the panel 2s after load.
- `call-metadata.js` - DOM parsing: title/description/time/location/participants.
  Fragile code, tied to the current Meet markup (the "schedule" icon, aria-labels
  "Participants"/"Guests"/"Meeting details"/"People"). `parseTimeRange` parses the
  call's time string.
- `observers.js` - MutationObserver on the mute button (`[data-is-muted]`) and a
  click listener on "Leave call" -> signals to background.
- `panel.js` - injects the panel iframe (`panel.html?tabId=...`), activation hint tooltip.
- `messages.js` - bridge between background (chrome.runtime) and the panel (iframe postMessage).
- `state.js` - `panelIframe`, `currentTabId`, activation flags.

### `panel/` - UI panel (iframe, extension page)
Loaded as an iframe inside the Meet page with `tabId` in the URL.
- `panel.js` - entry point, UI initialization.
- `ui.js` - all panel DOM work: record/copy/save/run-prompt buttons, the
  transcription timeline, live preview, metadata rendering, Markdown assembly
  (`getMeetingDataAsText`). Summary: POST to Chat Completions (model is hardcoded
  as `gpt-5.2-2025-12-11`), the system prompt is baked in, the user prompt comes
  from settings.
- `recording.js` - requests microphone permission (needs a user gesture in the
  panel context), obtains `streamId` via `chrome.tabCapture.getMediaStreamId`,
  sends START_RECORDING to background.
- `messages.js` - handles events from background (recording statuses, errors,
  `TRANSCRIPTION_EVENT`) and from content (metadata, activation). `handleWebSocketEvent`
  parses OpenAI Realtime events (speech_started/stopped, delta, completed) and
  builds the timeline with timecodes.
- `state.js` - `isRecording`, `isActivated`, `callMetadata`, `segmentTimes` (item_id -> timings).
- `panel.html` / `panel.css` - panel markup and styles.

### `shared/message-types.js`
Single source of truth for message types: `MESSAGE_TYPES`, `MESSAGE_SOURCES`,
`MESSAGE_TARGETS`. Used across all contexts. Adding a new message -> edit here.

## Data flow (record -> result)

1. Icon click -> background sends `TOGGLE_PANEL_VISIBILITY` to content -> content
   activates and shows the panel.
2. Record button in the panel -> `panel/recording.js` gets mic permission and a
   `streamId` -> `START_RECORDING` to background.
3. background creates the offscreen document, passes `streamId` + apiKey + model.
4. offscreen mixes tab+mic audio, streams PCM to OpenAI Realtime over the WebSocket.
5. OpenAI transcription events -> offscreen -> background -> content (relay) ->
   panel, where the timeline and live preview are built.
6. content concurrently scrapes call metadata and sends it to the panel.
7. "Leave call" / tab close / record clicked again -> recording stops.
8. Run prompt in the panel -> Chat Completions -> summary; Copy/Save -> Markdown.

## Messages

Every message carries `source` and/or `target` from `MESSAGE_SOURCES`/`MESSAGE_TARGETS`.
Two channels:
- `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` - between background,
  offscreen, content.
- `window.postMessage` - between content and panel (since the panel is in an iframe).
content acts as the bridge: it relays background <-> panel.

## Settings (`chrome.storage.sync`)

- `openai_token` - OpenAI key (used for both Realtime transcription and summaries).
- `summary_prompt` - user summary prompt.
- `transcription_model` - transcription model (default in code is `gpt-4o-transcribe`).
- `summary_model` - Chat Completions model for summaries (empty -> default).
- `summary_system_prompt` - system prompt for the summarizer (empty -> default).

Edited on `options.html` (`options.js`). Defaults live in `shared/defaults.js`
(imported by the bundled `panel/ui.js`; `options.js` is not bundled, so it treats
an empty value as "use the default").

## Manifest (key points)

- MV3, permissions: `tabCapture`, `offscreen`, `tabs`, `storage`.
- `host_permissions`: only `*://meet.google.com/*`.
- content script on Meet; `web_accessible_resources`: panel/offscreen html+css, pcm-processor.

## Sensitive spots / gotchas

- **Meet DOM parsing (`content/call-metadata.js`, `content/content.js`,
  `content/observers.js`)** - tied to Google Meet's markup and aria-labels, breaks
  when they change. The most fragile part of the project.
- **`pcm-processor.js`** must not be bundled - it is loaded as a separate AudioWorklet module by URL.
- **Microphone** in offscreen is picked by the "default" label - may not be found on some machines.
- Model/prompt defaults live in `shared/defaults.js`; transcription model default
  (`gpt-4o-transcribe`) is in `offscreen/recording.js`. All are overridable in settings.

## Conventions

- ES modules, bundled by esbuild into IIFE. Imports use the `.js` extension.
- Each context has its own `logger.js` with a context prefix (`[background]`, etc.).
- State is isolated per context in `state.js` via let-variables + setters.
- The project has no tests.
- In text, do not use the em dash, only the hyphen.
