# Server setup

This project expects an OpenAI-compatible Kokoro TTS server that Zotero can
reach over HTTP. The default examples use `http://127.0.0.1:8880`.

## Local install

Use Python 3.10 to 3.12. Kokoro dependencies may not support newer Python
versions yet.

```bash
uv tool install --python 3.12 zotero-kokoro-server
zotero-kokoro-server --host 127.0.0.1 --port 8880
```

The first run may download model files. After the model and language data are
cached, the server can run offline.

## Verify the server

```bash
curl http://127.0.0.1:8880/health
curl http://127.0.0.1:8880/v1/voices
curl -X POST http://127.0.0.1:8880/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"voice":"af_heart","input":"Hello from Kokoro.","response_format":"wav"}' \
  --output test.wav
```

Expected behavior:

- `/health` returns a JSON success response.
- `/v1/voices` returns a list of voice objects with stable `id` values.
- `/v1/audio/speech` returns WAV audio bytes.

Use `response_format: "wav"`. Do not assume `mp3` is accepted.

## Remote inference

Run the server on the remote host, bound to localhost:

```bash
zotero-kokoro-server --host 127.0.0.1 --port 8880
```

From the machine running Zotero, create a tunnel:

```bash
ssh -N -L 8880:127.0.0.1:8880 user@remote-host
```

Configure Zotero and the plugin with:

```text
http://127.0.0.1:8880
```

This keeps the TTS service private. Avoid binding the service to a public
interface unless you add authentication, TLS, and network restrictions.

## Optional service manager

For a Linux user service, create `~/.config/systemd/user/zotero-kokoro-server.service`:

```ini
[Unit]
Description=Zotero Kokoro TTS server
After=network-online.target

[Service]
ExecStart=%h/.local/bin/zotero-kokoro-server --host 127.0.0.1 --port 8880
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Then run:

```bash
systemctl --user daemon-reload
systemctl --user enable --now zotero-kokoro-server.service
systemctl --user status zotero-kokoro-server.service
```

## Required API surface

The Zotero Read Aloud bridge needs:

- `GET /v1/voices`
- `POST /v1/audio/speech`

The pronunciation plugin additionally uses:

- `GET /health`
- `GET/POST /api/pronunciations`
- `PATCH/DELETE /api/pronunciations/{id}`
- `POST /api/pronunciations/test`
- `POST /api/cache/clear`
