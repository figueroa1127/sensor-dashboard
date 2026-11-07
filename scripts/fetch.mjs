/**
 * Lee la tabla LecturaSensor de DynamoDB y genera dashboard/data.json.
 * Es el modo "snapshot" para GitHub Pages. Para tiempo real usa `npm start`
 * (servidor local) o despliega el API de infra/api.
 *
 * Variables de entorno:
 *   TABLE_NAME  (default: LecturaSensor)
 *   AWS_REGION  (default: us-west-1)
 *   MAX_ITEMS   (default: 5000)
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { mkdir, writeFile } from "node:fs/promises";
import { normalizeItem } from "../infra/api/normalize.mjs";

const TABLE = process.env.TABLE_NAME ?? "LecturaSensor";
const REGION = process.env.AWS_REGION ?? "us-west-1";
const MAX_ITEMS = Number(process.env.MAX_ITEMS ?? 5000);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function scanAll() {
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
    return `La tabla ${TABLE} no existe en ${REGION}. Revisa TABLE_NAME y AWS_REGION.`;
  }
  return error?.message ?? String(error);
}

try {
  const raw = await scanAll();

  const rows = raw
    .map(normalizeItem)
    .filter((row) => row.fecha)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const payload = {
    generatedAt: new Date().toISOString(),
    table: TABLE,
    region: REGION,
    demo: false,
    total: rows.length,
    count: rows.length,
    rows,
  };

  await mkdir("dashboard", { recursive: true });
  await writeFile("dashboard/data.json", JSON.stringify(payload));

  console.log(`OK: ${rows.length} lecturas de ${TABLE} (${REGION}) -> dashboard/data.json`);

  if (raw.length > 0 && rows.length === 0) {
    console.warn(
      `Aviso: había ${raw.length} ítems pero ninguno tiene una fecha válida. Atributos: ${Object.keys(raw[0]).join(", ")}`,
    );
  }
} catch (error) {
  console.error(`Error leyendo ${TABLE}: ${explain(error)}`);
  process.exit(1);
}
