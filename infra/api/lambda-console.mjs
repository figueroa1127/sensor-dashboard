/**
 * Handler único para pegar en la consola de AWS Lambda (Node.js 20.x).
 * No necesita capas ni node_modules: usa el SDK v3 incluido en el runtime.
 *
 * Pasos detallados en DEPLOY-CONSOLE.md. Resumen:
 *  1. Lambda -> Create function -> Node.js 20.x -> pega este archivo como index.mjs.
 *  2. Configuration -> Environment variables: TABLE_NAME=LecturaSensor
 *  3. Rol de ejecución: política dynamodb:Scan sobre la tabla.
 *  4. Configuration -> Function URL -> Auth type NONE -> CORS permitido.
 *  5. Copia la URL en dashboard/config.js (apiUrl) y haz push.
 */
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const TABLE = process.env.TABLE_NAME ?? "LecturaSensor";
const REGION = process.env.AWS_REGION ?? "us-west-1";
const MAX_ITEMS = Number(process.env.MAX_ITEMS ?? 5000);
const ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

const ddb = new DynamoDBClient({ region: REGION });

// --- DynamoDB (AttributeValue) -> objetos planos -------------------------

function unmarshall(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(unmarshall);
  if (typeof value !== "object") return value;
  if ("S" in value) return value.S;
  if ("N" in value) return Number(value.N);
  if ("BOOL" in value) return value.BOOL;
  if ("NULL" in value) return null;
  if ("M" in value) return unmarshallMap(value.M);
  if ("L" in value) return value.L.map(unmarshall);
  if ("SS" in value) return value.SS;
  if ("NS" in value) return value.NS.map(Number);
  if ("BS" in value) return value.BS;
  return value;
}

function unmarshallMap(map) {
  return Object.fromEntries(
    Object.entries(map ?? {}).map(([key, value]) => [key, unmarshall(value)]),
  );
}

// --- Normalización de campos ---------------------------------------------

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    return ["true", "1", "si", "sí", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return null;
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const text = String(value).trim().replace(" ", "T");
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseSensorId(raw) {
  const text = String(raw ?? "sensor").trim();
  const match = text.match(/^(.*?)[_-](\d{10,13})$/);
  if (!match) return { sensor: text, fecha: null };

  const [, base, digits] = match;
  const n = Number(digits);
  const ms = digits.length <= 10 ? n * 1000 : n;
  const d = new Date(ms);

  return {
    sensor: base || text,
    fecha: Number.isNaN(d.getTime()) ? null : d.toISOString(),
  };
}

function normalizeItem(item) {
  const { sensor, fecha: fechaFromId } = parseSensorId(item.idSensor ?? item.sensor);
  const obstaculoRaw =
    item.obstaculo ?? item.obstáculo ?? item.obstaculosEsquivados ?? item.obstaculos;
  const obstaculoNum = toNumber(obstaculoRaw);
  const accion = item.accion && typeof item.accion === "object" ? item.accion : {};

  return {
    sensor,
    fecha: toIso(item.fecha ?? item.timestamp ?? item.Fecha) ?? fechaFromId,
    frontal: toNumber(item.distanciaFrontal),
    izquierda: toNumber(item.distanciaIzquierda),
    derecha: toNumber(item.distanciaDerecha),
    obstaculo: obstaculoNum !== null ? obstaculoNum : toBool(obstaculoRaw),
    direccion: accion.direccionTomada ?? item.direccionTomada ?? null,
    girando: accion.girando ?? item.girando ?? null,
  };
}

// --- Lectura de DynamoDB --------------------------------------------------

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
    return "La Lambda no tiene credenciales. Revisa el rol de ejecución.";
  }
  if (error?.name === "AccessDeniedException" || error?.name === "UnrecognizedClientException") {
    return `El rol de la Lambda no tiene permiso dynamodb:Scan sobre ${TABLE}.`;
  }
  if (error?.name === "ResourceNotFoundException") {
    return `La tabla ${TABLE} no existe en ${REGION}. Revisa TABLE_NAME.`;
  }
  return error?.message ?? String(error);
}

// Caché corto: si varios clientes consultan a la vez, no repetimos el Scan.
let cache = { at: 0, rows: [], fields: [], rawCount: 0 };

async function getData() {
  if (Date.now() - cache.at < 2000 && cache.rawCount) return cache;

  const raw = (await readAll()).map((item) =>
    item && typeof item === "object" && !("S" in item) && !("N" in item)
      ? item
      : unmarshallMap(item),
  );

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

// --- Handler --------------------------------------------------------------

export const handler = async (event = {}) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  const method = event?.requestContext?.http?.method ?? event?.httpMethod ?? "GET";
  if (method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const qs = event.queryStringParameters ?? {};
    const limit = Math.min(Math.max(Number(qs.limit ?? 200), 1), 2000);
    const sensor = qs.sensor;

    const data = await getData();
    let rows = data.rows;

    if (sensor) rows = rows.filter((row) => row.sensor === sensor);

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
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: explain(error) }),
    };
  }
};
