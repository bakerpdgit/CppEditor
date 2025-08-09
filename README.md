# Browser-based C++ Editor

This project provides a single page C++ editor that compiles and runs code
entirely in the browser. It uses the [Monaco editor](https://microsoft.github.io/monaco-editor/)
and [`wasm-clang`](https://github.com/binji/wasm-clang) to compile C++ to WebAssembly.
The compiled module executes in a Web Worker and its output is shown in a console.

## Features

- Material Design layout with Monaco editor
- Split view with resizable output panel
- Console accepts interactive input by default when the browser supports
  `SharedArrayBuffer`. A menu next to the Run button allows toggling a fixed
  input pane whose contents are piped to `stdin`.
- Compilation and execution happen in a Web Worker so the UI stays responsive.

## Running

Open `index.html` in a browser. No server is required, but all assets must be
served over HTTP(s). The worker bundles a local copy of `shared.js` and downloads
the remainder of the compiler toolchain from
`https://binji.github.io/wasm-clang/`.

To deploy on GitHub Pages or similar static hosts simply publish the repository
contents. For interactive console input the page must be served with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers (or equivalent
`<meta http-equiv>` tags) so that `SharedArrayBuffer` is available. Without these
headers the editor falls back to the fixed input pane. Cloudflare Pages supports
these policies via a `_headers` file at the project root, which is included in
this repository for convenience.

## Acknowledgements

The WebAssembly-based compiler is provided by the
[wasm-clang project](https://github.com/binji/wasm-clang) and is licensed under
Apache 2.0.
