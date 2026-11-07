/**
 * Importa uno o varios ítems exportados de la consola de DynamoDB (JSON) y
 * genera dashboard/data.json. Sirve cuando no quieres configurar credenciales.
 *
 * Uso:
 *   npm run import -- item.json
 *
 * Acepta:
 *   - Un ítem plano:            { "idSensor": "sensor-01_1794037530", ... }
 *   - Un array de ítems:        [ {...}, {...} ]
 *   - JSON de DynamoDB:         { "idSensor": { "S": "..." }, ... }
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { normalizeItem } from "../infra/api/normalize.mjs";

const file = process.argv[2];

if (!file) {
  console.error("Uso: npm run import -- ruta/al/item.json");
  process.exit(1);
}

function unmarshall(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if ("S" in value) return value.S;
  if ("N" in value) return Number(value.N);
  if ("BOOL" in value) return value.BOOL;
  if ("NULL" in value) return null;
  if ("M" in value) {
    return Object.fromEntries(Object.entries(value.M).map(([k, v]) => [k, unmarshall(v)]));
  }
  if ("L" in value) return value.L.map(unmarshall);
  if ("SS" in value) return value.SS;
  if ("NS" in value) return value.NS.map(Number);
  return value;
}

function looksLikeDynamoDb(item) {
  const values = Object.values(item ?? {});
  if (values.length === 0) return false;
  return values.every(
    (v) =>
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v).some((k) => ["S", "N", "BOOL", "NULL", "M", "L", "SS", "NS"].includes(k)),
  );
}

function toPlain(item) {
  return looksLikeDynamoDb(item)
    ? Object.fromEntries(Object.entries(item).map(([k, v]) => [k, unmarshall(v)]))
    : item;
}

try {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const items = (Array.isArray(parsed) ? parsed : [parsed]).map(toPlain);

  const rows = items
    .map(normalizeItem)
    .filter((row) => row.fecha)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  if (rows.length === 0) {
    console.error(
      `No se pudo interpretar ningún ítem. Atributos del primero: ${Object.keys(items[0] ?? {}).join(", ")}`,
    );
    process.exit(1);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    table: "LecturaSensor",
    source: `import:${file}`,
    demo: false,
    total: rows.length,
    count: rows.length,
    rows,
  };

  await mkdir("dashboard", { recursive: true });
  await writeFile("dashboard/data.json", JSON.stringify(payload));

  console.log(`OK: ${rows.length} ítem(s) importados -> dashboard/data.json`);
  if (rows.length < items.length) {
    console.warn(
      `Aviso: ${items.length - rows.length} ítem(s) sin fecha válida fueron descartados.`,
    );
  }
} catch (error) {
  console.error(`Error importando ${file}: ${error.message}`);
  process.exit(1);
}
