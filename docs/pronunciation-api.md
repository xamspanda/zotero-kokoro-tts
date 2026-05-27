# Pronunciation API

The plugin is a Zotero-side control surface for pronunciation rules stored and
applied by the Kokoro server.

## Rule shape

A rule should contain:

```json
{
  "id": "rule-id",
  "pattern": "C#",
  "replacement": "C Sharp",
  "phonemes": null,
  "match": "literal",
  "case_sensitive": true,
  "enabled": true,
  "description": "Added from Zotero preferences"
}
```

Fields:

- `id`: stable server-generated identifier.
- `pattern`: input text or regex to match.
- `replacement`: plain text to speak instead.
- `phonemes`: optional backend-native phoneme override.
- `match`: `literal`, `word`, or `regex`.
- `case_sensitive`: whether matching is case-sensitive.
- `enabled`: whether the rule is active.
- `description`: optional user-facing note.

## Endpoints

### List rules

```http
GET /api/pronunciations
```

Response:

```json
{
  "rules": []
}
```

### Add rule

```http
POST /api/pronunciations
Content-Type: application/json
```

Body:

```json
{
  "pattern": "C#",
  "replacement": "C Sharp",
  "match": "literal",
  "case_sensitive": true,
  "description": "Added from Zotero preferences"
}
```

### Toggle or update a rule

```http
PATCH /api/pronunciations/{id}
Content-Type: application/json
```

Body:

```json
{ "enabled": false }
```

The plugin currently uses this endpoint for enable/disable toggles.

### Delete rule

```http
DELETE /api/pronunciations/{id}
```

### Test rules

```http
POST /api/pronunciations/test
Content-Type: application/json
```

Body:

```json
{ "text": "C# is used in this example." }
```

Response should include the original and transformed text:

```json
{
  "input": "C# is used in this example.",
  "transformed": "C Sharp is used in this example."
}
```

### Clear audio cache

```http
POST /api/cache/clear
```

Response:

```json
{ "cleared": 3 }
```

## Duplicate semantics

The plugin refuses duplicate rules before sending a new rule to the server.
A duplicate is:

- same `match` mode, and
- same `pattern` under that mode's comparison rules.

Comparison rules:

- `literal`: case-sensitive.
- `word`: case-insensitive.
- `regex`: case-insensitive.

The same pattern under a different match mode is allowed.

## Server-side behavior

The server should apply enabled rules before synthesis and should include the
transformed text in any audio cache key, or clear the cache when rules change.
Invalid regex rules should be rejected with a clear 4xx error.
