# Dashboard de sensores · DynamoDB → GitHub Pages

Panel web que lee la tabla **`LecturaSensor`** de DynamoDB (región `us-west-1`).

- **En vivo (recomendado):** una Lambda con Function URL lee DynamoDB y el navegador
  consulta cada 3 s. Sirve en local (`npm start`) y publicado en GitHub Pages.
- **Snapshot:** GitHub Actions lee la tabla cada 10 minutos, regenera
  `dashboard/data.json` y despliega el sitio. No es tiempo real, pero no necesita API.

```
DynamoDB (LecturaSensor)
        │  GitHub Actions (cron */10) + rol OIDC
        ▼
scripts/fetch.mjs  ──►  dashboard/data.json
        ▼
dashboard/index.html (Chart.js)  ──►  GitHub Pages
```

## Estructura

| Ruta | Qué hace |
|---|---|
| `dashboard/index.html` | Panel: KPIs, gráfico de distancias, obstáculos y tabla |
| `dashboard/data.json` | Datos del modo snapshot (demo, import o fetch) |
| `scripts/run.mjs` | `npm start`: comprueba DynamoDB, arranca el servidor y abre el panel |
| `scripts/dev-server.mjs` | Servidor local con `/api/readings` en vivo |
| `scripts/fetch.mjs` | Lee DynamoDB con `Scan` paginado y genera `data.json` |
| `scripts/import-json.mjs` | Importa un ítem copiado de la consola (sin credenciales) |
| `scripts/sample.mjs` | Genera datos falsos para previsualizar sin AWS |
| `infra/api/index.mjs` | Handler de la API (lo usan el servidor local y la Lambda) |
| `infra/api/normalize.mjs` | Mapeo de campos (`idSensor`, `accion`, distancias…) |
| `infra/api/template.yaml` | SAM: API Gateway + Lambda para publicar en vivo |
| `.github/workflows/dashboard.yml` | Cron + build + deploy a Pages |
| `infra/oidc-role.yaml` | Rol IAM con OIDC para que Actions lea DynamoDB sin claves |

## Traer los datos en vivo (recomendado)

El panel no puede leer DynamoDB directamente desde el navegador: DynamoDB exige
credenciales y no permite CORS. Por eso hay un servidor local (`scripts/dev-server.mjs`)
que hace la lectura por ti y el navegador consulta cada 3 segundos.

### Paso 1: crea el archivo `.env`

Desde la carpeta `sensor-dashboard`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Rellena estos valores:

```env
AWS_REGION=us-west-1
AWS_ACCESS_KEY_ID=TU_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=TU_SECRET_KEY
# Solo AWS Academy / Learner Lab:
# AWS_SESSION_TOKEN=TU_SESSION_TOKEN
```

`.env` está en `.gitignore`, así que tus claves no se suben a GitHub.

### Paso 2: arranca el panel

```powershell
npm install
npm start
```

Eso comprueba la conexión con `LecturaSensor`, arranca el servidor en
`http://localhost:4321` y abre el panel. La página consulta la tabla cada 3 s, así que
cada ítem nuevo que crees en DynamoDB aparece solo. Si las credenciales faltan o son
incorrectas, el comando lo dice antes de abrir nada.

Para probar sin AWS: `MOCK=1 npm start` (en PowerShell: `$env:MOCK="1"; npm start`).

### ¿De dónde saco las credenciales?

**AWS Academy / Learner Lab** (credenciales temporales):

1. Entra al lab y pulsa **AWS Details** → **AWS CLI: Show**.
2. Copia `aws_access_key_id`, `aws_secret_access_key` y `aws_session_token`.
3. Pégalos en `.env` (incluido `AWS_SESSION_TOKEN`). Caducan al cerrar el lab: si el
   panel deja de leer, vuelve a copiarlos.

**Cuenta AWS propia** (recomendado: usuario IAM solo-lectura):

1. IAM → **Users** → tu usuario → **Security credentials** → **Create access key**.
2. Adjunta una política con `dynamodb:Scan` sobre la tabla `LecturaSensor`.
3. Pega la key y el secret en `.env` (sin `AWS_SESSION_TOKEN`).

También puedes instalar AWS CLI y ejecutar `aws configure`; el SDK usará ese perfil
automáticamente y no necesitarás `.env`.

### Sin credenciales: importar el ítem desde la consola

En DynamoDB → **Explorar elementos** → abre tu ítem → **Ver elemento como JSON** →
copia el JSON y guárdalo como `item.json` en esta carpeta. Luego:

```powershell
npm run import -- item.json
```

El panel mostrará ese ítem como una sola fila (acepta JSON plano o el formato de
DynamoDB con `{ "S": ... }`). Es una foto fija: no se actualiza sola.

## 1. Probar en local

```bash
npm install
npm run import -- item.json   # tu ítem real, o:
node scripts/sample.mjs       # datos de demo
npm run serve                 # http://localhost:4321
```

## 2. Crear el repositorio y activar Pages

```bash
git init
git add .
git commit -m "Dashboard de sensores"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/sensor-dashboard.git
git push -u origin main
```

En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 3. Dar acceso a DynamoDB (recomendado: OIDC)

Sin claves permanentes. En CloudFormation crea el stack con `infra/oidc-role.yaml`:

- `GitHubOrg`: tu usuario u organización (ej. `edyam`)
- `GitHubRepo`: `sensor-dashboard`
- `CreateOidcProvider`: `no` si la cuenta ya tiene el proveedor OIDC de GitHub

Copia el `RoleArn` del output y guárdalo como secret del repo:

**Settings → Secrets and variables → Actions → New repository secret**
`AWS_ROLE_ARN` = `arn:aws:iam::<cuenta>:role/github-sensor-dashboard`

### Alternativa rápida (menos segura)

Crea un usuario IAM con `AmazonDynamoDBReadOnlyAccess` y guarda
`AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` como secrets. Luego elimina el paso
`configure-aws-credentials` con `role-to-assume` (las credenciales se toman del entorno).

## 4. Ejecutar

**Actions → Actualizar dashboard → Run workflow**. En 1-2 minutos tendrás la URL
`https://<tu-usuario>.github.io/sensor-dashboard/`.

## 5. Tiempo real (API + polling)

GitHub Pages es estático y el cron de Actions **no** es tiempo real (mínimo 5 min, a veces
5-15). Para ver los datos al instante necesitas una API que lea DynamoDB y el panel
consultará esa API cada 3 segundos.

**Sin instalar nada (consola de AWS):** sigue
[`infra/api/DEPLOY-CONSOLE.md`](infra/api/DEPLOY-CONSOLE.md). Copias un archivo en una
Lambda, creas una Function URL y pegas la URL en `dashboard/config.js`.

**Con SAM CLI:**

```bash
cd infra/api
sam build
sam deploy --guided
```

Parámetros sugeridos:

| Parámetro | Valor |
|---|---|
| `TableName` | `LecturaSensor` |
| `AllowedOrigin` | `https://<tu-usuario>.github.io` (o `*` para probar) |
| `MaxItems` | `5000` |

Copia el output `ApiUrl` en `dashboard/config.js`:

```js
window.DASHBOARD_CONFIG = {
  apiUrl: "https://xxxxxxxxxx.execute-api.us-west-1.amazonaws.com",
  pollMs: 3000,
};
```

Haz commit y push. El panel mostrará el punto verde pulsando y "En vivo · …". Ya no
depende del cron: cada pestaña abierta consulta `/readings?since=…` cada 3 s.

### Probar el modo en vivo sin AWS

```bash
npm run serve     # terminal 1 -> http://localhost:4321
npm run mock      # terminal 2 -> API falsa en http://localhost:4322
```

Abre `http://localhost:4321/?api=http://localhost:4322` y verás una lectura nueva cada
2 segundos. El parámetro `?api=` tiene prioridad sobre `config.js`, así puedes probar sin
tocar la configuración publicada.

### Si necesitas menos de 1 segundo

El polling cada 3 s es casi real. Para push instantáneo hay que añadir **DynamoDB Streams
→ Lambda → API Gateway WebSocket** (o AppSync subscriptions): el navegador recibe cada
lectura sin preguntar. Dímelo y lo añado.

## Preguntas frecuentes

### ¿Por qué veo muchas lecturas si en DynamoDB tengo una sola?

Porque el panel está mostrando **datos de demostración**, no tu tabla. El archivo
`dashboard/data.json` incluye `"demo": true` y el panel muestra un aviso amarillo.
Para ver tu tabla real tienes dos caminos:

```powershell
# A) en vivo (recomendado)
$env:AWS_REGION="us-west-1"
$env:AWS_ACCESS_KEY_ID="..."
$env:AWS_SECRET_ACCESS_KEY="..."
npm start
```

```powershell
# B) sin credenciales: copia el ítem como JSON desde la consola
npm run import -- item.json
```

Ambos reemplazan los datos de demo. Si tienes un ítem, verás **"1 de 1 lecturas"**.

### ¿Se puede hacer todo desde GitHub?

Depende de qué parte:

| Parte | ¿GitHub solo? |
|---|---|
| Alojar el panel | **Sí**, GitHub Pages |
| Leer DynamoDB cada 5-15 min | **Sí**, GitHub Actions con el workflow |
| Leer DynamoDB en tiempo real (3 s) | **No**, hace falta la Lambda Function URL |

GitHub Pages solo sirve archivos estáticos: no puede ejecutar código ni guardar
credenciales AWS. GitHub Actions sí puede leer DynamoDB, pero solo cuando corre el
workflow; el cron mínimo es 5 minutos y GitHub suele retrasarlo. Para tiempo real el
panel sigue en GitHub, pero la lectura la hace la Lambda (guía en
`infra/api/DEPLOY-CONSOLE.md`).

### El dashboard va a ir creciendo con el tiempo, ¿es normal?

Sí. Tu Lambda guarda **un ítem nuevo por cada lectura** (`idSensor = "sensor-01_" + Date.now()`),
así que DynamoDB acumula el historial. Eso no es duplicación: son lecturas distintas. El panel
las ordena por `fecha` y muestra las más recientes.

Si prefieres que la tabla guarde **solo la última lectura** (una fila siempre), cambia el
`idSensor` por un valor fijo, por ejemplo `"sensor-01"`, y DynamoDB sobrescribirá el mismo
ítem en cada `PutItem`. El panel seguirá funcionando igual.

### El panel muestra 15 filas, ¿está duplicando?

No: la tabla "Últimas lecturas" muestra como máximo las 15 más recientes. El total real
aparece en "Lecturas mostradas". Si ese total no coincide con tu tabla, revisa que no
estés usando la API falsa (`?api=http://localhost:4322`) o `data.json` de demo.

## Notas importantes

- **Sin API, el panel es un snapshot**: `data.json` solo cambia cuando corre el workflow
  (cada 10 min). Con `apiUrl` configurado, el panel es en vivo y `data.json` queda como
  respaldo.
- **`Scan`** está bien para miles de ítems. Si la tabla crece mucho, crea un GSI por
  `fecha` y usa `Query` por rango, o exporta a S3/Athena.
- Ajusta `MAX_ITEMS` (default 5000) según el tamaño de la tabla.
- El mapeo de campos está en `infra/api/normalize.mjs`: `idSensor` (le quita el sufijo
  `_<epoch>`), `distanciaFrontal`, `distanciaIzquierda`, `distanciaDerecha`, `fecha`,
  `obstaculo`, `accion.direccionTomada` y `accion.girando`.
- El panel consulta cada 3 s (`pollMs` en `dashboard/config.js`), tanto en modo snapshot
  como en modo API.
