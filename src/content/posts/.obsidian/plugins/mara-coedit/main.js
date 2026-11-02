"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MaraCoeditPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state2 = require("@codemirror/state");
var import_commands = require("@codemirror/commands");
var import_view2 = require("@codemirror/view");
var import_http = require("http");
var import_crypto = require("crypto");
var import_promises = require("fs/promises");

// edits.ts
var MAX_EDITS = 40;
var BLANK = /^[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/;
var LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
function occurs(text, part) {
  const at = text.indexOf(part);
  if (at < 0) return [0, -1];
  return [text.indexOf(part, at + 1) >= 0 ? 2 : 1, at];
}
function countOf(text, part) {
  return text.split(part).length - 1;
}
function crlf(text) {
  return text.split("\r\n").join("\n").split("\n").join("\r\n");
}
function sameRange(origin, place, at, length) {
  if (place + length > origin.length) return false;
  for (let i = 0; i < length; i++) {
    if (origin[place + i] !== at + i) return false;
  }
  return true;
}
function matchEdits(text, edits) {
  const breaks = countOf(text, "\n");
  const crlfDoc = breaks > 0 && countOf(text, "\r\n") * 2 > breaks;
  let work = text;
  let origin = Array.from({ length: text.length }, (_, i) => i);
  const kept = [];
  const dropped = [];
  for (const item of edits) {
    const e = typeof item === "object" && item !== null && !Array.isArray(item) ? item : {};
    let old = typeof e.old === "string" ? e.old : "";
    let neu = typeof e.new === "string" ? e.new : "";
    let why = "";
    let at = -1;
    if (typeof e.old !== "string" || typeof e.new !== "string") {
      why = "malformed";
    } else if (LONE_SURROGATE.test(old) || LONE_SURROGATE.test(neu)) {
      why = "surrogate";
    } else if (kept.length >= MAX_EDITS) {
      why = "too many";
    } else if (BLANK.test(old)) {
      why = "empty";
    } else if (old === neu) {
      why = "unchanged";
    }
    if (!why) {
      let tries = [old];
      if (old.includes("\n") && text.includes("\r\n") && !old.includes("\r\n")) {
        tries = crlfDoc ? [crlf(old), old] : [old, crlf(old)];
      }
      let count = 0;
      let tried = old;
      for (tried of tries) {
        [count, at] = occurs(text, tried);
        if (count) break;
      }
      if (count && (crlfDoc || tried !== old)) {
        old = tried;
        neu = crlf(neu);
      }
      if (count === 0) {
        why = "missing";
      } else if (count > 1) {
        why = "ambiguous";
      } else {
        const [seen, place] = occurs(work, old);
        if (seen !== 1 || !sameRange(origin, place, at, old.length)) {
          why = "conflicts";
        } else {
          work = work.slice(0, place) + neu + work.slice(place + old.length);
          origin = origin.slice(0, place).concat(new Array(neu.length).fill(-1), origin.slice(place + old.length));
        }
      }
    }
    if (why) dropped.push({ old, new: neu, why });
    else kept.push({ old, new: neu, at });
  }
  return { kept, dropped };
}
function editorEdits(kept) {
  return kept.map((k) => ({ ...k, new: k.new.replace(/\r\n?/g, "\n") }));
}
function planChanges(kept) {
  const sorted = [...kept].sort((a, b) => a.at - b.at);
  const changes = [];
  let delta = 0;
  for (const k of sorted) {
    const from = k.at;
    const to = k.at + k.old.length;
    const newFrom = from + delta;
    changes.push({ from, to, insert: k.new, newFrom, newTo: newFrom + k.new.length });
    delta += k.new.length - (to - from);
  }
  return changes;
}
var MAX_DIFF = 600;
function lines(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const j = text.indexOf("\n", i);
    if (j < 0) {
      out.push(text.slice(i));
      break;
    }
    out.push(text.slice(i, j + 1));
    i = j + 1;
  }
  return out;
}
function isHigh(code) {
  return code >= 55296 && code <= 56319;
}
function isLow(code) {
  return code >= 56320 && code <= 57343;
}
function narrow(a, b, fromA, toA, fromB, toB) {
  while (fromA < toA && fromB < toB && a.charCodeAt(fromA) === b.charCodeAt(fromB)) {
    fromA++;
    fromB++;
  }
  while (toA > fromA && toB > fromB && a.charCodeAt(toA - 1) === b.charCodeAt(toB - 1)) {
    toA--;
    toB--;
  }
  while (fromA > 0 && isLow(a.charCodeAt(fromA)) && isHigh(a.charCodeAt(fromA - 1)) || fromB > 0 && isLow(b.charCodeAt(fromB)) && isHigh(b.charCodeAt(fromB - 1))) {
    fromA--;
    fromB--;
  }
  while (toA < a.length && isLow(a.charCodeAt(toA)) && toA > 0 && isHigh(a.charCodeAt(toA - 1)) || toB < b.length && isLow(b.charCodeAt(toB)) && toB > 0 && isHigh(b.charCodeAt(toB - 1))) {
    toA++;
    toB++;
  }
  return fromA === toA && fromB === toB ? null : { fromA, toA, fromB, toB };
}
function lineRuns(a, b, maxD) {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxD);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x2 = k === -d || k !== d && v[off + k - 1] < v[off + k + 1] ? v[off + k + 1] : v[off + k - 1] + 1;
      let y2 = x2 - k;
      while (x2 < n && y2 < m && a[x2] === b[y2]) {
        x2++;
        y2++;
      }
      v[off + k] = x2;
      if (x2 >= n && y2 >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;
  const deleted = /* @__PURE__ */ new Set();
  const inserted = /* @__PURE__ */ new Set();
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const w = trace[d];
    const k = x - y;
    const prevK = k === -d || k !== d && w[off + k - 1] < w[off + k + 1] ? k + 1 : k - 1;
    const prevX = w[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) inserted.add(prevY);
      else deleted.add(prevX);
    }
    x = prevX;
    y = prevY;
  }
  return groupRuns(a.length, b.length, deleted, inserted);
}
function groupRuns(n, m, deleted, inserted) {
  const runs = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (!deleted.has(i) && !inserted.has(j)) {
      i++;
      j++;
      continue;
    }
    const si = i;
    const sj = j;
    while (deleted.has(i) || inserted.has(j)) {
      if (deleted.has(i)) i++;
      else j++;
    }
    runs.push([si, i, sj, j]);
  }
  return runs;
}
function diffHunks(a, b, maxD = MAX_DIFF) {
  if (a === b) return [];
  const la = lines(a);
  const lb = lines(b);
  let pre = 0;
  while (pre < la.length && pre < lb.length && la[pre] === lb[pre]) pre++;
  let suf = 0;
  while (suf < la.length - pre && suf < lb.length - pre && la[la.length - 1 - suf] === lb[lb.length - 1 - suf]) suf++;
  const ma = la.slice(pre, la.length - suf);
  const mb = lb.slice(pre, lb.length - suf);
  const startA = la.slice(0, pre).join("").length;
  const startB = startA;
  const runs = lineRuns(ma, mb, maxD) ?? [[0, ma.length, 0, mb.length]];
  const posA = [startA];
  for (const l of ma) posA.push(posA[posA.length - 1] + l.length);
  const posB = [startB];
  for (const l of mb) posB.push(posB[posB.length - 1] + l.length);
  const out = [];
  for (const [si, ei, sj, ej] of runs) {
    const h = narrow(a, b, posA[si], posA[ei], posB[sj], posB[ej]);
    if (h) out.push(h);
  }
  return out;
}
function mapPos(hunks, pos, assoc) {
  let delta = 0;
  for (const h of hunks) {
    const before = h.toA < pos || h.toA === pos && (h.fromA < pos || assoc > 0);
    if (!before) break;
    delta += h.toB - h.fromB - (h.toA - h.fromA);
  }
  return pos + delta;
}
function rebaseChanges(changes, hunks) {
  const moved = [];
  const kept = [];
  const conflicts = [];
  changes.forEach((c, i) => {
    const touched = hunks.some((h) => h.fromA < c.to && h.toA > c.from || h.fromA === h.toA && c.from < h.fromA && h.fromA < c.to);
    if (touched) {
      conflicts.push(i);
      return;
    }
    kept.push(i);
    moved.push({ from: mapPos(hunks, c.from, 1), to: mapPos(hunks, c.to, -1), insert: c.insert, newFrom: 0, newTo: 0 });
  });
  let delta = 0;
  for (const c of moved) {
    c.newFrom = c.from + delta;
    c.newTo = c.newFrom + c.insert.length;
    delta += c.insert.length - (c.to - c.from);
  }
  return { moved, kept, conflicts };
}
function typingSegments(text, changes) {
  const out = [];
  for (const c of changes) {
    const old = text.slice(c.from, c.to);
    const h = narrow(old, c.insert, 0, old.length, 0, c.insert.length);
    if (!h) continue;
    out.push({ from: c.newFrom + h.fromB, to: c.newFrom + h.toB, old: old.slice(h.fromA, h.toA) });
  }
  return out;
}

// typing.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var BACKSPACE_SPEED = 3;
var setTyping = import_state.StateEffect.define();
var typedMark = import_view.Decoration.mark({ class: "mara-flash" });
var hidden = import_view.Decoration.replace({});
var OldText = class extends import_view.WidgetType {
  constructor(text) {
    super();
    this.text = text;
  }
  eq(other) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "mara-old";
    span.textContent = this.text;
    return span;
  }
};
var Caret = class extends import_view.WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "mara-caret";
    return span;
  }
};
var caret = new Caret();
function finished(t) {
  return t.shownOld === 0 && t.typed >= t.to - t.from;
}
var typingField = import_state.StateField.define({
  create: () => [],
  update(segs, tr) {
    for (const effect of tr.effects) if (effect.is(setTyping)) return effect.value;
    if (!segs.length || !tr.docChanged) return segs;
    return segs.map((t) => {
      const touched = tr.changes.touchesRange(t.from, t.to);
      const from = tr.changes.mapPos(t.from, 1);
      const to = Math.max(from, tr.changes.mapPos(t.to, -1));
      return touched ? { ...t, from, to, shownOld: 0, typed: to - from } : { ...t, from, to };
    });
  },
  provide: (field) => import_view.EditorView.decorations.compute([field], (state) => {
    const ranges = [];
    let caretShown = false;
    for (const t of state.field(field)) {
      if (finished(t)) {
        if (t.to > t.from) ranges.push(typedMark.range(t.from, t.to));
        continue;
      }
      const shown = t.from + t.typed;
      if (t.shownOld > 0) ranges.push(import_view.Decoration.widget({ widget: new OldText(t.old.slice(0, t.shownOld)), side: -2 }).range(t.from));
      if (shown > t.from) ranges.push(typedMark.range(t.from, shown));
      if (!caretShown) {
        ranges.push(import_view.Decoration.widget({ widget: caret, side: -1 }).range(shown));
        caretShown = true;
      }
      if (shown < t.to) ranges.push(hidden.range(shown, t.to));
    }
    return import_view.Decoration.set(ranges, true);
  })
});
var typingTheme = import_view.EditorView.baseTheme({
  ".mara-old": { textDecoration: "line-through", opacity: "0.6" },
  ".mara-caret": {
    borderLeft: "2px solid rgb(230, 160, 0)",
    marginLeft: "-1px",
    marginRight: "-1px",
    animation: "mara-blink 1s step-end infinite"
  },
  "@keyframes mara-blink": { "50%": { borderLeftColor: "transparent" } }
});
function whole(s, n) {
  return n > 0 && n < s.length && s.charCodeAt(n - 1) >= 55296 && s.charCodeAt(n - 1) <= 56319 ? n + 1 : n;
}
function advance(segs, step, sliceDoc) {
  const index = segs.findIndex((t2) => !finished(t2));
  if (index < 0) return { next: segs, index };
  const next = segs.slice();
  const t = { ...next[index] };
  if (t.shownOld > 0) {
    t.shownOld = Math.max(0, t.shownOld - step * BACKSPACE_SPEED);
    if (whole(t.old, t.shownOld) !== t.shownOld) t.shownOld -= 1;
  } else {
    t.typed = whole(sliceDoc(t.from, t.to), Math.min(t.to - t.from, t.typed + step));
  }
  next[index] = t;
  return { next, index };
}

// main.ts
var TOKEN_HEADER = "x-mara-token";
var MAX_BODY = 1024 * 1024;
var FLASH_MS = 1500;
var TICK_MS = 18;
var TYPING_MAX_MS = 5e3;
var HttpError = class extends Error {
  // answer with Connection: close and drop the socket (a body we will not read)
  constructor(status, payload, close = false) {
    super(String(payload.error));
    this.status = status;
    this.payload = payload;
    this.close = close;
  }
};
var setFlash = import_state2.StateEffect.define();
var flashMark = import_view2.Decoration.mark({ class: "mara-flash" });
var flashField = import_state2.StateField.define({
  create: () => import_view2.Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setFlash)) {
        const size = tr.state.doc.length;
        const ranges = effect.value.filter((r) => r.from >= 0 && r.from < r.to && r.to <= size);
        deco = import_view2.Decoration.set(ranges.map((r) => flashMark.range(r.from, r.to)), true);
      }
    }
    return deco;
  },
  provide: (field) => import_view2.EditorView.decorations.from(field)
});
var flashTheme = import_view2.EditorView.baseTheme({
  ".mara-flash": {
    backgroundColor: "rgba(255, 196, 0, 0.35)",
    borderRadius: "2px",
    transition: "background-color 0.4s"
  }
});
function sha256(text) {
  return (0, import_crypto.createHash)("sha256").update(text, "utf8").digest("hex");
}
function sameToken(given, token) {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(token, "utf8");
  return a.length === b.length && (0, import_crypto.timingSafeEqual)(a, b);
}
function send(req, res, status, payload, close = false) {
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  };
  if (close) {
    headers.Connection = "close";
    res.on("finish", () => req.socket.destroy());
  }
  res.writeHead(status, headers);
  res.end(body);
}
function readBody(req) {
  const declared = Number(req.headers["content-length"]);
  if (declared > MAX_BODY) return Promise.reject(new HttpError(413, { error: "too large" }, true));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, { error: "too large" }, true));
        req.pause();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(new HttpError(400, { error: "bad request", detail: "body is not JSON" }));
      }
    });
    req.on("aborted", () => fail(new HttpError(400, { error: "aborted" }, true)));
    req.on("close", () => fail(new HttpError(400, { error: "aborted" }, true)));
    req.on("error", () => fail(new HttpError(400, { error: "aborted" }, true)));
  });
}
function editorView(editor) {
  const cm = editor.cm;
  return cm instanceof import_view2.EditorView ? cm : null;
}
function activeTime(leaf) {
  const t = leaf.activeTime;
  return typeof t === "number" ? t : 0;
}
var MaraCoeditPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.server = null;
    this.port = 0;
    this.token = "";
    this.flashTimers = /* @__PURE__ */ new Map();
    // one per editor, replaced on each apply
    this.typingTimers = /* @__PURE__ */ new Map();
  }
  // her typing playing in an editor
  async onload() {
    this.registerEditorExtension([flashField, flashTheme, typingField, typingTheme]);
    this.token = (0, import_crypto.randomBytes)(24).toString("hex");
    const server = (0, import_http.createServer)((req, res) => {
      this.handle(req, res).catch((err) => {
        if (err instanceof HttpError) send(req, res, err.status, err.payload, err.close);
        else send(req, res, 500, { error: "plugin error", detail: String(err) });
      });
    });
    server.on("error", (err) => new import_obsidian.Notice(`Mara co-edit: server error: ${err.message}`));
    this.server = server;
    server.listen(0, "127.0.0.1", () => {
      if (this.server !== server) return;
      const address = server.address();
      if (address && typeof address === "object") {
        this.port = address.port;
        const data = { port: address.port, token: this.token, pid: process.pid };
        this.saveData(data).then(() => this.lockDataFile()).catch((err) => new import_obsidian.Notice(`Mara co-edit: could not save port: ${String(err)}`));
      }
    });
  }
  onunload() {
    for (const timer of this.flashTimers.values()) window.clearTimeout(timer);
    this.flashTimers.clear();
    for (const [cm, timer] of this.typingTimers) {
      window.clearTimeout(timer);
      try {
        cm.dispatch({ effects: setTyping.of([]) });
      } catch {
      }
    }
    this.typingTimers.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      server.close();
      server.closeAllConnections?.();
    }
    void this.saveData({});
  }
  // data.json holds the token: readable by him only.
  async lockDataFile() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian.FileSystemAdapter)) return;
    const dir = this.manifest.dir || `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    await (0, import_promises.chmod)(adapter.getFullPath((0, import_obsidian.normalizePath)(`${dir}/data.json`)), 384);
  }
  async handle(req, res) {
    const host = req.headers.host;
    if (req.headers.origin !== void 0 || host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) {
      send(req, res, 403, { error: "forbidden" }, true);
      return;
    }
    if (!sameToken(req.headers[TOKEN_HEADER], this.token)) {
      send(req, res, 403, { error: "forbidden" }, true);
      return;
    }
    const route = (req.url || "").split("?")[0];
    if (req.method === "GET" && route === "/ping") {
      send(req, res, 200, { ok: true, plugin: this.manifest.id, version: this.manifest.version });
    } else if (req.method === "GET" && route === "/note") {
      const view = this.openNote();
      if (!view || !view.file) throw new HttpError(404, { error: "no note" });
      const cm = editorView(view.editor);
      const text = cm ? cm.state.doc.toString() : view.editor.getValue();
      send(req, res, 200, {
        path: view.file.path,
        name: view.file.basename,
        text,
        hash: sha256(text),
        mode: view.getMode()
      });
    } else if (req.method === "POST" && route === "/apply") {
      send(req, res, 200, this.apply(await readBody(req)));
    } else {
      send(req, res, 404, { error: "not found" });
    }
  }
  // The note he is working in: the active Markdown view, else the most recently active Markdown
  // leaf (focus is usually on the overlay when a request comes in).
  openNote() {
    const active = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (active?.file) return active;
    const leaves = this.app.workspace.getLeavesOfType("markdown").filter((leaf) => leaf.view instanceof import_obsidian.MarkdownView && leaf.view.file).sort((a, b) => activeTime(b) - activeTime(a));
    return leaves.length ? leaves[0].view : null;
  }
  // With base (the text her edits were made against), the edits are matched against it and moved
  // past whatever he changed since (diffHunks/rebaseChanges); an edit whose text he changed is dropped
  // as "edited by you". With only expect (an older client), the note must still be that text.
  apply(body) {
    const b = typeof body === "object" && body !== null ? body : {};
    const base = typeof b.base === "string" ? b.base : null;
    if (typeof b.path !== "string" || base === null && typeof b.expect !== "string" || !Array.isArray(b.edits) || b.strict !== void 0 && typeof b.strict !== "boolean" || b.animate !== void 0 && typeof b.animate !== "boolean") {
      throw new HttpError(400, { error: "bad request", detail: "need {path, base or expect, edits: [...], strict?, animate?}" });
    }
    const view = this.openNote();
    if (!view || !view.file) throw new HttpError(404, { error: "no note" });
    if (view.file.path !== b.path) throw new HttpError(409, { error: "other note", path: view.file.path });
    if (view.getMode() === "preview") throw new HttpError(409, { error: "reading view", path: view.file.path });
    const cm = editorView(view.editor);
    const text = cm ? cm.state.doc.toString() : view.editor.getValue();
    if (base === null && sha256(text) !== b.expect) throw new HttpError(409, { error: "changed", hash: sha256(text) });
    const against = base ?? text;
    const matched = matchEdits(against, b.edits);
    let kept = matched.kept;
    const dropped = matched.dropped;
    if (b.strict && dropped.length) throw new HttpError(409, { error: "dropped", applied: [], dropped });
    let changes = planChanges(editorEdits(kept));
    const rebased = against !== text;
    if (rebased) {
      const sorted = [...kept].sort((x, y) => x.at - y.at);
      const moved = rebaseChanges(changes, diffHunks(against, text));
      const lost = new Set(moved.conflicts.map((i) => sorted[i]));
      for (const k of kept) if (lost.has(k)) dropped.push({ old: k.old, new: k.new, why: "edited by you" });
      if (b.strict && lost.size) throw new HttpError(409, { error: "dropped", applied: [], dropped });
      kept = kept.filter((k) => !lost.has(k));
      changes = moved.moved;
    }
    if (changes.length) {
      if (cm) this.dispatch(cm, changes, text, b.animate !== false);
      else this.fallback(view.editor, changes);
    }
    const after = cm ? cm.state.doc.toString() : view.editor.getValue();
    return { ok: true, applied: kept, dropped, hash: sha256(after), rebased };
  }
  // One transaction with its own undo entry (isolateHistory): the note is final at once. It carries
  // the typing layer, which then plays (type); with animate off, or nothing to type, the changed
  // ranges are highlighted for FLASH_MS instead. A typing still playing from before is finished first.
  dispatch(cm, changes, before, animate) {
    this.stopTyping(cm);
    const segs = animate ? typingSegments(before, changes).map((g) => ({ ...g, shownOld: g.old.length, typed: 0 })) : [];
    const tr = cm.state.update({
      changes: changes.map((c) => ({ from: c.from, to: c.to, insert: c.insert })),
      // "input.renumber": Obsidian's ordered-list filter renumbers the list around any other change,
      // so her "1968." after "1888." became "1889." again (post1, 2026-11-02). The filter skips its
      // own renumber events and "set"; "set" also tears down table editing, so it is not used.
      annotations: [import_commands.isolateHistory.of("full"), import_state2.Transaction.userEvent.of("input.renumber")],
      effects: segs.length ? [setTyping.of(segs), import_view2.EditorView.scrollIntoView(segs[0].from, { y: "nearest" })] : []
    });
    cm.dispatch(tr);
    if (segs.length) {
      this.type(cm, segs);
      return;
    }
    const ranges = [];
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => ranges.push({ from: fromB, to: toB }));
    this.flash(cm, ranges);
  }
  // Her typing, one step every TICK_MS: the first unfinished segment backspaces its old text, then
  // reveals its new text, a few letters a step, so the whole plays within about TYPING_MAX_MS. The
  // editor scrolls to each segment as she starts it, only when it is off screen.
  type(cm, segs) {
    const total = segs.reduce((n, t) => n + t.old.length / BACKSPACE_SPEED + (t.to - t.from), 0);
    const step = Math.max(1, Math.ceil(total / (TYPING_MAX_MS / TICK_MS)));
    let current = -1;
    const tick = () => {
      this.typingTimers.delete(cm);
      try {
        const now = cm.state.field(typingField, false) ?? [];
        const { next, index } = advance(now, step, (from, to) => cm.state.sliceDoc(from, to));
        if (index < 0) {
          this.endTyping(cm, now);
          return;
        }
        const t = next[index];
        const effects = [setTyping.of(next)];
        if (index !== current) {
          current = index;
          effects.push(import_view2.EditorView.scrollIntoView(t.from, { y: "nearest" }));
        }
        cm.dispatch({ effects });
        this.typingTimers.set(cm, window.setTimeout(tick, TICK_MS));
      } catch (err) {
        console.warn("Mara co-edit: typing stopped", err);
      }
    };
    this.typingTimers.set(cm, window.setTimeout(tick, TICK_MS));
  }
  // Typing done (or cut short): the layer goes and what she typed is highlighted for FLASH_MS.
  endTyping(cm, segs) {
    cm.dispatch({ effects: setTyping.of([]) });
    this.flash(cm, segs.filter((t) => t.to > t.from).map((t) => ({ from: t.from, to: t.to })));
  }
  stopTyping(cm) {
    const timer = this.typingTimers.get(cm);
    if (timer === void 0) return;
    window.clearTimeout(timer);
    this.typingTimers.delete(cm);
    try {
      this.endTyping(cm, cm.state.field(typingField, false) ?? []);
    } catch {
    }
  }
  // The highlight goes in effects-only transactions (no undo entry), so nothing in it can cost the edit.
  flash(cm, ranges) {
    try {
      cm.dispatch({ effects: setFlash.of(ranges) });
      const previous = this.flashTimers.get(cm);
      if (previous !== void 0) window.clearTimeout(previous);
      const timer = window.setTimeout(() => {
        if (this.flashTimers.get(cm) === timer) this.flashTimers.delete(cm);
        try {
          cm.dispatch({ effects: setFlash.of([]) });
        } catch {
        }
      }, FLASH_MS);
      this.flashTimers.set(cm, timer);
    } catch (err) {
      console.warn("Mara co-edit: highlight failed", err);
    }
  }
  // Without CodeMirror access: Obsidian's own transaction (one undo step, no highlight).
  fallback(editor, changes) {
    editor.transaction({
      changes: changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert }))
    });
  }
};
