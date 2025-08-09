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
    document.getElementById("run");
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

// Worker setup
const worker = new Worker("worker.js");
const output = document.getElementById("output");
const consoleInput = document.getElementById("console-input");
let awaiting = false;
let inputSignal;
let inputBuffer;

worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === "stdout" || type === "stderr") {
    const clean = data.replace(/\x1b\[1;93m>\x1b\[0m/g, "> ");
    output.textContent += clean;
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
  } else if (type === "requestInput") {
    awaiting = true;
    output.textContent += "> ";
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
    consoleInput.value = "";
    consoleInput.style.display = "block";
    consoleInput.focus();
  } else if (type === "done") {
    awaiting = false;
    consoleInput.style.display = "none";
  }
};

document.getElementById("run").addEventListener("click", () => {
  output.textContent = "";
  consoleInput.style.display = "none";
  const code = editor.getValue();
  inputSignal = new Int32Array(new SharedArrayBuffer(8));
  inputBuffer = new Uint8Array(new SharedArrayBuffer(65536));
  worker.postMessage({
    type: "run",
    code,
    signal: inputSignal,
    buffer: inputBuffer.buffer,
  });
});

consoleInput.addEventListener("keydown", (e) => {
  if (!awaiting) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const value = consoleInput.value;
    output.textContent += value + "\n";
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
    consoleInput.style.display = "none";
    awaiting = false;
    const bytes = new TextEncoder().encode(value + "\n");
    inputBuffer.set(bytes);
    Atomics.store(inputSignal, 1, bytes.length);
    Atomics.store(inputSignal, 0, 1);
    Atomics.notify(inputSignal, 0);
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
