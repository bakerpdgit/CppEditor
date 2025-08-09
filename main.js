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
const worker = new Worker('worker.js');
const output = document.getElementById('output');
worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'stdout' || type === 'stderr') {
    const clean = data.replace(/\x1b\[1;93m>\x1b\[0m/g, '');
    output.textContent += clean;
  }
};

// Run button
document.getElementById('run').addEventListener('click', () => {
  output.textContent = '';
  const code = editor.getValue();
  const input = document.getElementById('stdin').value;
  worker.postMessage({ code, input });
  setActiveTab('console');
});

// Tabs
function setActiveTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (tab === 'console') {
    document.getElementById('tab-console').classList.add('active');
    document.getElementById('console-panel').classList.add('active');
  } else {
    document.getElementById('tab-input').classList.add('active');
    document.getElementById('input-panel').classList.add('active');
  }
}

document.getElementById('tab-console').addEventListener('click', () => setActiveTab('console'));
document.getElementById('tab-input').addEventListener('click', () => setActiveTab('input'));

// Resizer
const resizer = document.getElementById('resizer');
const bottomPane = document.getElementById('bottom-pane');
const mainContent = document.querySelector('.main-content');
let isResizing = false;

resizer.addEventListener('mousedown', () => { isResizing = true; });
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const mainRect = mainContent.getBoundingClientRect();
  const newHeight = mainRect.bottom - e.clientY;
  bottomPane.style.height = Math.max(100, newHeight) + 'px';
});
document.addEventListener('mouseup', () => { isResizing = false; });
