# Sound Booster

A Chrome/Edge extension that boosts the volume of HTML5 `<video>` elements
above 100% using the Web Audio API.

## Features

- Up to 6x boost on any `<video>` tag
- Per-site memory (boost level stored per hostname)
- Optional soft limiter (`DynamicsCompressorNode`) to reduce clipping at high gains
- Iframe fallback: if the page has no `<video>` but embeds one, offers a link to open it directly
- Tab badge showing the current boost
- Permissions: `activeTab`, `scripting`, `storage`. No `host_permissions`, no background script, no network calls.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Pin the extension and click it on a page with a video

## Permissions

| Permission   | Purpose                                                  |
|--------------|----------------------------------------------------------|
| `activeTab`  | Run on the tab where you clicked the icon                |
| `scripting`  | Inject the gain-control function into that tab           |
| `storage`    | Persist per-site boost levels and limiter preference     |

The injected script only runs when you click the toolbar icon.

## How it works

`popup.js` calls `chrome.scripting.executeScript` to run
`injectGainControl(volume, useLimiter)` in the active tab and its frames.
That function:

1. Finds every `<video>` element
2. Wires each through a `MediaElementAudioSourceNode → GainNode`
   (optionally with a `DynamicsCompressorNode` for soft limiting)
3. Sets `gain.value = volume`
4. Caches the audio graph on a `WeakMap` so re-applying just updates the gain

## Security notes

- Popup status text is built with `textContent` / `createElement` — no
  `innerHTML` interpolation, so a crafted iframe `src` can't inject script
  into the popup.
- The iframe-fallback link is validated as `http://` or `https://` before
  being rendered, with `rel="noopener noreferrer"`.
- The injected script does not send data anywhere; it only manipulates
  audio routing on elements already in the page.

## Project layout

```
extension/         the Chrome extension (load this folder unpacked)
  manifest.json
  popup.html
  popup.js
  icons/
scripts/
  make_icons.py    regenerates icons/*.png with Pillow
LICENSE
README.md
```

## Regenerating icons

```bash
uv run --with pillow python scripts/make_icons.py
# or, with pillow already installed:
python3 scripts/make_icons.py
```

## Caveats

- Some sites set strict CORS/CSP that prevent `createMediaElementSource`
  from attaching to their video element.
- You may need to press play once after applying boost so the audio
  context resumes from its initially-suspended state.
- Heavy boost on already-loud audio will distort. Leave the soft limiter
  on unless you have a reason to disable it.

## License

MIT. See `LICENSE`.
