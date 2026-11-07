/**
 * API de lecturas para el dashboard.
 * GET /readings?limit=2000&sensor=sensor-01&since=2026-11-07T09:00:00.000Z
 *
 * Variables de entorno:
 *   TABLE_NAME      (default: LecturaSensor)
 *   MAX_ITEMS       (default: 5000)
 *   ALLOWED_ORIGIN  (default: *)
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { normalizeItem } from "./normalize.mjs";

const TABLE = process.env.TABLE_NAME ?? "LecturaSensor";
const REGION = process.env.AWS_REGION ?? "us-west-1";
const MAX_ITEMS = Number(process.env.MAX_ITEMS ?? 5000);
const ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function readAll() {
  const items = [];
  let ExclusiveStartKey;

  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: TABLE, ExclusiveStartKey, Limit: 1000 }),
    );
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < MAX_ITEMS);

  return items.slice(0, MAX_ITEMS);
}

function explain(error) {
  if (error?.name === "CredentialsProviderError") {
    return "No hay credenciales AWS configuradas (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY o aws configure).";
  }
  if (error?.name === "AccessDeniedException" || error?.name === "UnrecognizedClientException") {
    return `La credencial no tiene permiso dynamodb:Scan sobre ${TABLE}.`;
  }
  if (error?.name === "ResourceNotFoundException") {
    return `La tabla ${TABLE} no existe en la región configurada.`;
  }
  return error?.message ?? String(error);
}

// Caché corto: si varios clientes consultan a la vez, no repetimos el Scan.
let cache = { at: 0, rows: [], fields: [], rawCount: 0 };

async function getData() {
  if (Date.now() - cache.at < 2000 && cache.rawCount) return cache;

  const raw = await readAll();
  const rows = raw
    .map(normalizeItem)
    .filter((row) => row.fecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  cache = {
    at: Date.now(),
    rows,
    fields: raw[0] ? Object.keys(raw[0]) : [],
    rawCount: raw.length,
  };
  return cache;
}

export const handler = async (event) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": ORIGIN,
  };

  try {
    const qs = event.queryStringParameters ?? {};
    const limit = Math.min(Math.max(Number(qs.limit ?? 200), 1), 2000);
    const sensor = qs.sensor;
    const since = qs.since;

    const data = await getData();
    let rows = data.rows;

    if (sensor) rows = rows.filter((row) => row.sensor === sensor);
    if (since) rows = rows.filter((row) => row.fecha > since);

    const total = rows.length;
    rows = rows.slice(-limit);

    const warning =
      data.rawCount > 0 && data.rows.length === 0
        ? `Hay ${data.rawCount} ítems en ${TABLE} pero ninguno tiene una 'fecha' válida. Atributos encontrados: ${data.fields.join(", ")}`
        : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        table: TABLE,
        demo: false,
        total,
        count: rows.length,
        warning,
        rows,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: explain(err) }),
    };
  }
};
