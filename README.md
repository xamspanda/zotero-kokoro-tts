# Kokoro for Zotero Read Aloud

A Zotero plugin and setup guide for using a local or self-hosted
OpenAI-compatible [Kokoro TTS](https://github.com/hexgrad/kokoro) server with
Zotero Read Aloud.

The plugin adds a Zotero Settings pane and Reader context-menu actions for
managing custom pronunciation rules, such as `C#` to `C Sharp`. Zotero Read
Aloud handles the actual document playback. The Kokoro server handles speech
synthesis and applies the saved pronunciation rules.

## What this repo contains

- A Zotero plugin packaged as `kokoro-pronunciations.xpi`.
- Documentation for running a local or remote Kokoro inference server.
- Documentation for wiring Zotero 10 Read Aloud to the Kokoro server.
- The API contract used by the plugin for pronunciation-rule management.

Start here:

1. [Server setup](docs/server-setup.md)
2. [Zotero Read Aloud setup](docs/zotero-read-aloud.md)
3. [Pronunciation API](docs/pronunciation-api.md)
4. [Plugin implementation notes](docs/zotero-plugin.md)

## Features

- **Pronunciation rule manager** in Zotero Settings > Kokoro TTS:
  - Add rules mapping an input symbol or word to how it should be pronounced.
  - Match modes: literal, whole word, and regex.
  - Enable, disable, and delete rules.
  - Duplicate detection for pattern plus match mode.
- **Audio preview** using the selected Kokoro voice.
- **Reader context menu** for quickly adding or testing selected text.
- **Server controls** for base URL, health check, and cache clearing.
- Clear toast notifications and explicit network/server/request errors.

## Requirements

- Zotero 10 with Read Aloud support.
- A Kokoro TTS server reachable from the Zotero machine.
- Server endpoints:
  - `GET /health`
  - `GET /v1/voices`
  - `POST /v1/audio/speech`, returning WAV audio
  - `GET/POST /api/pronunciations`
  - `PATCH/DELETE /api/pronunciations/{id}`
  - `POST /api/pronunciations/test`
  - `POST /api/cache/clear`

A reference server is
[Helios113/zotero-kokoro-server](https://github.com/Helios113/zotero-kokoro-server).
Any server that implements the documented endpoints should work.

## Quick install

1. Download `kokoro-pronunciations.xpi` from the
   [v0.1.0 release](../../releases/tag/v0.1.0).
2. In Zotero, open **Tools > Plugins**.
3. Use the gear menu, choose **Install Plugin From File...**, and select the XPI.
4. Restart Zotero if prompted.
5. Open **Zotero > Settings > Kokoro TTS**.
6. Set **Base URL** to your Kokoro server, usually `http://127.0.0.1:8880`.
7. Click **Save**, then **Health Check**.

## Quick server setup

```bash
uv tool install --python 3.12 zotero-kokoro-server
zotero-kokoro-server --host 127.0.0.1 --port 8880
```

Verify it:

```bash
curl http://127.0.0.1:8880/health
curl http://127.0.0.1:8880/v1/voices
curl -X POST http://127.0.0.1:8880/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"voice":"af_heart","input":"Hello from Kokoro.","response_format":"wav"}' \
  --output test.wav
```

Use `response_format: "wav"`. That is the known-good format for this Zotero
integration.

## Hooking Zotero Read Aloud to Kokoro

In Zotero, open **Settings > Advanced > Config Editor** and set:

| Preference | Value |
| --- | --- |
| `reader.readAloudKokoro.baseURL` | `http://127.0.0.1:8880` |

Then open a PDF or EPUB in the Zotero Reader, click the Read Aloud button, open
the voices list, and choose a Kokoro voice. Kokoro voices are shown inside the
Premium voice area because Zotero's internal Kokoro bridge injects them there as
zero-credit local voices.

This is a Zotero 10 beta/internal integration point, not a stable public API. If
future Zotero versions change the Read Aloud internals, see
[Zotero Read Aloud setup](docs/zotero-read-aloud.md) for what to check.

## Remote inference with SSH tunnel

Run the Kokoro server on a remote machine bound to localhost:

```bash
zotero-kokoro-server --host 127.0.0.1 --port 8880
```

On the Zotero machine, forward a local port to the remote server:

```bash
ssh -N -L 8880:127.0.0.1:8880 user@remote-host
```

Zotero and the plugin still use:

```text
http://127.0.0.1:8880
```

Do not expose the server directly to the public internet unless you add proper
authentication and network controls.

## Managing pronunciation rules

Open **Settings > Kokoro TTS**:

- **Input symbol/word:** text to match, such as `C#`, `Fig.`, or `et al.`.
- **Pronounce as:** text to speak instead, such as `C Sharp` or `Figure`.
- **Match:** literal, whole word, or regex.
- **Preview:** synthesize and play the pronunciation.
- **Add:** save the rule.

Existing rules are listed below with an on/off toggle, a play button, and a
delete button.

## Building from source

```bash
git clone https://github.com/xamspanda/zotero-kokoro-tts.git
cd zotero-kokoro-tts
/usr/bin/zip -r kokoro-pronunciations.xpi . \
  -x '.git/*' 'docs/*' '*.xpi' '.DS_Store' '__MACOSX/*' '*/.DS_Store' '*/__MACOSX/*'
```

The archive must contain `manifest.json` at the root.

Validate the package:

```bash
python3 -m json.tool manifest.json >/dev/null
for f in bootstrap.js content/*.js modules/*.js; do node --check "$f"; done
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('kokoro-pronunciations.xpi') as z:
    names = z.namelist()
    assert 'manifest.json' in names
    assert not any('__MACOSX' in n or n.endswith('.DS_Store') for n in names)
PY
```

## Troubleshooting

- **Kokoro voices do not appear in Zotero Read Aloud:** confirm the server is
  reachable, `GET /v1/voices` returns voices, and `reader.readAloudKokoro.baseURL`
  is set correctly.
- **Plugin cannot reach the server:** confirm the plugin Base URL matches the
  server URL. If using a remote server, confirm the SSH tunnel is running.
- **Audio preview fails:** verify `/v1/audio/speech` accepts
  `response_format: "wav"` and returns WAV bytes.
- **Settings pane looks stale after reinstalling:** quit Zotero and clear the
  Zotero profile `startupCache` while Zotero is closed.
- **Buttons or selectors do not respond:** use Zotero 10 and check the debug log
  for lines beginning with `Kokoro Pronunciations`.

## License

MIT. See [LICENSE](LICENSE).
