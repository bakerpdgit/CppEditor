// functions/toolchain/[name].js
const ORIGIN = "https://binji.github.io/wasm-clang";

const CT = {
  wasm: "application/wasm",
  tar: "application/x-tar",
  bin: "application/octet-stream",
};

export async function onRequest({ request, params, env }) {
  const url = new URL(request.url);
  let name = params.name; // path segment after /toolchain/
  if (!name) return new Response("Missing name", { status: 400 });

  // Map alias: some toolchains call the linker "wasm-ld"; upstream uses "lld"
  if (name === "wasm-ld") name = "lld";

  // Only allow the files we expect
  const allow = new Set(["clang", "lld", "sysroot.tar"]);
  if (!allow.has(name)) return new Response("Not found", { status: 404 });

  const upstream = `${ORIGIN}/${name}`;
  const method = request.method.toUpperCase();

  // Support HEAD probes from your code
  if (method === "HEAD") {
    const headResp = await fetch(upstream, { method: "HEAD" });
    return new Response(null, {
      status: headResp.status,
      headers: makeHeaders(name),
    });
  }

  // Stream the body; let Cloudflare edge cache it
  const resp = await fetch(upstream, {
    method: "GET",
    // Optional: stronger caching at the edge
    cf: { cacheTtl: 31536000, cacheEverything: true },
  });

  if (!resp.ok) {
    return new Response(`Upstream ${resp.status}`, { status: 502 });
  }

  // Clone as a streamed body; set explicit headers for WASM streaming compile
  return new Response(resp.body, {
    status: 200,
    headers: makeHeaders(name),
  });
}

function makeHeaders(name) {
  const h = new Headers();
  // Content-Type for streaming compile
  if (name === "clang" || name === "lld") h.set("Content-Type", CT.wasm);
  else if (name.endsWith(".tar")) h.set("Content-Type", CT.tar);
  else h.set("Content-Type", CT.bin);

  // Keep isolation happy; same-origin responses don’t strictly need CORP,
  // but adding it is harmless and explicit.
  h.set("Cross-Origin-Resource-Policy", "same-origin");

  // Long cache; files are versioned upstream rarely
  h.set("Cache-Control", "public, max-age=31536000, immutable");

  // Let streaming compile work efficiently
  h.set("Accept-Ranges", "bytes");
  return h;
}
