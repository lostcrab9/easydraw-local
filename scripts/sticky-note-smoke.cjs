// Real-UI check for sticky notes: draw with the toolbar shortcut, type, resize
// by content, drag over a page, and confirm notes stay on the canvas.
// Run with `npm run notes:smoke`; screenshots go to EASYDRAW_NOTE_SMOKE_OUT or the temp directory.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const WebSocket = require("ws");

// Reuse the desktop's isolated test profile and real bridge, never the user's project.
process.env.EASYDRAW_LIVE_SMOKE = "1";
process.env.EASYDRAW_DEVELOPMENT_URL = pathToFileURL(path.resolve("dist/index.html")).href;
require("../electron/main.cjs");

const outputDir = process.env.EASYDRAW_NOTE_SMOKE_OUT || path.join(require("node:os").tmpdir(), "easydraw-sticky-note-smoke");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
const timeout = setTimeout(() => { console.error("Sticky note smoke timed out"); app.exit(1); }, 60_000);

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
    await run("window.easydrawDesktop.setMcpEnabled(true)");
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
      socket.send(JSON.stringify({ type: "request", id, method, params: method === "apply_operations" ? { taskId: "note-edit", ...params } : params }));
    });

    let status = await call("get_status", {});
    const doc = { documentId: status.documentId, canvasId: status.canvasId };
    const scope = { kind: "document" };
    await call("begin_task", { ...doc, taskId: "note-edit", label: "Note test", scope });
    const initial = await call("query_elements", { ...doc, scope, limit: 200 });
    if (initial.elements.length) {
      await call("apply_operations", { ...doc, baseRevision: status.revision, requestId: "clear", label: "Clear test fixture",
        operations: [{ op: "delete", ids: initial.elements.map((e) => e.id), children: "delete" }] });
      status = await call("get_status", {});
    }
    await call("apply_operations", { ...doc, baseRevision: status.revision, requestId: "page", label: "Page",
      operations: [
        { op: "create", element: { id: "page", type: "frame", name: "Login", x: 80, y: 80, width: 420, height: 360 } },
        { op: "create", element: { id: "button", type: "rectangle", frameId: "page", x: 120, y: 360, width: 160, height: 44, backgroundColor: "#1f6feb", fillStyle: "solid", roughness: 0 } },
      ] });
    await call("finish_task", { ...doc, taskId: "note-edit", status: "completed" });
    await call("set_view_state", { ...doc, scrollX: 0, scrollY: 0, zoom: 1, selection: [] });
    await delay(300);

    const origin = await run(`(() => { const r = document.querySelector('canvas.easydraw__canvas.interactive').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
    const view = await call("get_view_state", doc);
    const toViewport = (sceneX, sceneY) => ({
      x: Math.round((sceneX + view.scrollX) * view.zoom + origin.x),
      y: Math.round((sceneY + view.scrollY) * view.zoom + origin.y),
    });
    const input = (event) => window.webContents.sendInputEvent(event);
    const key = async (keyCode, modifiers = []) => {
      input({ type: "keyDown", keyCode, modifiers });
      if (keyCode.length === 1 && !modifiers.length) input({ type: "char", keyCode, modifiers });
      input({ type: "keyUp", keyCode, modifiers });
      await delay(60);
    };
    const click = async ({ x, y }, clickCount = 1) => {
      input({ type: "mouseMove", x, y });
      input({ type: "mouseDown", x, y, button: "left", clickCount });
      input({ type: "mouseUp", x, y, button: "left", clickCount });
      await delay(120);
    };
    const drag = async (from, to) => {
      input({ type: "mouseMove", x: from.x, y: from.y });
      input({ type: "mouseDown", x: from.x, y: from.y, button: "left", clickCount: 1 });
      for (let step = 1; step <= 6; step++) {
        input({ type: "mouseMove", x: Math.round(from.x + (to.x - from.x) * step / 6), y: Math.round(from.y + (to.y - from.y) * step / 6), button: "left" });
        await delay(25);
      }
      input({ type: "mouseUp", x: to.x, y: to.y, button: "left", clickCount: 1 });
      await delay(200);
    };
    const notes = async () => (await call("query_elements", { ...doc, scope, types: ["note"], limit: 50 })).elements;
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 60; i++) { const value = await predicate(); if (value) return value; await delay(100); }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const editorOpen = () => run("!!document.querySelector('textarea[data-note-editor]')");

    window.webContents.focus();
    await click(toViewport(700, 60)); // focus the canvas on blank space

    // 1. N + click over the page: a default-sized note, editor open at once.
    await key("n");
    await click(toViewport(150, 120));
    await waitFor(editorOpen, "note editor after click");
    window.webContents.insertText("登录按钮点击后\n校验手机号格式，失败时在输入框下方提示");
    for (let i = 0; i < 5; i++) { await delay(40); window.webContents.insertText(`\n规则 ${i + 1}`); }
    await key("Escape");
    const [clicked] = await waitFor(async () => { const list = await notes(); return list.length === 1 && list[0].content?.text?.includes("规则 5") && list; }, "first note commit");
    assert.equal(clicked.frameId, null, "a note created over a page stays on the canvas");
    assert.equal(clicked.width, 200, "a click places the default width");
    assert.ok(clicked.height > 120, `auto height grows with the text (height ${clicked.height})`);
    assert.equal(await editorOpen(), false, "Escape closes the editor");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "sticky-note-created.png"), (await window.webContents.capturePage()).toPNG());

    // 2. N + drag on blank canvas: the drag sets the size; an empty note stays.
    await key("n");
    await drag(toViewport(560, 120), toViewport(820, 260));
    await waitFor(editorOpen, "note editor after drag");
    await key("Escape");
    const dragged = await waitFor(async () => (await notes()).find((n) => n.id !== clicked.id), "dragged note");
    assert.ok(Math.abs(dragged.width - 260) <= 2 && Math.abs(dragged.height - 140) <= 2, `drag sets the size (${dragged.width}x${dragged.height})`);
    assert.equal(dragged.content.text, "", "an empty note is kept");

    // 3. Double-click edits; dragging the note into the page keeps it on the canvas.
    await click(toViewport(600, 160), 1);
    await click(toViewport(600, 160), 2);
    input({ type: "mouseUp", x: toViewport(600, 160).x, y: toViewport(600, 160).y, button: "left", clickCount: 2 });
    await waitFor(editorOpen, "note editor after double-click");
    window.webContents.insertText("待确认：是否支持邮箱登录");
    await key("Escape");
    await waitFor(async () => (await notes()).find((n) => n.id === dragged.id)?.content.text.includes("邮箱"), "double-click edit");
    await click(toViewport(600, 160));
    await drag(toViewport(600, 160), toViewport(260, 220));
    const moved = await waitFor(async () => { const n = (await notes()).find((n) => n.id === dragged.id); return n && n.x < 400 && n; }, "note dragged over page");
    assert.equal(moved.frameId, null, "dragging a note into a page keeps it on the canvas");

    // 4. Pages do not take notes along, and notes cannot be grouped.
    await click(toViewport(260, 220));
    await key("g", ["meta"]);
    await delay(300);
    assert.deepEqual((await notes()).find((n) => n.id === dragged.id).groupIds, [], "Cmd+G does not group a note");

    await fs.writeFile(path.join(outputDir, "sticky-note-over-page.png"), (await window.webContents.capturePage()).toPNG());

    // 5. The note tool sits between the arrow and image tools.
    const toolOrder = await run(`(() => {
      const left = (selector) => document.querySelector(selector)?.closest("label, .easydraw-image-tool")?.getBoundingClientRect().left;
      return { arrow: left('[data-testid="toolbar-arrow"]'), note: left('[data-testid="toolbar-note"]'), image: left('.easydraw-image-tool') };
    })()`);
    assert.ok(toolOrder.arrow < toolOrder.note && toolOrder.note < toolOrder.image, `note tool after arrow, before image ${JSON.stringify(toolOrder)}`);

    // 6. Box-selecting a page selects the page only, not its members; so does Cmd+A.
    await key("Escape");
    await click(toViewport(700, 60));
    await drag(toViewport(580, 480), toViewport(50, 60));
    const boxed = (await call("get_view_state", doc)).selection;
    assert.ok(boxed.includes("page"), `box selection includes the page ${JSON.stringify(boxed)}`);
    assert.ok(!boxed.includes("button"), `box selection leaves page members out ${JSON.stringify(boxed)}`);
    await click(toViewport(700, 60));
    await key("a", ["meta"]);
    await delay(200);
    const all = (await call("get_view_state", doc)).selection;
    assert.ok(all.includes("page") && !all.includes("button"), `select all leaves page members out ${JSON.stringify(all)}`);
    await fs.writeFile(path.join(outputDir, "page-box-selection.png"), (await window.webContents.capturePage()).toPNG());

    const outline = await call("get_outline", { ...doc, scope });
    assert.ok(outline.items.some((item) => item.type === "note" && item.textPreview?.includes("登录按钮")), "outline shows note text");
    console.log(`Screenshots: ${outputDir}`);
    console.log(`Sticky note smoke passed: ${JSON.stringify((await notes()).map(({ id, x, y, width, height, frameId, autoHeight }) => ({ id, x, y, width, height, frameId, autoHeight })))}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout); socket?.close(); app.exit(process.exitCode || 0);
  }
});
