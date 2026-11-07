/**
 * Comando único: arranca el dashboard en vivo (lee DynamoDB en cada consulta)
 * y lo abre en el navegador.
 *
 * Uso:
 *   npm start
 *
 * Variables:
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (o perfil aws configure)
 *   TABLE_NAME  (default: LecturaSensor)
 *   PORT        (default: 4321)
 *   MOCK=1      usa datos de demostración en vez de DynamoDB
 *   NO_OPEN=1   no abre el navegador
 */
import { spawn, exec } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;
const START_PORT = Number(process.env.PORT ?? 4321);
const MOCK = process.env.MOCK === "1";
const TABLE = process.env.TABLE_NAME ?? "LecturaSensor";
const REGION = process.env.AWS_REGION ?? "us-west-1";

process.env.TABLE_NAME = TABLE;
process.env.AWS_REGION = REGION;
process.env.MAX_ITEMS ??= "5000";

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(NODE, args, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

async function findFreePort(start, tries = 20) {
  for (let port = start; port < start + tries; port++) {
    if (await portFree(port)) return port;
  }
  throw new Error(`No hay puerto libre entre ${start} y ${start + tries - 1}`);
}

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // todavía no responde
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, () => {});
}

if (MOCK) {
  console.log("Modo demostración (MOCK=1): generando lecturas falsas…");
  const code = await run([join(ROOT, "scripts", "sample.mjs")]);
  if (code !== 0) process.exit(code);

  const port = await findFreePort(START_PORT);
  spawn(NODE, [join(ROOT, "scripts", "serve.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: String(port) },
  });

  const url = `http://localhost:${port}`;
  if (!(await waitForServer(url))) {
    console.error(`No se pudo iniciar el servidor en ${url}`);
    process.exit(1);
  }
  console.log(`\nPanel (demo): ${url}\n`);
  openBrowser(url);
} else {
  console.log(`Comprobando DynamoDB: tabla ${TABLE}, región ${REGION}…`);

  let preflight;
  try {
    const { handler } = await import("../infra/api/index.mjs");
    preflight = await handler({ queryStringParameters: { limit: "1" } });
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }

  const json = JSON.parse(preflight.body);
  if (preflight.statusCode !== 200) {
    console.error(`\nNo se pudo leer DynamoDB: ${json.error}\n`);
    console.error("Configura tus credenciales antes de ejecutar npm start.\n");
    console.error("Opción rápida: copia .env.example a .env y rellena los valores.\n");
    console.error("  Copy-Item .env.example .env");
    console.error("  notepad .env\n");
    console.error("O en la terminal:\n");
    console.error('  $env:AWS_REGION="us-west-1"');
    console.error('  $env:AWS_ACCESS_KEY_ID="TU_ACCESS_KEY"');
    console.error('  $env:AWS_SECRET_ACCESS_KEY="TU_SECRET_KEY"');
    console.error('  $env:AWS_SESSION_TOKEN="TU_TOKEN"   # solo AWS Academy\n');
    process.exit(1);
  }

  console.log(`OK: ${json.total} lecturas en ${TABLE}.`);

  const port = await findFreePort(START_PORT);
  spawn(NODE, [join(ROOT, "scripts", "dev-server.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: String(port) },
  });

  const base = `http://localhost:${port}`;
  const url = `${base}/?api=${base}/api`;

  if (!(await waitForServer(`${base}/api/readings?limit=1`))) {
    console.error(`No se pudo iniciar el servidor en ${base}`);
    process.exit(1);
  }

  console.log(`\nPanel en vivo: ${base}\n`);
  openBrowser(url);
}
