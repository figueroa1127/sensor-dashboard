/**
 * Genera datos de demostración en dashboard/data.json para previsualizar
 * el panel sin credenciales de AWS.  Uso: node scripts/sample.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";

const sensors = ["sensor-01", "sensor-02"];
const now = Date.now();
const rows = [];

for (let i = 90; i >= 0; i--) {
  const fecha = new Date(now - i * 15 * 60 * 1000).toISOString();
  for (const sensor of sensors) {
    const frontal = Math.round((20 + Math.random() * 90) * 100) / 100;
    const izquierda = Math.round((30 + Math.random() * 140) * 100) / 100;
    const derecha = Math.round((30 + Math.random() * 140) * 100) / 100;
    rows.push({
      sensor,
      fecha,
      frontal,
      izquierda,
      derecha,
      obstaculo: frontal < 45 ? 1 : 0,
      direccion: frontal < 45 ? "izquierda" : "adelante",
      girando: frontal < 45,
    });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  table: "LecturaSensor",
  region: "us-west-1",
  demo: true,
  count: rows.length,
  rows,
};

await mkdir("dashboard", { recursive: true });
await writeFile("dashboard/data.json", JSON.stringify(payload));
console.log(`OK: ${rows.length} lecturas de demostración -> dashboard/data.json`);
