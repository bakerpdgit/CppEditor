// SPDX-License-Identifier: Apache-2.0

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
    value: `#include <iostream>
      int main(){
          std::string name;
          std::cout << "Enter your name:" << std::endl;
          std::getline(std::cin, name);
          std::cout << "Hello " << name << "!" << std::endl;
      }\n`,
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
const uploadBtn = document.getElementById("uploadBtn");
const downloadBtn = document.getElementById("downloadBtn");
const fileInput = document.getElementById("fileInput");
const optionsBtn = document.getElementById("optionsBtn");
const optionsModal = document.getElementById("options-modal");
const useFixedInputsChk = document.getElementById("use-fixed-inputs");
const optionsOk = document.getElementById("options-ok");
const tabConsole = document.getElementById("tab-console");
const tabInputs = document.getElementById("tab-inputs");
const consolePanel = document.getElementById("console-panel");
const inputsPanel = document.getElementById("inputs-panel");
const inputsArea = document.getElementById("inputs-area");
let worker = null;
let running = false;
let inputSignal;
let sharedBuf;
let useFixedInputs = false;
let fixedLines = [];
let fixedIndex = 0;

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "");
}

function appendToConsole(text, raw = false) {
  const clean = raw ? text : stripAnsi(text).replace(/^>\s*$/gm, "");
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

function sendInput(s) {
  const bytes = new TextEncoder().encode(s);
  sharedBuf.fill(0);
  sharedBuf.set(bytes.subarray(0, sharedBuf.length));
  Atomics.store(inputSignal, 1, Math.min(bytes.length, sharedBuf.length));
  Atomics.store(inputSignal, 0, 1);
  Atomics.notify(inputSignal, 0, 1);
}

function feedFixedInput() {
  if (fixedIndex < fixedLines.length) {
    const line = fixedLines[fixedIndex++];
    const s = line + "\n";
    appendToConsole(s);
    sendInput(s);
  } else {
    showPrompt();
  }
}

function activateTab(which) {
  tabConsole.classList.remove("active");
  tabInputs.classList.remove("active");
  consolePanel.classList.remove("active");
  inputsPanel.classList.remove("active");
  if (which === "inputs") {
    tabInputs.classList.add("active");
    inputsPanel.classList.add("active");
  } else {
    tabConsole.classList.add("active");
    consolePanel.classList.add("active");
  }
}

function updateInputsVisibility() {
  if (useFixedInputs) {
    tabInputs.style.display = "block";
    inputsPanel.style.display = "";
  } else {
    tabInputs.style.display = "none";
    inputsPanel.style.display = "none";
    activateTab("console");
  }
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
      appendToConsole("> ", true);
      if (useFixedInputs) {
        feedFixedInput();
      } else {
        showPrompt();
      }
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
  activateTab("console");
  startWorker();
  output.textContent = "";
  const code = editor.getValue();
  const sab = new SharedArrayBuffer(4096);
  inputSignal = new Int32Array(new SharedArrayBuffer(8));
  sharedBuf = new Uint8Array(sab);
  if (useFixedInputs) {
    fixedLines = inputsArea.value.replace(/\r/g, "").split("\n");
    if (fixedLines.length && fixedLines[fixedLines.length - 1] === "") {
      fixedLines.pop();
    }
    fixedIndex = 0;
  }
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

uploadBtn.addEventListener("click", () => {
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const text = await file.text();
  editor.setValue(text);
});

downloadBtn.addEventListener("click", () => {
  const blob = new Blob([editor.getValue()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "code.cpp";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

stdinEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const s = stdinEl.value + "\n";
    appendToConsole(s);
    hidePrompt();
    sendInput(s);
  }
});

optionsBtn.addEventListener("click", () => {
  optionsModal.classList.add("active");
});

optionsOk.addEventListener("click", () => {
  optionsModal.classList.remove("active");
  useFixedInputs = useFixedInputsChk.checked;
  updateInputsVisibility();
  if (useFixedInputs) {
    activateTab("inputs");
    inputsArea.focus();
  }
});

tabConsole.addEventListener("click", () => activateTab("console"));
tabInputs.addEventListener("click", () => activateTab("inputs"));

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
updateInputsVisibility();
