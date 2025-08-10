// SPDX-License-Identifier: Apache-2.0

const TOOLCHAIN_BASE = "/toolchain/"; // for clang/lld
const ASSETS_BASE = "/third_party/wasm-clang/"; // for small local files

// Refuse to run if SAB is not available (should be guaranteed by page checks)
if (!("SharedArrayBuffer" in self)) {
  postMessage({
    type: "stderr",
    data: "SharedArrayBuffer not available. Is the page cross-origin isolated?",
  });
  throw new Error("No SharedArrayBuffer; aborting.");
}

// Load helper script
importScripts(ASSETS_BASE + "shared.js");

let api;
let stdinBuffer = new Uint8Array(0);
let stdinPos = 0;
let inputSignal = null;
let sharedInput = null;

const TOOLCHAIN_NAMES = new Set([
  "clang",
  "lld",
  "wasm-ld",
  "clang.wasm",
  "lld.wasm",
  "wasm-ld.wasm",
]);
function baseFor(path) {
  // handle 'clang', '/something/clang', 'clang?x=y'
  const name = String(path).split("?")[0].split("/").pop();
  return TOOLCHAIN_NAMES.has(name) ? TOOLCHAIN_BASE : ASSETS_BASE;
}

api = new API({
  readBuffer: async (path) => {
    const basePath = baseFor(path);
    const response = await fetch(basePath + path);
    return response.arrayBuffer();
  },
  compileStreaming: async (path) => {
    const basePath = baseFor(path);
    const url = basePath + path;
    const response = await fetch(url);

    if (
      WebAssembly.compileStreaming &&
      response.headers.get("Content-Type") === "application/wasm"
    ) {
      return WebAssembly.compileStreaming(Promise.resolve(response));
    }
    return WebAssembly.compile(await response.arrayBuffer());
  },
  hostWrite: (s) => postMessage({ type: "stdout", data: s }),
});

onmessage = async (e) => {
  const { type } = e.data;
  if (type === "run") {
    const { code, signal, buffer } = e.data;
    try {
      inputSignal = signal;
      sharedInput = new Uint8Array(buffer);
      // Make visible to shared.js (MemFS.host_read)
      self.__inputSignal = inputSignal;
      self.__sharedInput = sharedInput;
      await api.compileLinkRun(code);
      postMessage({ type: "done" });
    } catch (err) {
      postMessage({ type: "stderr", data: err.toString() + "\n" });
    }
  } else if (type === "abort") {
    try {
      if (inputSignal) {
        Atomics.store(inputSignal, 1, 0);
        Atomics.notify(inputSignal, 0, 1);
      }
    } catch {}
    postMessage({ type: "stderr", data: "[Aborted]\n" });
    self.close();
  }
};
