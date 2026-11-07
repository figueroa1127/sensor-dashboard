/**
 * API falsa para probar el modo "en vivo" sin AWS.
 * Uso: node scripts/mock-api.mjs   ->  http://localhost:4322
 * Luego abre: http://localhost:4321/?api=http://localhost:4322
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4322);
const SENSORS = ["sensor-01", "sensor-02"];
let rows = [];

function reading(sensor, fecha) {
  const frontal = Math.round((20 + Math.random() * 90) * 100) / 100;
  const izquierda = Math.round((30 + Math.random() * 140) * 100) / 100;
  const derecha = Math.round((30 + Math.random() * 140) * 100) / 100;
  return {
    sensor,
    fecha,
    frontal,
    izquierda,
    derecha,
    obstaculo: frontal < 45 ? 1 : 0,
    direccion: frontal < 45 ? "izquierda" : "adelante",
    girando: frontal < 45,
  };
}

function push(fecha = new Date().toISOString()) {
  for (const sensor of SENSORS) rows.push(reading(sensor, fecha));
  rows = rows.slice(-2000);
}

// Historial inicial (últimos ~4 minutos)
for (let i = 120; i > 0; i--) {
  push(new Date(Date.now() - i * 2000).toISOString());
}
// Nueva lectura cada 2 segundos
setInterval(() => push(), 2000);

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  if (url.pathname !== "/readings" && url.pathname !== "/latest") {
    res.writeHead(404, headers).end(JSON.stringify({ error: "not found" }));
    return;
  }

  const sensor = url.searchParams.get("sensor");
  const since = url.searchParams.get("since");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 200), 1), 2000);

  let out = rows;
  if (sensor) out = out.filter((row) => row.sensor === sensor);
  if (since) out = out.filter((row) => row.fecha > since);
  out = out.slice(-limit);

  res.writeHead(200, headers);
  res.end(JSON.stringify({ generatedAt: new Date().toISOString(), table: "LecturaSensor", demo: true, count: out.length, rows: out }));
}).listen(PORT, () => console.log(`Mock API en http://localhost:${PORT}`));
