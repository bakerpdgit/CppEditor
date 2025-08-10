// functions/toolchain/[name].js
const SOURCES = {
  clang: "https://github.com/binji/wasm-clang/raw/refs/heads/master/clang",
  lld: "https://github.com/binji/wasm-clang/raw/refs/heads/master/lld",
  "wasm-ld": "https://github.com/binji/wasm-clang/raw/refs/heads/master/lld", // alias
  "sysroot.tar": "/third_party/wasm-clang/sysroot.tar", // small; you host this in public/
  "shared.js": "/third_party/wasm-clang/shared.js", // small; you host this in public/
};

const CT = {
  wasm: "application/wasm",
  tar: "application/x-tar",
  js: "application/javascript",
  bin: "application/octet-stream",
};

export async function onRequest({ request, params }) {
  let name = params.name;
  if (!name) return new Response("Missing name", { status: 400 });

  // normalise aliases
  if (name === "wasm-lld") name = "wasm-ld";

  const src = SOURCES[name];
  if (!src) return new Response("Not found", { status: 404 });

  // HEAD support
  if (request.method === "HEAD") {
    const r = await fetch(resolve(src), {
      method: "HEAD",
      cf: { cacheEverything: true, cacheTtl: 31536000 },
    });
    return new Response(null, { status: r.status, headers: headersFor(name) });
  }

  const r = await fetch(resolve(src), {
    cf: { cacheEverything: true, cacheTtl: 31536000 },
  });
  if (!r.ok) return new Response(`Upstream ${r.status}`, { status: 502 });

  return new Response(r.body, { status: 200, headers: headersFor(name) });
}

function resolve(u) {
  // Allow path-relative for your own small assets
  if (u.startsWith("/")) return u;
  return u;
}

function headersFor(name) {
  const h = new Headers();
  if (name.endsWith(".js")) h.set("Content-Type", CT.js);
  else if (name.endsWith(".tar")) h.set("Content-Type", CT.tar);
  else if (name === "clang" || name === "lld" || name === "wasm-ld")
    h.set("Content-Type", CT.wasm);
  else h.set("Content-Type", CT.bin);

  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("Cache-Control", "public, max-age=31536000, immutable");
  h.set("Accept-Ranges", "bytes");
  return h;
}
