# Zotero Read Aloud setup

Zotero 10 includes Read Aloud support. In the tested Zotero 10 implementation,
Kokoro is wired through an internal preference and voice bridge.

## Configure the Kokoro base URL

Open **Zotero > Settings > Advanced > Config Editor** and set:

| Preference | Value |
| --- | --- |
| `reader.readAloudKokoro.baseURL` | `http://127.0.0.1:8880` |

If your Kokoro server is on another machine, create an SSH tunnel first and keep
the Zotero value as `http://127.0.0.1:8880`.

## What Zotero does internally

The tested Zotero 10 Read Aloud code does this:

1. Fetches normal Zotero hosted voices.
2. Reads `reader.readAloudKokoro.baseURL`, defaulting to `http://127.0.0.1:8880`.
3. Calls `<baseURL>/v1/voices`.
4. Converts each Kokoro voice into a Zotero voice whose ID starts with `kokoro-`.
5. Inserts those voices into the Premium voice group with zero credits.
6. When a `kokoro-*` voice is selected, strips the prefix and posts audio
   requests to `<baseURL>/v1/audio/speech`.

The audio request body is:

```json
{
  "voice": "af_heart",
  "input": "Text to read",
  "response_format": "wav"
}
```

This is why Kokoro voices appear under Premium. They are local Kokoro voices
exposed through Zotero's beta Read Aloud plumbing, not hosted Zotero Premium
voices.

## Server voice response

`GET /v1/voices` should return an array like:

```json
[
  { "id": "af_heart", "label": "Heart", "locale": "en-US" }
]
```

Zotero will display this as a Kokoro voice and request audio with the original
voice ID.

## Compatibility notes

This is an internal Zotero 10 integration point and may change. If the voices do
not appear:

- Confirm Zotero is version 10 or newer with Read Aloud enabled.
- Confirm `reader.readAloudKokoro.baseURL` is set.
- Confirm `curl http://127.0.0.1:8880/v1/voices` returns voices.
- Confirm synthesis returns WAV audio.
- Inspect Zotero's installed `syncAPIClient.js` for `readAloudKokoro` if needed.

Do not use `extensions.zotero.reader.readAloudLocal.*` unless your Zotero build
actually contains those preferences. They were not the working path in the
inspected Zotero 10 build.
