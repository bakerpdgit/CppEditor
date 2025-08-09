const base = "https://binji.github.io/wasm-clang/";

importScripts(base + "shared.js");

let api;
let eofWarned = false;
let sharedControl;
let sharedData;
let interactive = true;

function hostRead(fd, buffer, offset, length, position) {
  if (fd !== 0) {
    return api.memfs.readSync(fd, buffer, offset, length, position);
  }
  let bytesRead = 0;
  while (bytesRead < length) {
    let available = Atomics.load(sharedControl, 1);
    if (available === 0) {
      if (!interactive) {
        if (!eofWarned) {
          eofWarned = true;
          postMessage({ type: "stderr", data: "EOFError: insufficient input provided\n" });
        }
        return bytesRead;
      }
      Atomics.store(sharedControl, 0, 0);
      postMessage({ type: "stdin-request" });
      Atomics.wait(sharedControl, 0, 0);
      available = Atomics.load(sharedControl, 1);
      if (available === 0) return bytesRead;
    }
    const toCopy = Math.min(length - bytesRead, available);
    for (let i = 0; i < toCopy; i++) {
      buffer[offset + bytesRead + i] = sharedData[i];
    }
    if (available > toCopy) {
      sharedData.copyWithin(0, toCopy, available);
    }
    Atomics.store(sharedControl, 1, available - toCopy);
    bytesRead += toCopy;
  }
  return bytesRead;
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
  const { code, sab, useFixed } = e.data;
  try {
    eofWarned = false;
    sharedControl = new Int32Array(sab, 0, 2);
    sharedData = new Uint8Array(sab, 8);
    interactive = !useFixed;
    await api.compileLinkRun(code);
    postMessage({ type: "done" });
  } catch (err) {
    postMessage({ type: "stderr", data: err.toString() + "\n" });
  }
};
