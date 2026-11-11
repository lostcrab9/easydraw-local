// Real-UI check for element default preferences: set them in the dialog, draw
// each kind, and confirm restyling one element never leaks into the next.
// Run with `npm run preferences:smoke`.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const WebSocket = require("ws");

// Reuse the desktop's isolated test profile and real bridge, never the user's project.
process.env.EASYDRAW_LIVE_SMOKE = "1";
process.env.EASYDRAW_DEVELOPMENT_URL = pathToFileURL(path.resolve("dist/index.html")).href;
require("../electron/main.cjs");

const outputDir = process.env.EASYDRAW_PREFERENCES_SMOKE_OUT || path.join(os.tmpdir(), "easydraw-preferences-smoke");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
const timeout = setTimeout(() => { console.error("Preferences smoke timed out"); app.exit(1); }, 60_000);

app.whenReady().then(async () => {
  try {
    let window;
    for (let i = 0; i < 100; i++) {
      window = BrowserWindow.getAllWindows()[0];
      if (window && await window.webContents.executeJavaScript("!!document.querySelector('.app-shell')")) break;
      await delay(50);
    }
    assert(window, "isolated workbench did not start");
    window.webContents.setBackgroundThrottling(false);
    const run = (source) => window.webContents.executeJavaScript(source);
    await run("localStorage.removeItem('easydraw:element-defaults:v2'); window.easydrawDesktop.setMcpEnabled(true)");
    const descriptor = JSON.parse(await fs.readFile(path.join(app.getPath("userData"), "mcp-bridge.json"), "utf8"));
    const url = new URL(descriptor.endpoint); url.searchParams.set("token", descriptor.token);
    socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let sequence = 0;
    const waiting = new Map();
    socket.on("message", (raw) => {
      const response = JSON.parse(String(raw));
      const pending = waiting.get(response.id);
      if (!pending) return;
      waiting.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(`${response.error.code}: ${response.error.message}`));
    });
    const call = (method, params) => new Promise((resolve, reject) => {
      const id = String(++sequence); waiting.set(id, { resolve, reject });
      socket.send(JSON.stringify({ type: "request", id, method, params: method === "apply_operations" ? { taskId: "prefs", ...params } : params }));
    });

    const status = await call("get_status", {});
    const doc = { documentId: status.documentId, canvasId: status.canvasId };
    const scope = { kind: "document" };
    const initial = await call("query_elements", { ...doc, scope, limit: 200 });
    if (initial.elements.length) {
      await call("begin_task", { ...doc, taskId: "prefs", label: "Clear", scope });
      await call("apply_operations", { ...doc, baseRevision: status.revision, requestId: "clear", label: "Clear test fixture",
        operations: [{ op: "delete", ids: initial.elements.map((e) => e.id), children: "delete" }] });
      await call("finish_task", { ...doc, taskId: "prefs", status: "completed" });
    }
    await call("set_view_state", { ...doc, scrollX: 0, scrollY: 0, zoom: 1, selection: [] });
    await delay(300);

    // 1. Set preferences through the dialog opened from the main menu.
    const clickSelector = async (selector) => {
      const found = await run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.click(); return !!el; })()`);
      assert.ok(found, `missing ${selector}`);
      await delay(120);
    };
    const pickInField = async (fieldIndex, label) => {
      const found = await run(`(() => {
        const field = document.querySelectorAll('.preferences-field')[${fieldIndex}];
        const button = [...field.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.textContent === ${JSON.stringify(label)});
        button?.click(); return !!button;
      })()`);
      assert.ok(found, `missing option ${label} in field ${fieldIndex}`);
      await delay(80);
    };
    await clickSelector('[data-testid="main-menu-trigger"]');
    const entry = await run(`(() => {
      const item = document.querySelector('[data-testid="main-menu-preferences"]');
      const items = [...item.parentElement.children];
      return { icon: !!item.querySelector('svg'), first: items[0] === item, next: item.nextElementSibling?.getAttribute('data-testid') ?? item.nextElementSibling?.tagName };
    })()`);
    assert.ok(entry.icon && entry.first && entry.next !== "DIV", `preferences entry has an icon and no separator after it ${JSON.stringify(entry)}`);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "preferences-menu.png"), (await window.webContents.capturePage()).toPNG());
    await clickSelector('[data-testid="main-menu-preferences"]');
    assert.ok(await run("!!document.querySelector('.preferences-dialog')"), "preferences dialog opens from the main menu");
    await clickSelector('[data-testid="preferences-kind-shape"]');
    await pickInField(0, "#1971c2"); // stroke
    await pickInField(1, "#a5d8ff"); // fill
    await clickSelector('[data-testid="preferences-kind-note"]');
    await pickInField(0, "蓝色");
    await clickSelector('[data-testid="preferences-kind-frame"]');
    await pickInField(0, "#ffec99");
    await pickInField(1, "直角"); // corners: sharp
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "preferences-dialog.png"), (await window.webContents.capturePage()).toPNG());
    await clickSelector(".preferences-dialog .primary-action");
    const stored = JSON.parse(await run("localStorage.getItem('easydraw:element-defaults:v2')"));
    assert.equal(stored.shape.strokeColor, "#1971c2", "preferences are saved on this device");
    assert.equal(stored.text, undefined, "untouched kinds are not stored, so they follow future defaults");

    // 2. Draw each kind.
    const origin = await run(`(() => { const r = document.querySelector('canvas.easydraw__canvas.interactive').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
    const at = (x, y) => ({ x: Math.round(x + origin.x), y: Math.round(y + origin.y) });
    const input = (event) => window.webContents.sendInputEvent(event);
    const key = async (keyCode) => {
      input({ type: "keyDown", keyCode }); input({ type: "char", keyCode }); input({ type: "keyUp", keyCode });
      await delay(80);
    };
    const click = async ({ x, y }) => {
      input({ type: "mouseMove", x, y });
      input({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      input({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
      await delay(150);
    };
    const drag = async (from, to) => {
      input({ type: "mouseMove", x: from.x, y: from.y });
      input({ type: "mouseDown", x: from.x, y: from.y, button: "left", clickCount: 1 });
      for (let step = 1; step <= 6; step++) {
        input({ type: "mouseMove", x: Math.round(from.x + (to.x - from.x) * step / 6), y: Math.round(from.y + (to.y - from.y) * step / 6), button: "left" });
        await delay(25);
      }
      input({ type: "mouseUp", x: to.x, y: to.y, button: "left", clickCount: 1 });
      await delay(250);
    };
    const elements = async () => (await call("query_elements", { ...doc, scope, limit: 50 })).elements;
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 60; i++) { const value = await predicate(); if (value) return value; await delay(100); }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const created = async (type) => waitFor(async () => { const list = (await elements()).filter((e) => e.type === type); return list.length ? list : null; }, `${type} commit`);

    window.webContents.focus();
    await click(at(900, 600));
    await key("r");
    await drag(at(60, 80), at(200, 160));
    const [rect] = await created("rectangle");
    assert.equal(rect.strokeColor, "#1971c2", "rectangle uses the shape stroke preference");
    assert.equal(rect.backgroundColor, "#a5d8ff", "rectangle uses the shape fill preference");

    // Restyle the selected rectangle from the floating bar: green stroke.
    await clickSelector('.selection-toolbar__trigger[aria-label="描边"]');
    await clickSelector('[data-testid="color-top-pick-#2f9e44"]');
    await waitFor(async () => (await elements()).find((e) => e.id === rect.id)?.strokeColor === "#2f9e44", "restyled rectangle");

    // The next ellipse still follows the preference, not the restyled rectangle.
    // (Close the colour picker first: it uses letter keys as colour hotkeys.)
    await key("Escape");
    await click(at(900, 600));
    await key("o");
    await drag(at(260, 80), at(400, 160));
    const [ellipse] = await created("ellipse");
    assert.equal(ellipse.strokeColor, "#1971c2", "restyling one element does not change the next one");

    // Arrows have their own defaults, unaffected by shape preferences.
    await key("a");
    await drag(at(60, 220), at(260, 220));
    const [arrow] = await created("arrow");
    assert.equal(arrow.strokeColor, "#e03131", "arrows keep their own default (red)");

    await key("n");
    await click(at(460, 80));
    await delay(200);
    await key("Escape");
    const [note] = await created("note");
    assert.equal(note.backgroundColor.toLowerCase(), "#d0ebff", "notes use the note colour preference");

    await key("f");
    await drag(at(60, 300), at(360, 520));
    const [frame] = await created("frame");
    assert.equal(frame.backgroundColor, "#ffec99", "pages use the container background preference");
    assert.equal(frame.roundness, null, "pages use the container corner preference");

    await fs.writeFile(path.join(outputDir, "preferences-drawn.png"), (await window.webContents.capturePage()).toPNG());
    console.log(`Screenshots: ${outputDir}`);
    console.log("Preferences smoke passed");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout); socket?.close(); app.exit(process.exitCode || 0);
  }
});
