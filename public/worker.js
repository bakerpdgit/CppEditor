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

api = new API({
  readBuffer: async (path) => {
    const basePath = path.endsWith(".wasm") ? TOOLCHAIN_BASE : ASSETS_BASE;
    const response = await fetch(basePath + path);
    return response.arrayBuffer();
  },
  compileStreaming: async (path) => {
    const basePath = path.endsWith(".wasm") ? TOOLCHAIN_BASE : ASSETS_BASE;
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

const originalHostRead = api.memfs.host_read.bind(api.memfs);
api.memfs.host_read = function (fd, iovs, iovs_len, nread) {
  if (fd === 0) {
    const mem = this.hostMem_;
    let size = 0;
    for (let i = 0; i < iovs_len; ++i) {
      const buf = mem.read32(iovs);
      iovs += 4;
      const len = mem.read32(iovs);
      iovs += 4;
      while (stdinPos >= stdinBuffer.length) {
        postMessage({ type: "requestInput" });
        Atomics.store(inputSignal, 0, 0);
        Atomics.wait(inputSignal, 0, 0);
        const received = Atomics.load(inputSignal, 1);
        if (received > 0 && sharedInput) {
          stdinBuffer = new Uint8Array(sharedInput.subarray(0, received));
          stdinPos = 0;
          Atomics.store(inputSignal, 1, 0);
        } else {
          postMessage({ type: "stderr", data: "EOF\n" });
          mem.write32(nread, size);
          return ESUCCESS;
        }
      }
      const toCopy = Math.min(len, stdinBuffer.length - stdinPos);
      mem.write(buf, stdinBuffer.subarray(stdinPos, stdinPos + toCopy));
      stdinPos += toCopy;
      size += toCopy;
      if (toCopy < len) {
        break;
      }
    }
    mem.write32(nread, size);
    if (stdinPos >= stdinBuffer.length) {
      stdinBuffer = new Uint8Array(0);
      stdinPos = 0;
    }
    return ESUCCESS;
  }
  return originalHostRead(fd, iovs, iovs_len, nread);
};

onmessage = async (e) => {
  const { type } = e.data;
  if (type === "run") {
    const { code, signal, buffer } = e.data;
    try {
      stdinBuffer = new Uint8Array(0);
      stdinPos = 0;
      inputSignal = signal;
      sharedInput = new Uint8Array(buffer);
      await api.compileLinkRun(code);
      postMessage({ type: "done" });
    } catch (err) {
      postMessage({ type: "stderr", data: err.toString() + "\n" });
    }
  }
};
