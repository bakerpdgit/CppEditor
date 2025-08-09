const base = 'https://binji.github.io/wasm-clang/';

importScripts(base + 'shared.js');

const api = new API({
  readBuffer: async (path) => {
    const response = await fetch(base + path);
    return response.arrayBuffer();
  },
  compileStreaming: async (path) => {
    if (WebAssembly.compileStreaming) {
      return WebAssembly.compileStreaming(fetch(base + path));
    }
    const response = await fetch(base + path);
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
