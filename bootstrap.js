var Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

var PLUGIN_ID = "kokoro-pronunciations@xamspanda.github.io";
var CHROME_NAME = "kokoro-pronunciations";
var mainScript;
var addonRootURI;
var chromeHandle;

function log(message) {
  message = `Kokoro Pronunciations bootstrap: ${message}`;
  if (typeof Zotero !== "undefined" && Zotero.debug) Zotero.debug(message);
  else dump(`${message}\n`);
}

function alertStartupFailure(err) {
  try {
    Services.prompt.alert(null, "Kokoro Pronunciations startup failed", `${err}\n${err?.stack || ""}`);
  } catch (_) {}
}

function install(data, reason) {
  log("install");
}

function uninstall(data, reason) {
  log("uninstall");
}

async function startup(data, reason) {
  try {
    addonRootURI = data.rootURI || data.resourceURI.spec;
    log(`startup from ${addonRootURI}`);
    var aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(`${addonRootURI}manifest.json`);
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", CHROME_NAME, "content/"]
    ]);
    var scriptTarget = {
      Zotero,
      Services,
      Cc,
      Ci,
      ChromeUtils,
      rootURI: addonRootURI,
      setTimeout,
      clearTimeout,
      fetch
    };
    Services.scriptloader.loadSubScriptWithOptions(`${addonRootURI}modules/main.js`, {
      charset: "utf-8",
      target: scriptTarget
    });
    mainScript = new scriptTarget.KokoroPronunciations.Main({ pluginID: PLUGIN_ID, rootURI: addonRootURI });
    await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);
    await mainScript.startup();
    for (const win of Zotero.getMainWindows()) {
      await onMainWindowLoad({ window: win });
    }
    log("startup done");
  } catch (err) {
    log(`${err}\n${err?.stack || ""}`);
    alertStartupFailure(err);
  }
}

async function shutdown(data, reason) {
  try {
    log("shutdown");
    if (mainScript) {
      await mainScript.shutdown();
      mainScript = null;
    }
    if (chromeHandle) {
      chromeHandle.destruct();
      chromeHandle = null;
    }
  } catch (err) {
    log(`${err}\n${err?.stack || ""}`);
  }
}

async function onMainWindowLoad({ window }) {
  try {
    if (mainScript?.onMainWindowLoad) await mainScript.onMainWindowLoad(window);
  } catch (err) {
    log(`onMainWindowLoad failed: ${err}\n${err?.stack || ""}`);
  }
}

async function onMainWindowUnload({ window }) {
  try {
    if (mainScript?.onMainWindowUnload) await mainScript.onMainWindowUnload(window);
  } catch (err) {
    log(`onMainWindowUnload failed: ${err}\n${err?.stack || ""}`);
  }
}
