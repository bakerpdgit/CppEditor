// Initialize Material components
window.mdc && mdc.autoInit();

// Monaco setup
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
let editor;
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '#include <iostream>\nint main(){\n    std::string name;\n    std::getline(std::cin, name);\n    std::cout << "Hello " << name << "!" << std::endl;\n}\n',
    theme: 'vs-dark',
    automaticLayout: true
  });
});

// Worker setup
const worker = new Worker("worker.js");
const output = document.getElementById("output");
let useFixedInput = false;
let shared;
const hiddenInput = document.createElement("textarea");
hiddenInput.style.position = "absolute";
hiddenInput.style.opacity = "0";
hiddenInput.style.height = "0";
hiddenInput.style.width = "0";
document.body.appendChild(hiddenInput);

const optionsBtn = document.getElementById("options");
const optionsMenu = document.getElementById("options-menu");
const fixedInput = document.getElementById("fixed-input");

optionsBtn.addEventListener("click", () => {
  optionsMenu.classList.toggle("open");
});

fixedInput.addEventListener("change", () => {
  useFixedInput = fixedInput.checked;
  toggleInputPane(useFixedInput);
});
toggleInputPane(false);
worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === "stdout" || type === "stderr") {
    const clean = data.replace(/\x1b\[1;93m>\x1b\[0m/g, "> ");
    output.textContent += clean;
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
  } else if (type === "request-input") {
    promptInput();
  }
};

// Run button
document.getElementById("run").addEventListener("click", () => {
  output.textContent = "";
  const code = editor.getValue();
  if (useFixedInput) {
    let input = document.getElementById("stdin").value;
    if (input === "") input = "\n";
    worker.postMessage({ code, input, interactive: false });
  } else {
    shared = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    worker.postMessage({ code, interactive: true, sharedBuffer: shared.buffer });
  }
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

function toggleInputPane(show) {
  const tab = document.getElementById("tab-input");
  const panel = document.getElementById("input-panel");
  if (show) {
    tab.style.display = "";
    panel.style.display = "";
  } else {
    tab.style.display = "none";
    panel.style.display = "none";
    if (tab.classList.contains("active")) setActiveTab("console");
  }
}

function promptInput() {
  const line = document.createElement("div");
  const span = document.createElement("span");
  const cursor = document.createElement("span");
  line.appendChild(document.createTextNode("> "));
  line.appendChild(span);
  cursor.className = "cursor";
  line.appendChild(cursor);
  output.appendChild(line);
  output.parentElement.scrollTop = output.parentElement.scrollHeight;
  hiddenInput.value = "";
  hiddenInput.focus();

  const handleInput = () => {
    const val = hiddenInput.value;
    if (val.includes("\n")) {
      finish(val);
    } else {
      span.textContent = val;
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(hiddenInput.value + "\n");
    }
  };

  hiddenInput.addEventListener("input", handleInput);
  hiddenInput.addEventListener("keydown", handleKey);

  function finish(str) {
    hiddenInput.removeEventListener("input", handleInput);
    hiddenInput.removeEventListener("keydown", handleKey);
    line.remove();
    const lines = str.split("\n");
    lines.forEach((l, i) => {
      if (i === lines.length - 1 && l === "") return;
      output.appendChild(document.createTextNode("> " + l + "\n"));
    });
    worker.postMessage({ type: "stdin", data: str });
    shared[0] = 1;
    Atomics.notify(shared, 0);
  }
}
