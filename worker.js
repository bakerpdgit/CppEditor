const base = "https://binji.github.io/wasm-clang/";

importScripts(base + "shared.js");

let api;
let eofWarned = false;
let interactive = false;
let inputQueue = "";
let shared;

function hostRead(fd, buffer, offset, length, position) {
  if (interactive && fd === 0) {
    if (inputQueue.length === 0) {
      postMessage({ type: "request-input" });
      Atomics.store(shared, 0, 0);
      Atomics.wait(shared, 0, 0);
    }
    const chunk = inputQueue.slice(0, length);
    const bytes = new TextEncoder().encode(chunk);
    buffer.set(bytes, offset);
    inputQueue = inputQueue.slice(chunk.length);
    return bytes.length;
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
  if (type === "stdin") {
    inputQueue += e.data.data;
    if (shared) {
      Atomics.store(shared, 0, 1);
      Atomics.notify(shared, 0);
    }
    return;
  }
  const { code, input, interactive: inter, sharedBuffer } = e.data;
  try {
    eofWarned = false;
    interactive = inter;
    if (interactive) {
      shared = new Int32Array(sharedBuffer);
      inputQueue = "";
    } else {
      api.memfs.setStdinStr(input);
    }
    await api.compileLinkRun(code);
    postMessage({ type: "done" });
  } catch (err) {
    postMessage({ type: "stderr", data: err.toString() + "\n" });
  }
};
