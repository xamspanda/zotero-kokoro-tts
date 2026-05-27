var KokoroPronunciationPrefs = {
  serverURL: "http://127.0.0.1:8880",
  _toastTimer: null,

  init() {
    this.serverURL = (Zotero.Prefs.get("extensions.kokoro-pronunciations.serverURL") || this.serverURL).replace(/\/+$/, "");
    const urlInput = document.getElementById("kokoro-pron-server-url");
    if (urlInput) urlInput.value = this.serverURL;

    // HTML <button> elements fire "click", not the XUL "command" event.
    // Binding "command" here was the root cause of Add/Preview (and every
    // other button) appearing dead. Bind "click" for all of them.
    this.on("kokoro-pron-save-url", () => this.saveServerURL());
    this.on("kokoro-pron-health", () => this.healthCheck());
    this.on("kokoro-pron-refresh", () => this.refreshRules());
    this.on("kokoro-pron-add", () => this.addRule());
    this.on("kokoro-pron-preview", () => this.previewRule());
    this.on("kokoro-pron-clear-cache", () => this.clearCache());
    this.on("kokoro-pron-stop", () => this.stopPlayback());

    // Quality of life: Enter in either add field triggers Add.
    for (const id of ["kokoro-pron-pattern", "kokoro-pron-replacement"]) {
      const el = document.getElementById(id);
      el?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); this.addRule(); }
      });
    }

    this.loadVoices();
    this.refreshRules({ quiet: true });
  },

  async loadVoices() {
    const sel = document.getElementById("kokoro-pron-voice");
    if (!sel) return;
    const saved = Zotero.Prefs.get("extensions.kokoro-pronunciations.voice") || "af_heart";
    try {
      const voices = await this.api("/v1/voices");
      const list = Array.isArray(voices) ? voices : (voices?.voices || []);
      // XUL <menulist>: populate its <menupopup> with <menuitem> elements.
      const popup = sel.querySelector("menupopup") || sel.menupopup;
      if (popup) popup.replaceChildren();
      const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
      for (const v of list) {
        const id = v.id || v.name || v;
        const item = document.createElementNS(XUL, "menuitem");
        item.setAttribute("value", id);
        item.setAttribute("label", v.label ? `${v.label}${v.locale ? ` (${v.locale})` : ""}` : id);
        if (popup) popup.appendChild(item);
      }
      // Select saved voice (fall back to first).
      sel.value = saved;
      if (!sel.selectedItem && list.length) sel.selectedIndex = 0;
      sel.addEventListener("command", () => {
        Zotero.Prefs.set("extensions.kokoro-pronunciations.voice", sel.value);
      });
    } catch (e) {
      // Non-fatal: leave the voice selector empty; playback will warn if used.
      const d = this.describeError(e);
      this.toast(`Could not load voices. ${d.message}`, d.type);
    }
  },

  on(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  },

  saveServerURL() {
    const urlInput = document.getElementById("kokoro-pron-server-url");
    const raw = (urlInput?.value || "").trim();
    if (!raw) {
      this.toast("Enter a server URL first.", "error");
      return;
    }
    if (!/^https?:\/\//i.test(raw)) {
      this.toast("Server URL must start with http:// or https://", "error");
      return;
    }
    this.serverURL = raw.replace(/\/+$/, "");
    if (urlInput) urlInput.value = this.serverURL;
    Zotero.Prefs.set("extensions.kokoro-pronunciations.serverURL", this.serverURL);
    this.toast("Saved server URL.", "success");
  },

  // Wraps fetch and classifies failures so the UI can explain *why*
  // something failed (server unreachable vs. server error vs. bad request),
  // instead of surfacing a bare "NetworkError" or status code.
  async api(path, { method = "GET", body = null } = {}) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body !== null) options.body = JSON.stringify(body);
    const url = new URL(path, this.serverURL + "/").href;

    let response;
    try {
      response = await fetch(url, options);
    } catch (e) {
      const err = new Error(
        `Cannot reach the Kokoro server at ${this.serverURL}. ` +
        `Check that the server is running and the SSH tunnel (local port 8880) is up.`
      );
      err.kind = "network";
      err.cause = e;
      throw err;
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

    if (!response.ok) {
      let detail = (data && typeof data === "object" && data.detail) ? data.detail
                 : (typeof data === "string" && data) ? data
                 : response.statusText || "";
      if (Array.isArray(detail)) {
        detail = detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
      }
      const err = new Error(detail ? `${detail} (HTTP ${response.status})` : `HTTP ${response.status}`);
      err.kind = response.status >= 500 ? "server" : "request";
      err.status = response.status;
      throw err;
    }
    return data;
  },

  // Centralized error explainer: turns an error into a human message + class.
  describeError(e) {
    if (e?.kind === "network") return { message: e.message, type: "error" };
    if (e?.kind === "server") return { message: `Server error: ${e.message}`, type: "error" };
    if (e?.kind === "request") return { message: e.message, type: "warning" };
    return { message: String(e?.message || e), type: "error" };
  },

  async healthCheck() {
    const btn = document.getElementById("kokoro-pron-health");
    await this.withBusy(btn, async () => {
      try {
        const result = await this.api("/health");
        const status = result?.status || JSON.stringify(result);
        this.toast(`Server healthy (${status}).`, "success");
      } catch (e) {
        const d = this.describeError(e);
        this.toast(`Health check failed. ${d.message}`, d.type);
      }
    });
  },

  async clearCache() {
    const btn = document.getElementById("kokoro-pron-clear-cache");
    await this.withBusy(btn, async () => {
      try {
        const result = await this.api("/api/cache/clear", { method: "POST" });
        this.toast(`Cleared ${result.cleared} cached audio item(s).`, "success");
      } catch (e) {
        const d = this.describeError(e);
        this.toast(`Cache clear failed. ${d.message}`, d.type);
      }
    });
  },

  async refreshRules({ quiet = false } = {}) {
    const btn = document.getElementById("kokoro-pron-refresh");
    await this.withBusy(btn, async () => {
      try {
        const doc = await this.api("/api/pronunciations");
        const rules = doc.rules || [];
        this._rules = rules; // cache for duplicate detection
        this.renderRules(rules);
        if (!quiet) this.toast(`Loaded ${rules.length} pronunciation rule(s).`, "info");
      } catch (e) {
        const d = this.describeError(e);
        this.renderRules([]);
        this.toast(`Failed to load rules. ${d.message}`, d.type);
      }
    });
  },

  renderRules(rules) {
    const grid = document.getElementById("kokoro-pron-rules");
    if (!grid) return;
    const XHTML = "http://www.w3.org/1999/xhtml";
    // Keep the 6 header cells; remove everything after them.
    const heads = grid.querySelectorAll(".kokoro-grid-head");
    while (grid.children.length > heads.length) {
      grid.removeChild(grid.lastChild);
    }
    if (!rules.length) {
      const empty = document.createElementNS(XHTML, "div");
      empty.className = "kokoro-empty kokoro-grid-empty";
      empty.textContent = "No pronunciation rules yet. Add one above.";
      grid.appendChild(empty);
      return;
    }
    const cell = (cls, text) => {
      const d = document.createElementNS(XHTML, "div");
      d.className = "kokoro-cell" + (cls ? " " + cls : "");
      if (text != null) d.textContent = text;
      grid.appendChild(d);
      return d;
    };
    for (const rule of rules) {
      // On/off toggle switch (enables/disables the rule via PATCH).
      const onCell = cell("kokoro-col-on", null);
      const toggle = document.createElementNS(XHTML, "div");
      toggle.className = "kokoro-switch" + (rule.enabled ? " kokoro-switch-on" : "");
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", rule.enabled ? "true" : "false");
      toggle.setAttribute("tabindex", "0");
      toggle.title = rule.enabled ? "Enabled: click to disable" : "Disabled: click to enable";
      const knob = document.createElementNS(XHTML, "div");
      knob.className = "kokoro-knob";
      toggle.appendChild(knob);
      const flip = () => {
        const next = !toggle.classList.contains("kokoro-switch-on");
        this.toggleRule(rule.id, next, toggle);
      };
      toggle.addEventListener("click", flip);
      toggle.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
      });
      onCell.appendChild(toggle);

      cell(null, rule.pattern || "");
      cell(null, rule.replacement || rule.phonemes || "");
      cell(null, rule.match || "literal");
      cell(null, rule.case_sensitive ? "yes" : "no");
      const actionCell = cell("kokoro-col-actions kokoro-actions", null);
      const playBtn = document.createElementNS(XHTML, "button");
      playBtn.textContent = "▶";
      playBtn.title = "Play this pronunciation";
      playBtn.addEventListener("click", () => this.playText(rule.replacement || rule.phonemes || rule.pattern || ""));
      actionCell.appendChild(playBtn);
      const button = document.createElementNS(XHTML, "button");
      button.textContent = "Delete";
      button.className = "kokoro-danger";
      button.addEventListener("click", () => this.deleteRule(rule.id, rule.pattern));
      actionCell.appendChild(button);
    }
  },

  async toggleRule(id, enabled, switchEl) {
    if (!id) return;
    // Optimistically reflect the new state.
    const apply = (on) => {
      if (!switchEl) return;
      switchEl.classList.toggle("kokoro-switch-on", on);
      switchEl.setAttribute("aria-checked", on ? "true" : "false");
      switchEl.title = on ? "Enabled: click to disable" : "Disabled: click to enable";
    };
    apply(enabled);
    try {
      await this.api(`/api/pronunciations/${encodeURIComponent(id)}`, {
        method: "PATCH", body: { enabled }
      });
      this.toast(enabled ? "Rule enabled." : "Rule disabled.", "success");
    } catch (e) {
      apply(!enabled); // revert on failure
      const d = this.describeError(e);
      this.toast(`Could not ${enabled ? "enable" : "disable"} rule. ${d.message}`, d.type);
    }
  },

  // Synthesize `text` via the server's OpenAI-compatible /v1/audio/speech
  // endpoint and play the resulting WAV through the pane's <audio> element.
  async playText(text, busyBtn) {
    text = String(text || "").trim();
    if (!text) { this.toast("Nothing to play.", "warning"); return; }
    const voice = document.getElementById("kokoro-pron-voice")?.value || "af_heart";
    if (!voice) {
      this.toast("No voice available. Check the server is reachable.", "error");
      return;
    }
    const btn = busyBtn || document.getElementById("kokoro-pron-preview");
    await this.withBusy(btn, async () => {
      this.toast("Synthesizing audio…", "info");
      let blobUrl;
      try {
        const url = new URL("/v1/audio/speech", this.serverURL + "/").href;
        let resp;
        try {
          resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: text, voice, response_format: "wav" })
          });
        } catch (netErr) {
          const e = new Error(
            `Cannot reach the Kokoro server at ${this.serverURL}. ` +
            `Check the server and SSH tunnel (local port 8880).`
          );
          e.kind = "network"; throw e;
        }
        if (!resp.ok) {
          let detail = resp.statusText;
          try { const j = await resp.json(); detail = j.detail || detail; } catch (_) {}
          const e = new Error(`${detail} (HTTP ${resp.status})`);
          e.kind = resp.status >= 500 ? "server" : "request";
          throw e;
        }
        const buf = await resp.arrayBuffer();
        const blob = new Blob([buf], { type: "audio/wav" });
        blobUrl = (window.URL || window.webkitURL).createObjectURL(blob);

        const audio = document.getElementById("kokoro-pron-audio");
        const stopBtn = document.getElementById("kokoro-pron-stop");
        if (!audio) { this.toast("Audio element missing.", "error"); return; }
        this.stopPlayback();
        this._lastBlobUrl = blobUrl;
        audio.src = blobUrl;
        if (stopBtn) stopBtn.hidden = false;
        audio.onended = () => { if (stopBtn) stopBtn.hidden = true; this._revokeBlob(); };
        audio.onerror = () => {
          this.toast("Playback failed in the audio element.", "error");
          if (stopBtn) stopBtn.hidden = true;
          this._revokeBlob();
        };
        await audio.play();
        this.toast(`Playing "${this.truncate(text, 40)}" (${voice}).`, "success");
      } catch (e) {
        if (blobUrl) { try { (window.URL || window.webkitURL).revokeObjectURL(blobUrl); } catch (_) {} }
        const d = this.describeError(e);
        this.toast(`Could not play audio. ${d.message}`, d.type);
      }
    });
  },

  truncate(text, max) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  },

  stopPlayback() {
    const audio = document.getElementById("kokoro-pron-audio");
    const stopBtn = document.getElementById("kokoro-pron-stop");
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (_) {}
    }
    if (stopBtn) stopBtn.hidden = true;
    this._revokeBlob();
  },

  _revokeBlob() {
    if (this._lastBlobUrl) {
      try { (window.URL || window.webkitURL).revokeObjectURL(this._lastBlobUrl); } catch (_) {}
      this._lastBlobUrl = null;
    }
  },

  // Preview now synthesizes and plays the new pronunciation audio.
  async previewRule() {
    const pattern = document.getElementById("kokoro-pron-pattern")?.value?.trim();
    const replacement = document.getElementById("kokoro-pron-replacement")?.value?.trim();
    const spoken = replacement || pattern;
    if (!spoken) {
      this.toast("Enter an input and/or pronunciation to preview.", "warning");
      return;
    }
    await this.playText(spoken, document.getElementById("kokoro-pron-preview"));
  },

  async addRule() {
    const patternEl = document.getElementById("kokoro-pron-pattern");
    const replacementEl = document.getElementById("kokoro-pron-replacement");
    const pattern = patternEl?.value?.trim();
    const replacement = replacementEl?.value?.trim();
    const match = document.getElementById("kokoro-pron-match")?.value || "literal";
    if (!pattern) {
      this.toast("Input symbol/word is required.", "warning");
      patternEl?.focus();
      return;
    }
    if (!replacement) {
      this.toast("\"Pronounce as\" value is required.", "warning");
      replacementEl?.focus();
      return;
    }
    if (match === "regex") {
      try { new RegExp(pattern); }
      catch (e) {
        this.toast(`Invalid regex: ${e.message}`, "error");
        patternEl?.focus();
        return;
      }
    }
    const btn = document.getElementById("kokoro-pron-add");
    await this.withBusy(btn, async () => {
      try {
        // Duplicate detection: refuse to add a rule whose pattern + match
        // mode already exists. Refresh first so the check is against the
        // current server state, not a stale cache.
        try {
          const doc = await this.api("/api/pronunciations");
          this._rules = doc.rules || [];
          this.renderRules(this._rules);
        } catch (_) { /* fall back to cached this._rules */ }
        const dup = this.findDuplicate(pattern, match);
        if (dup) {
          const target = dup.replacement || dup.phonemes || "";
          this.toast(
            `A "${match}" rule for "${pattern}" already exists${target ? ` -> ${target}` : ""}. Not added.`,
            "warning"
          );
          patternEl?.focus();
          return;
        }
        await this.api("/api/pronunciations", { method: "POST", body: {
          pattern, replacement, match,
          case_sensitive: match === "literal",
          description: "Added from Zotero preferences"
        }});
        if (patternEl) patternEl.value = "";
        if (replacementEl) replacementEl.value = "";
        await this.refreshRules({ quiet: true });
        this.toast(`Added: ${pattern} -> ${replacement}`, "success");
        patternEl?.focus();
      } catch (e) {
        const d = this.describeError(e);
        this.toast(`Add failed. ${d.message}`, d.type);
      }
    });
  },

  // A rule duplicates an existing one when the match mode is the same and the
  // pattern matches. Literal rules are case-sensitive; word/regex are compared
  // case-insensitively to match how the server keys them.
  findDuplicate(pattern, match) {
    const rules = this._rules || [];
    const ci = match !== "literal";
    const norm = (s) => ci ? String(s || "").toLowerCase() : String(s || "");
    const p = norm(pattern);
    return rules.find((r) => (r.match || "literal") === match && norm(r.pattern) === p) || null;
  },

  async deleteRule(id, label) {
    if (!id) return;
    try {
      await this.api(`/api/pronunciations/${encodeURIComponent(id)}`, { method: "DELETE" });
      await this.refreshRules({ quiet: true });
      this.toast(`Deleted${label ? `: ${label}` : " rule"}.`, "success");
    } catch (e) {
      const d = this.describeError(e);
      this.toast(`Delete failed. ${d.message}`, d.type);
    }
  },

  // Disable a button + show a spinner-ish state while an async action runs,
  // so rapid double-clicks don't fire duplicate requests.
  async withBusy(btn, fn) {
    let prevText;
    if (btn) {
      btn.disabled = true;
      prevText = btn.textContent;
      btn.classList.add("kokoro-busy");
    }
    try {
      return await fn();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("kokoro-busy");
        if (prevText !== undefined) btn.textContent = prevText;
      }
    }
  },

  // Toast notification: transient, color-coded by type, auto-dismisses.
  toast(message, type = "info") {
    const host = document.getElementById("kokoro-pron-toast");
    if (!host) return;
    host.textContent = message;
    host.className = `kokoro-toast kokoro-toast-${type} kokoro-toast-show`;
    const win = host.ownerDocument.defaultView;
    if (this._toastTimer) {
      try { win.clearTimeout(this._toastTimer); } catch (_) {}
    }
    const delay = type === "error" ? 7000 : 4000;
    this._toastTimer = win.setTimeout(() => {
      host.className = "kokoro-toast";
    }, delay);
  },

  escape(value) {
    return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  }
};

// Zotero injects the preference-pane DOM asynchronously, often AFTER this
// script is evaluated (the prefs window is already "complete"). If we call
// init() immediately, getElementById() returns null for every pane node, no
// listeners bind, and the page looks inert (no toasts, dead Add/Preview).
// So: poll for a known pane node, then init exactly once.
(function bootstrapPrefs() {
  let tries = 0;
  const log = (m) => { try { Zotero.debug("Kokoro Pronunciations prefs: " + m); } catch (_) {} };
  const defer = (fn, ms) => {
    const w = (typeof window !== "undefined" && window) || (document && document.defaultView);
    if (w && w.setTimeout) return w.setTimeout(fn, ms);
    if (typeof setTimeout !== "undefined") return setTimeout(fn, ms);
    // No timer available: fall back to a single immediate attempt.
    return fn();
  };
  const ready = () => !!document.getElementById("kokoro-pron-add");
  const start = () => {
    if (KokoroPronunciationPrefs._initialized) return;
    KokoroPronunciationPrefs._initialized = true;
    try {
      KokoroPronunciationPrefs.init();
      log("init complete");
    } catch (e) {
      log("init FAILED: " + (e && e.stack ? e.stack : e));
    }
  };
  const tick = () => {
    if (ready()) { log(`pane DOM present after ${tries} tick(s)`); start(); return; }
    if (tries++ > 100) { log("gave up waiting for pane DOM"); return; }
    defer(tick, 50);
  };
  tick();
})();

