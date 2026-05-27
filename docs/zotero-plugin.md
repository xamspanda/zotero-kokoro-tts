# Zotero plugin implementation notes

The plugin is a Zotero bootstrapped extension. It manages pronunciation rules
and previews audio, but it does not replace Zotero's Read Aloud player.

## Files

```text
manifest.json
bootstrap.js
prefs.js
content/preferences.xhtml
content/preferences.css
content/preferences.js
modules/main.js
updates.json
```

The XPI must contain `manifest.json` at the archive root.

## Preferences

Plugin settings:

| Setting | Preference key | Default |
| --- | --- | --- |
| Server base URL | `extensions.kokoro-pronunciations.serverURL` | `http://127.0.0.1:8880` |
| Preview voice | `extensions.kokoro-pronunciations.voice` | `af_heart` |

Zotero Read Aloud bridge setting:

| Setting | Preference key | Default |
| --- | --- | --- |
| Kokoro base URL | `reader.readAloudKokoro.baseURL` | `http://127.0.0.1:8880` |

The plugin's Base URL and Zotero's Read Aloud base URL should point to the same
server.

## Startup flow

1. `bootstrap.js` registers the content chrome path.
2. `bootstrap.js` loads `modules/main.js`.
3. `modules/main.js` registers the Settings pane.
4. `modules/main.js` registers Reader context-menu actions.
5. `content/preferences.js` waits for the pane DOM before binding controls.

## Settings pane details

Zotero preferences panes are XUL documents with embedded HTML. Important details:

- HTML `<button>` elements fire `click`, not `command`.
- HTML `<select>` dropdowns do not open reliably in the XUL prefs window.
- Use XUL `<menulist>`, `<menupopup>`, and `<menuitem>` for dropdowns.
- The pane script can run before the pane DOM is inserted. Poll for a known node
  before calling `init()`.
- CSS grid is more reliable than HTML tables inside XUL groupboxes.
- Toggle switches are class-driven `<div role="switch">` elements, not native
  checkboxes.

## Reader context menu

The plugin registers `createViewContextMenu` and adds actions for selected text.
Selected text uses Zotero Reader internals, so the code is defensive:

- Try Reader selection ranges.
- Fall back to `getSelection()`.
- Keep actions usable even if no selection is found.

## Audio preview

Preview sends a direct request to the server:

```http
POST /v1/audio/speech
Content-Type: application/json
```

```json
{
  "input": "C Sharp",
  "voice": "af_heart",
  "response_format": "wav"
}
```

The pane plays the returned WAV bytes through an HTML `<audio>` element.

## Packaging

```bash
/usr/bin/zip -r kokoro-pronunciations.xpi . \
  -x '.git/*' 'docs/*' '*.xpi' '.DS_Store' '__MACOSX/*' '*/.DS_Store' '*/__MACOSX/*'
```

Validation:

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

## Reinstalling during development

If Zotero still shows old pane code after reinstalling the XPI, quit Zotero and
clear the Zotero profile `startupCache`. Then restart Zotero and check the debug
log for `Kokoro Pronunciations` lines.
