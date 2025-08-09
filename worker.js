const base = 'https://binji.github.io/wasm-clang/';

importScripts(base + 'shared.js');

const api = new API({
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
      response.headers.get('Content-Type') === 'application/wasm'
    ) {
      // Use the already-fetched response for streaming compilation.
      return WebAssembly.compileStreaming(Promise.resolve(response));
    }
    return WebAssembly.compile(await response.arrayBuffer());
  },
  hostWrite: (s) => postMessage({ type: 'stdout', data: s })
});

onmessage = async (e) => {
  const { code, input } = e.data;
  try {
    api.memfs.setStdinStr(input || '');
    await api.compileLinkRun(code);
    postMessage({ type: 'done' });
  } catch (err) {
    postMessage({ type: 'stderr', data: err.toString() + '\n' });
  }
};
