/**
 * Servidor estático mínimo para previsualizar el dashboard en local.
 * Uso: node scripts/serve.mjs   ->   http://localhost:4321
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 4321);
const ROOT = fileURLToPath(new URL("../dashboard/", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const file = normalize(join(ROOT, relative));

  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Puerto ${PORT} ocupado. Prueba con otro: PORT=4322 node scripts/serve.mjs`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, () => console.log(`Dashboard en http://localhost:${PORT}`));
