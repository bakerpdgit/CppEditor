// functions/toolchain/[name].js

const OWNER = "bakerpdgit";
const REPO = "CppEditor";
const TAG = "toolchain-v1";
const GH = `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}`;

const SOURCES = {
  clang: `${GH}/clang`,
  lld: `${GH}/lld`,
  "wasm-ld": `${GH}/lld`, // alias
};

export async function onRequest({ request, params }) {
  let name = params.name;
  if (!name) return new Response("Missing name", { status: 400 });
  if (name === "wasm-lld") name = "wasm-ld"; // normalise alias

  const upstream = SOURCES[name];
  if (!upstream) return new Response("Not found", { status: 404 });

  // HEAD passthrough
  if (request.method === "HEAD") {
    const h = await fetch(upstream, {
      method: "HEAD",
      cf: { cacheEverything: true, cacheTtl: 31536000 },
    });
    return new Response(null, { status: h.status, headers: headersFor(name) });
  }

  const r = await fetch(upstream, {
    cf: { cacheTtlByStatus: { "200-299": 31536000, 404: 0, "500-599": 0 } },
  });
  if (!r.ok) return new Response(`Upstream ${r.status}`, { status: 502 });

  return new Response(r.body, { status: 200, headers: headersFor(name) });
}

function headersFor(name) {
  const h = new Headers();
  h.set(
    "Content-Type",
    name.endsWith(".tar") ? "application/x-tar" : "application/wasm"
  );
  h.set("Cache-Control", "public, max-age=31536000, immutable");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("Accept-Ranges", "bytes");
  return h;
}
