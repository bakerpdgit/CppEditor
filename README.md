# Browser-based C++ Editor

This project provides a single page C++ editor that compiles and runs code
entirely in the browser. It uses the [Monaco editor](https://microsoft.github.io/monaco-editor/)
and [`wasm-clang`](https://github.com/binji/wasm-clang) to compile C++ to WebAssembly.
The compiled module executes in a Web Worker and its output is shown in a console.

## Features

- Material Design layout with Monaco editor
- Split view with resizable output panel
- Console accepts interactive input using `SharedArrayBuffer`
- Compilation and execution happen in a Web Worker so the UI stays responsive

## Running

Open `index.html` in a browser. All assets must be served from the same origin
with cross-origin isolation headers so `SharedArrayBuffer` is available.

Download the following third-party assets and place them in the paths below:

```
public/vendor/mdc/mdc.min.css       # https://unpkg.com/material-components-web/dist/material-components-web.min.css
public/vendor/mdc/mdc.min.js        # https://unpkg.com/material-components-web/dist/material-components-web.min.js
public/vendor/monaco/vs/*           # https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/*
```

Mirror the contents of `https://binji.github.io/wasm-clang/` into
`public/third_party/wasm-clang/` so the worker can fetch the toolchain locally.

To deploy on Cloudflare Pages or similar static hosts, ensure every response
includes `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. A `_headers` file is provided for
Cloudflare Pages.

## Acknowledgements

The WebAssembly-based compiler is provided by the
[wasm-clang project](https://github.com/binji/wasm-clang) and is licensed under
Apache 2.0.
