var KokoroPronunciations = KokoroPronunciations || {};

KokoroPronunciations.Main = class {
  constructor({ pluginID, rootURI }) {
    this.pluginID = pluginID;
    this.rootURI = rootURI;
    this.readerListenerRegistered = false;
    this.mainWindows = new Set();
  }

  async startup() {
    Zotero.KokoroPronunciations = this;
    await this.registerPrefs();
    this.registerReaderMenu();
    Zotero.debug("Kokoro Pronunciations: startup complete");
  }

  async shutdown() {
    this.mainWindows.clear();
    if (Zotero.KokoroPronunciations === this) {
      delete Zotero.KokoroPronunciations;
    }
  }

  async onMainWindowLoad(win) {
    this.mainWindows.add(win);
    win.Zotero.KokoroPronunciations = this;
  }

  async onMainWindowUnload(win) {
    this.mainWindows.delete(win);
    if (win.Zotero?.KokoroPronunciations === this) {
      delete win.Zotero.KokoroPronunciations;
    }
  }

  prefName(key) {
    return `extensions.kokoro-pronunciations.${key}`;
  }

  getServerURL() {
    return (Zotero.Prefs.get(this.prefName("serverURL")) || "http://127.0.0.1:8880").replace(/\/+$/, "");
  }

  async registerPrefs() {
    if (!Zotero.PreferencePanes?.register) {
      Zotero.debug("Kokoro Pronunciations: PreferencePanes.register unavailable");
      return;
    }
    const options = {
      // Keep these literal. In Zotero 10, passing through bootstrap/script-target
      // boundaries can make instance fields appear undefined to preferencePanes.
      pluginID: "kokoro-pronunciations@xamspanda.github.io",
      id: "kokoro-pronunciations-pane",
      label: "Kokoro TTS",
      src: this.rootURI + "content/preferences.xhtml",
      scripts: [this.rootURI + "content/preferences.js"],
      stylesheets: [this.rootURI + "content/preferences.css"]
    };
    Zotero.debug(`Kokoro Pronunciations: registering prefs pluginID=${options.pluginID} src=${options.src}`);
    try {
      await Zotero.PreferencePanes.register(options);
      Zotero.debug("Kokoro Pronunciations: prefs registered");
    } catch (e) {
      Zotero.debug(`Kokoro Pronunciations: prefs registration failed: ${e} ${e?.stack || ""}`);
      throw e;
    }
  }

  registerReaderMenu() {
    if (!Zotero.Reader?.registerEventListener) {
      Zotero.debug("Kokoro Pronunciations: Reader API unavailable");
      return;
    }
    Zotero.Reader.registerEventListener("createViewContextMenu", (event) => {
      const selectedText = this.getSelectedText(event.reader).trim();
      const shortText = selectedText ? this.truncate(selectedText, 40) : "selection";
      event.append({
        label: "Kokoro Pronunciation",
        groups: [[
          {
            label: selectedText ? `Add pronunciation for “${shortText}”…` : "Add pronunciation…",
            onCommand: () => this.openAddDialog(selectedText)
          },
          {
            label: "Previous pronunciations…",
            onCommand: () => this.showPreviousPronunciations()
          },
          {
            label: "Manage pronunciations…",
            onCommand: () => this.openManagerWindow()
          },
          {
            label: "Test selected text pronunciation…",
            disabled: !selectedText,
            onCommand: () => this.testText(selectedText)
          }
        ]]
      });
    }, this.pluginID);
    this.readerListenerRegistered = true;
    Zotero.debug("Kokoro Pronunciations: reader menu registered");
  }

  truncate(text, max) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  getSelectedText(reader) {
    try {
      const win = reader?._iframeWindow?.wrappedJSObject;
      const ranges = win?._reader?._primaryView?._selectionRanges;
      if (Array.isArray(ranges) && ranges.length) {
        return ranges.map((range) => {
          if (typeof range === "string") return range;
          if (range.text) return range.text;
          if (range.toString && range.toString !== Object.prototype.toString) return range.toString();
          return "";
        }).join(" ").trim();
      }
      const selection = win?.getSelection?.();
      if (selection) return selection.toString();
    } catch (e) {
      Zotero.debug(`Kokoro Pronunciations: selected text lookup failed: ${e}`);
    }
    return "";
  }

  defaultMatchMode(pattern) {
    return /^[\p{L}\p{N}_'-]+$/u.test(pattern || "") ? "word" : "literal";
  }

  async openAddDialog(selectedText = "") {
    const patternDefault = (selectedText || "").replace(/\s+/g, " ").trim();
    const pattern = { value: patternDefault };
    if (!Services.prompt.prompt(null, "Add Kokoro Pronunciation", "Input symbol/word:", pattern, null, {})) return;
    pattern.value = (pattern.value || "").trim();
    if (!pattern.value) return;
    const input = { value: "" };
    if (!Services.prompt.prompt(null, "Add Kokoro Pronunciation", `Pronounce “${pattern.value}” as:`, input, null, {})) return;
    input.value = (input.value || "").trim();
    if (!input.value) return;
    const defaultMatch = this.defaultMatchMode(pattern.value);
    const payload = {
      pattern: pattern.value,
      replacement: input.value,
      match: defaultMatch,
      case_sensitive: !/^[\p{L}\p{N}_'-]+$/u.test(pattern.value),
      description: "Added from Zotero Reader"
    };
    try {
      const rule = await this.api("/api/pronunciations", { method: "POST", body: payload });
      this.alert(`Saved pronunciation: ${rule.pattern} -> ${rule.replacement || rule.phonemes}`);
    } catch (e) {
      this.alert(`Failed to save pronunciation: ${e.message || e}`);
    }
  }

  async testText(text) {
    try {
      const result = await this.api("/api/pronunciations/test", { method: "POST", body: { text } });
      this.alert(`Input:\n${result.input}\n\nTransformed:\n${result.transformed}`);
    } catch (e) {
      this.alert(`Failed to test pronunciation: ${e.message || e}`);
    }
  }

  async showPreviousPronunciations() {
    try {
      const result = await this.api("/api/pronunciations/history?limit=10");
      const history = result.history || [];
      if (!history.length) {
        this.alert("No previous pronunciations yet.");
        return;
      }
      const lines = history.map((item, i) => {
        const target = item.replacement || item.phonemes || "";
        const when = item.updated_at || item.created_at || "";
        return `${i + 1}. ${item.pattern} -> ${target}` +
          `${item.match ? `  [${item.match}]` : ""}${when ? `  (${when})` : ""}`;
      });
      this.alert(
        `Previous pronunciations (most recent first):\n\n${lines.join("\n")}\n\n` +
        `Open Settings -> Kokoro TTS to restore or manage these.`
      );
    } catch (e) {
      this.alert(`Failed to load previous pronunciations: ${e.message || e}`);
    }
  }

  openManagerWindow() {
    try {
      const win = Zotero.getMainWindow();
      const uri = "chrome://zotero/content/preferences/preferences.xhtml#kokoro-pronunciations-pane";
      if (win?.ZoteroPane?.loadURI) {
        win.ZoteroPane.loadURI(uri);
        return;
      }
      if (win?.open) {
        win.open(uri, "zotero-prefs", "chrome,centerscreen");
        return;
      }
    } catch (e) {
      Zotero.debug(`Kokoro Pronunciations: open manager failed: ${e} ${e?.stack || ""}`);
    }
    this.alert("Open Zotero Settings -> Kokoro TTS to manage pronunciation rules.");
  }

  async api(path, { method = "GET", body = null } = {}) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body !== null) options.body = JSON.stringify(body);
    const response = await fetch(this.getServerURL() + path, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
      throw new Error(data?.detail || response.statusText || `HTTP ${response.status}`);
    }
    return data;
  }

  alert(message) {
    Services.prompt.alert(null, "Kokoro Pronunciations", String(message));
  }
};
