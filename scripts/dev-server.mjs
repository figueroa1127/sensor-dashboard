/**
 * Servidor local "todo en uno": sirve el dashboard y expone /api/readings
 * leyendo DynamoDB en vivo (mismo handler que la Lambda).
 *
 * Uso: node scripts/dev-server.mjs
 * Variables: TABLE_NAME, AWS_REGION, MAX_ITEMS, PORT
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 4321);
const ROOT = fileURLToPath(new URL("../dashboard/", import.meta.url));

process.env.TABLE_NAME ??= "LecturaSensor";
process.env.AWS_REGION ??= "us-west-1";
process.env.MAX_ITEMS ??= "5000";
process.env.ALLOWED_ORIGIN ??= "*";

const { handler } = await import("../infra/api/index.mjs");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/readings" || url.pathname === "/api/latest") {
    try {
      const result = await handler({
        queryStringParameters: Object.fromEntries(url.searchParams),
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
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
    console.log(`Puerto ${PORT} ocupado. Usa otro: PORT=4322 node scripts/dev-server.mjs`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, () => console.log(`Dashboard en vivo: http://localhost:${PORT}`));
