const base = "https://binji.github.io/wasm-clang/";

// Load a local copy of the wasm-clang helper to satisfy cross-origin isolation.
importScripts("shared.js");

let api;
let stdinBuffer = new Uint8Array(0);
let stdinPos = 0;
let interactive = false;
let inputSignal = null;
let sharedInput = null;

api = new API({
  readBuffer: async (path) => {
    const response = await fetch(base + path);
    return response.arrayBuffer();
  },
  compileStreaming: async (path) => {
    const url = base + path;
    const response = await fetch(url);
    // WebAssembly.compileStreaming requires the server to return the
    // `application/wasm` MIME type. Some environments (e.g. when serving
    // files locally) don't provide this header, which causes a TypeError.
    // In that case fall back to compiling from an ArrayBuffer instead.
    if (
      WebAssembly.compileStreaming &&
      response.headers.get("Content-Type") === "application/wasm"
    ) {
      // Use the already-fetched response for streaming compilation.
      return WebAssembly.compileStreaming(Promise.resolve(response));
    }
    return WebAssembly.compile(await response.arrayBuffer());
  },
  hostWrite: (s) => postMessage({ type: "stdout", data: s })
});

const originalHostRead = api.memfs.host_read.bind(api.memfs);
api.memfs.host_read = function (fd, iovs, iovs_len, nread) {
  if (interactive && fd === 0) {
    const mem = this.hostMem_;
    let size = 0;
    for (let i = 0; i < iovs_len; ++i) {
      const buf = mem.read32(iovs);
      iovs += 4;
      const len = mem.read32(iovs);
      iovs += 4;
      while (stdinPos >= stdinBuffer.length) {
        if (inputSignal) {
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
            interactive = false;
            mem.write32(nread, size);
            return ESUCCESS;
          }
        } else {
          postMessage({ type: "stderr", data: "Interactive input not supported in this browser.\n" });
          interactive = false;
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
    const { code, input, signal, buffer } = e.data;
    try {
      stdinBuffer = new Uint8Array(0);
      stdinPos = 0;
      interactive = input === undefined;
      if (!interactive) {
        api.memfs.setStdinStr(input);
      } else {
        inputSignal = signal;
        sharedInput = new Uint8Array(buffer);
      }
      await api.compileLinkRun(code);
      postMessage({ type: "done" });
    } catch (err) {
      postMessage({ type: "stderr", data: err.toString() + "\n" });
    }
  }
};
