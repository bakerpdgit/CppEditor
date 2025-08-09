const base = "https://binji.github.io/wasm-clang/";

importScripts(base + "shared.js");

let api;
let eofWarned = false;
let stdinBuffer = new Uint8Array(0);
let stdinPos = 0;
let interactive = false;
const inputSignal = new Int32Array(new SharedArrayBuffer(4));

function hostRead(fd, buffer, offset, length, position) {
  if (interactive && fd === 0) {
    if (stdinPos >= stdinBuffer.length) {
      postMessage({ type: "requestInput" });
      Atomics.store(inputSignal, 0, 0);
      Atomics.wait(inputSignal, 0, 0);
    }
    const toCopy = Math.min(length, stdinBuffer.length - stdinPos);
    buffer.set(stdinBuffer.subarray(stdinPos, stdinPos + toCopy), offset);
    stdinPos += toCopy;
    if (stdinPos >= stdinBuffer.length) {
      stdinBuffer = new Uint8Array(0);
      stdinPos = 0;
    }
    return toCopy;
  }
  const bytes = api.memfs.readSync(fd, buffer, offset, length, position);
  if (fd === 0 && bytes === 0 && !eofWarned) {
    eofWarned = true;
    postMessage({ type: "stderr", data: "EOFError: insufficient input provided\n" });
  }
  return bytes;
}

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
  hostWrite: (s) => postMessage({ type: "stdout", data: s }),
  hostRead
});

onmessage = async (e) => {
  const { type } = e.data;
  if (type === "run") {
    const { code, input } = e.data;
    try {
      eofWarned = false;
      stdinBuffer = new Uint8Array(0);
      stdinPos = 0;
      interactive = input === undefined;
      if (!interactive) api.memfs.setStdinStr(input);
      await api.compileLinkRun(code);
      postMessage({ type: "done" });
    } catch (err) {
      postMessage({ type: "stderr", data: err.toString() + "\n" });
    }
  } else if (type === "input") {
    stdinBuffer = new TextEncoder().encode(e.data.data);
    stdinPos = 0;
    Atomics.store(inputSignal, 0, 1);
    Atomics.notify(inputSignal, 0);
  }
};
