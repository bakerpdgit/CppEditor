window.mdc && mdc.autoInit();

// Hard-require cross-origin isolation for interactive mode
if (!("SharedArrayBuffer" in self) || !crossOriginIsolated) {
  const msg =
    "Interactive mode requires cross-origin isolation (COOP/COEP) on ALL assets.";
  console.error(msg);
  if (typeof showBlockingBanner === "function") showBlockingBanner(msg);
  if (typeof disableRunButton === "function") disableRunButton();
  throw new Error(msg);
}

function showBlockingBanner(text) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText =
    "position:fixed;top:0;left:0;right:0;padding:12px;background:#fee;border-bottom:1px solid #f99;z-index:9999;font:14px/1.4 system-ui;";
  document.body.prepend(el);
}

function disableRunButton() {
  const btn =
    document.querySelector('[data-action="run"]') ||
    document.getElementById("runBtn");
  if (btn) {
    btn.disabled = true;
    btn.title = "Requires COOP/COEP";
  }
}

// Monaco setup
require.config({ paths: { vs: "/vendor/monaco/vs" } });
let editor;
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value:
      '#include <iostream>\nint main(){\n    std::string name;\n    std::getline(std::cin, name);\n    std::cout << "Hello " << name << "!" << std::endl;\n}\n',
    language: "cpp",
    theme: "vs-dark",
    automaticLayout: true,
  });
});

// Worker and console setup
const output = document.getElementById("output");
const stdinRow = document.getElementById("stdin-row");
const stdinEl = document.getElementById("stdin");
const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
let worker = null;
let running = false;
let inputSignal;
let sharedBuf;

function appendToConsole(text) {
  const clean = text.replace(/\x1b\[1;93m>\x1b\[0m/g, "> ");
  output.textContent += clean;
  output.parentElement.scrollTop = output.parentElement.scrollHeight;
}

function appendErr(text) {
  appendToConsole(text);
}

function showPrompt() {
  stdinEl.value = "";
  stdinRow.hidden = false;
  stdinEl.focus();
  stdinRow.scrollIntoView({ block: "end" });
}

function hidePrompt() {
  stdinRow.hidden = true;
  stdinEl.value = "";
  stdinEl.blur();
}

function setRunning(on) {
  running = on;
  runBtn.disabled = on;
  stopBtn.disabled = !on;
  if (!on) hidePrompt();
}

function startWorker() {
  if (worker) worker.terminate();
  worker = new Worker("worker.js");
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "requestInput") {
      appendToConsole("> ");
      showPrompt();
    } else if (m.type === "stdout") {
      appendToConsole(m.data);
    } else if (m.type === "stderr") {
      appendErr(m.data);
    } else if (m.type === "done") {
      setRunning(false);
    }
  };
}

runBtn.addEventListener("click", () => {
  if (running) return;
  startWorker();
  output.textContent = "";
  const code = editor.getValue();
  const sab = new SharedArrayBuffer(4096);
  inputSignal = new Int32Array(new SharedArrayBuffer(8));
  sharedBuf = new Uint8Array(sab);
  setRunning(true);
  worker.postMessage({
    type: "run",
    code,
    signal: inputSignal,
    buffer: sab,
  });
});

stopBtn.addEventListener("click", () => stopRun());

function stopRun() {
  if (!worker) return;
  worker.postMessage({ type: "abort" });
  setTimeout(() => {
    try {
      worker.terminate();
    } catch {}
    setRunning(false);
  }, 100);
}

stdinEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const s = stdinEl.value + "\n";
    appendToConsole(s);
    hidePrompt();
    const bytes = new TextEncoder().encode(s);
    sharedBuf.set(bytes.subarray(0, sharedBuf.length));
    Atomics.store(inputSignal, 1, Math.min(bytes.length, sharedBuf.length));
    Atomics.notify(inputSignal, 0, 1);
  }
});

// Pane size controls
const bottomPane = document.getElementById("bottom-pane");

function setBottomHeight(percent) {
  bottomPane.style.flexBasis = `${percent}%`;
  if (editor) editor.layout();
}

document
  .getElementById("maximize")
  .addEventListener("click", () => setBottomHeight(50));
document
  .getElementById("minimize")
  .addEventListener("click", () => setBottomHeight(15));

setBottomHeight(25);
