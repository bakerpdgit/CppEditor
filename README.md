# Browser-based C++ Editor

This project provides a single page C++ editor that compiles and runs code
entirely in the browser. It uses the [Monaco editor](https://microsoft.github.io/monaco-editor/)
and [`wasm-clang`](https://github.com/binji/wasm-clang) to compile C++ to WebAssembly.
The compiled module executes in a Web Worker and its output is shown in a console.

## Features

- Material Design layout with Monaco editor
- Split view with resizable output panel
- Console and input tabs. Text typed in the input tab is provided on `stdin`.
- Compilation and execution happen in a Web Worker so the UI stays responsive.

## Running

Open `index.html` in a browser. No server is required, but all assets must be
served over HTTP(s). The worker downloads the compiler toolchain from
`https://binji.github.io/wasm-clang/`.

To deploy on GitHub Pages or similar static hosts simply publish the repository
contents. If the hosting platform allows custom headers you can serve the page
with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` to enable `SharedArrayBuffer` in the
future, but the current toolchain does **not** require these headers.

## Acknowledgements

The WebAssembly-based compiler is provided by the
[wasm-clang project](https://github.com/binji/wasm-clang) and is licensed under
Apache 2.0.
