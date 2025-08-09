// Initialize Material components
window.mdc && mdc.autoInit();

// Monaco setup
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
let editor;
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '#include <iostream>\nint main(){\n    std::string name;\n    std::getline(std::cin, name);\n    std::cout << "Hello " << name << "!" << std::endl;\n}\n',
    language: 'cpp',
    theme: 'vs-dark',
    automaticLayout: true
  });
});

// Worker setup
const worker = new Worker("worker.js");
const output = document.getElementById("output");
let sharedControl;
let sharedData;
let waiting = false;
let inputBuffer = "";
let inputSpan;
let cursorSpan;
const encoder = new TextEncoder();

worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === "stdout" || type === "stderr") {
    const clean = data.replace(/\x1b\[1;93m>\x1b\[0m/g, "> ");
    output.textContent += clean;
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
  } else if (type === "stdin-request") {
    beginInput();
  }
};

// Run button
const optionsBtn = document.getElementById("options");
const menu = document.getElementById("options-menu");
const useFixed = document.getElementById("use-fixed");

optionsBtn.addEventListener("click", () => {
  menu.classList.toggle("show");
});

useFixed.addEventListener("change", () => {
  const show = useFixed.checked;
  const tabInput = document.getElementById("tab-input");
  const panelInput = document.getElementById("input-panel");
  if (show) {
    tabInput.style.display = "inline-block";
    panelInput.style.display = "block";
  } else {
    tabInput.style.display = "none";
    panelInput.style.display = "none";
    setActiveTab("console");
  }
  menu.classList.remove("show");
});

document.getElementById("run").addEventListener("click", () => {
  output.textContent = "";
  const code = editor.getValue();
  const sab = new SharedArrayBuffer(65544);
  sharedControl = new Int32Array(sab, 0, 2);
  sharedData = new Uint8Array(sab, 8);
  if (useFixed.checked) {
    let fixed = document.getElementById("stdin").value;
    if (fixed === "") fixed = "\n";
    const bytes = encoder.encode(fixed);
    sharedData.set(bytes);
    Atomics.store(sharedControl, 1, bytes.length);
  }
  worker.postMessage({ code, sab, useFixed: useFixed.checked }, [sab]);
  setActiveTab("console");
});

// Tabs
function setActiveTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  if (tab === "console") {
    document.getElementById("tab-console").classList.add("active");
    document.getElementById("console-panel").classList.add("active");
  } else {
    document.getElementById("tab-input").classList.add("active");
    document.getElementById("input-panel").classList.add("active");
  }
}

document.getElementById("tab-console").addEventListener("click", () => setActiveTab("console"));
document.getElementById("tab-input").addEventListener("click", () => setActiveTab("input"));

// Pane size controls
const bottomPane = document.getElementById("bottom-pane");

function setBottomHeight(percent) {
  bottomPane.style.flexBasis = `${percent}%`;
  if (editor) editor.layout();
}

document.getElementById("maximize").addEventListener("click", () => setBottomHeight(50));
document.getElementById("minimize").addEventListener("click", () => setBottomHeight(15));

setBottomHeight(25);

function sendInput(text) {
  const bytes = encoder.encode(text);
  const len = Atomics.load(sharedControl, 1);
  sharedData.set(bytes, len);
  Atomics.store(sharedControl, 1, len + bytes.length);
  Atomics.store(sharedControl, 0, 1);
  Atomics.notify(sharedControl, 0);
}

function beginInput() {
  waiting = true;
  inputBuffer = "";
  inputSpan = document.createElement("span");
  cursorSpan = document.createElement("span");
  cursorSpan.className = "cursor";
  output.appendChild(inputSpan);
  output.appendChild(cursorSpan);
  document.addEventListener("keydown", handleKey);
  document.addEventListener("paste", handlePaste);
  output.parentElement.scrollTop = output.parentElement.scrollHeight;
}

function endInput(text) {
  document.removeEventListener("keydown", handleKey);
  document.removeEventListener("paste", handlePaste);
  if (cursorSpan) cursorSpan.remove();
  if (inputSpan) inputSpan.remove();
  output.appendChild(document.createTextNode(text));
  output.parentElement.scrollTop = output.parentElement.scrollHeight;
  waiting = false;
  sendInput(text);
}

function handleKey(e) {
  if (!waiting) return;
  if (e.key === "Enter") {
    e.preventDefault();
    endInput(inputBuffer + "\n");
  } else if (e.key === "Backspace") {
    e.preventDefault();
    inputBuffer = inputBuffer.slice(0, -1);
    inputSpan.textContent = inputBuffer;
  } else if (e.key.length === 1) {
    e.preventDefault();
    inputBuffer += e.key;
    inputSpan.textContent = inputBuffer;
  }
}

function handlePaste(e) {
  if (!waiting) return;
  e.preventDefault();
  const text = e.clipboardData.getData("text");
  if (text.includes("\n")) {
    endInput(text);
  } else {
    inputBuffer += text;
    inputSpan.textContent = inputBuffer;
  }
}
