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

# CppEditor — C++ in the browser (WASM / Cloudflare Pages)

A simple web editor that compiles and runs C++ in the browser by invoking a WebAssembly toolchain (**Clang + LLD**, WASI). It supports **true blocking input** for `std::getline` via **SharedArrayBuffer** + **Atomics**, running inside a **cross-origin isolated** context.

## Running

This app requires **cross-origin isolation** so `SharedArrayBuffer` works. All assets must be same-origin and served with:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

A `_headers` file under `public/` provides these for Cloudflare Pages.

### Cloudflare Pages (recommended)

1. Connect this repo to Pages.
2. **Build output directory:** `public`
3. Keep **Pages Functions** at repo root: `functions/toolchain/[name].js`.
4. Deploy, then verify in the browser console:
   ```js
   crossOriginIsolated === true;
   typeof SharedArrayBuffer === "function";
   ```

### Local dev

Use Wrangler’s local dev so `_headers` are honored:

```bash
npx wrangler pages dev public
```

Opening `index.html` via `file://` (or any server that doesn’t send COOP/COEP) will disable SAB.

### Assets

- Front-end libraries are **vendored** under:
  ```
  public/vendor/mdc/*              # Material Components Web (CSS/JS)
  public/vendor/monaco/vs/*        # Monaco Editor (0.45.0 'vs' folder)
  ```
- WASM toolchain binaries are **not** in `public/` (they exceed Pages’ 25 MiB limit). They’re streamed via function routes:

  ```
  /toolchain/clang
  /toolchain/lld         # alias: /toolchain/wasm-ld
  ```

  The function sources point to **GitHub Release assets** in this repo (see `functions/toolchain/[name].js`).  
  To update, publish a new release (e.g., `toolchain-v2`) and bump the `TAG` constant in the function.

- Small helper files (served directly from `public`):
  ```
  public/third_party/wasm-clang/shared.js
  public/third_party/wasm-clang/sysroot.tar
  ```

## How input works (blocking `std::getline`)

Interactive C++ programs block on `stdin` via a **WASI `fd_read` import** implemented by the in-browser FS glue:

1. When the program calls `std::getline`, `MemFS.host_read` (from our adapted `shared.js`) posts a `requestInput` message and then **blocks** in the worker with `Atomics.wait` on a `SharedArrayBuffer`.
2. The main thread shows an inline prompt (`>`), writes the user’s bytes into the SAB, stores the byte count, and calls `Atomics.notify`.
3. `host_read` wakes, copies **up to** the first iov’s capacity (short read), returns to the WASI call, and program execution resumes.

Because this uses **Atomics + SAB**, the page must be **cross-origin isolated** (COOP/COEP) and all subresources must respect those headers.

## Credits

- **LLVM Clang & LLD** — © The LLVM Project — _Apache-2.0 WITH LLVM-exception_.  
  WebAssembly builds are mirrored via this repo’s GitHub Releases and streamed by Pages Functions.  
  Upstream: <https://llvm.org/> — Project repo: <https://github.com/llvm/llvm-project>

- **wasm-clang** — © Ben Smith (“binji”) & contributors — _Apache-2.0_.  
  We use (with minor adaptions) key parts of the demo’s browser glue including **`shared.js`**, the **MemFS/WASI host shims**, and **`sysroot.tar`** (the small tweaks are to enable SAB-based blocking input).  
  Project: <https://github.com/binji/wasm-clang>

- **Monaco Editor** — © Microsoft — _MIT_.  
  <https://github.com/microsoft/monaco-editor>

- **Material Components for the Web (MDC)** — © Google — _Apache-2.0_.  
  <https://github.com/material-components/material-components-web>

See [`third-party/NOTICES/`](third-party/NOTICES/) and [`third-party/LICENSES/`](third-party/LICENSES/) for full texts and attributions.

## Licensing

- Project code: **Apache-2.0** (see `LICENSE` at repo root; SPDX: `Apache-2.0`).
- Bundled/streamed third-party components:
  - LLVM (clang, lld): **Apache-2.0 WITH LLVM-exception** (see `third-party/LICENSES/LLVM-Exception.txt` and notice in `third-party/NOTICES/llvm.txt`).
  - wasm-clang glue we adapted: **Apache-2.0** (see `third-party/LICENSES/Apache-2.0.txt`).
  - Monaco Editor: **MIT** (see `third-party/LICENSES/MIT.txt`).
  - MDC: **Apache-2.0** (see `third-party/LICENSES/Apache-2.0.txt`).

Each vendored folder under `public/vendor/*` includes a small `LICENSE` stub pointing back to the central license texts.

## Updating the toolchain binaries

1. Create a new GitHub **Release** (e.g., `toolchain-v2`) and upload `clang` and `lld` as assets.
2. Update `TAG` (and optionally URLs) in `functions/toolchain/[name].js`:
   ```js
   const OWNER = "bakerpdgit";
   const REPO = "CppEditor";
   const TAG = "toolchain-v2"; // <-- bump here
   ```
3. Commit & deploy. Verify:
   - `/toolchain/clang` → `Content-Type: application/wasm`
   - `/toolchain/lld` → `Content-Type: application/wasm`

## Troubleshooting

- **MIME error / “magic word 00 61 73 6d”**  
  The requested file returned HTML (likely a SPA fallback). Ensure compiler/linker fetches go to `/toolchain/*` (function), not `/third_party/*`.

- **Input doesn’t pause**  
  Check:

  ```js
  crossOriginIsolated === true;
  typeof SharedArrayBuffer === "function";
  ```

  If false, verify COOP/COEP headers and that all subresources are same-origin or CORP’d.

- **Hangs on input**  
  Ensure `host_read` returns a **short read** (copies only the available bytes) and you `Atomics.notify` after writing to the SAB.
