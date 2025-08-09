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
const consoleInput = document.getElementById("console-input");
const tabInput = document.getElementById("tab-input");
const inputPanel = document.getElementById("input-panel");
const fixedToggle = document.getElementById("fixed-toggle");
const moreBtn = document.getElementById("more");
const moreMenu = document.getElementById("more-menu");
let useFixed = false;
let awaiting = false;

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

// Run button
document.getElementById("run").addEventListener("click", () => {
  output.textContent = "";
  consoleInput.style.display = "none";
  const code = editor.getValue();
  if (useFixed) {
    let input = document.getElementById("stdin").value;
    if (input === "") input = "\n";
    worker.postMessage({ type: "run", code, input });
  } else {
    worker.postMessage({ type: "run", code });
  }
  setActiveTab("console");
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
    worker.postMessage({ type: "input", data: value + "\n" });
  }
});

moreBtn.addEventListener("click", () => {
  moreMenu.style.display = moreMenu.style.display === "block" ? "none" : "block";
});

fixedToggle.addEventListener("change", () => {
  useFixed = fixedToggle.checked;
  if (useFixed) {
    tabInput.style.display = "inline-block";
    inputPanel.style.display = "block";
  } else {
    tabInput.style.display = "none";
    inputPanel.style.display = "none";
    setActiveTab("console");
  }
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
