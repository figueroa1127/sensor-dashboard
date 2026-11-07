# Publicar la API en vivo desde la consola de AWS

Objetivo: que el dashboard publicado en GitHub Pages lea DynamoDB **en vivo**, sin
guardar claves AWS en el navegador. Para eso hace falta una función Lambda con una
**Function URL** pública de solo lectura.

Tiempo aproximado: 10 minutos. No necesitas AWS CLI ni SAM.

```
GitHub Pages (navegador)
        │  fetch cada 3 s
        ▼
Lambda Function URL  ──►  DynamoDB LecturaSensor
```

> El navegador **no puede** leer DynamoDB directamente: DynamoDB no permite CORS y
> exige credenciales. La Lambda hace la lectura con su rol de IAM.

---

## Cómo hacerlo sin romper nada

Este cambio es **aditivo**: no modifica DynamoDB ni tu Lambda del ESP32.

- La Lambda nueva solo hace `dynamodb:Scan` (lectura). No puede escribir ni borrar.
- No toques la Lambda que recibe los datos del ESP32: crea una **función nueva**
  (`sensor-dashboard-api`) aparte.
- No cambies `dashboard/config.js` hasta que la Function URL responda bien.
- El workflow de GitHub sigue generando `data.json` cada 5 min como respaldo.
- Si la API falla, el panel ahora muestra el último snapshot en vez de quedarse vacío.
- **Rollback:** en `dashboard/config.js` pon `apiUrl: ""` y haz push. El panel vuelve
  al modo snapshot. También puedes borrar la Function URL; DynamoDB no se toca.

---

## 1. Crear la función Lambda

1. Entra a **AWS Console → Lambda → Create function**.
2. Elige **Author from scratch**.
3. Rellena:
   - **Function name**: `sensor-dashboard-api`
   - **Runtime**: `Node.js 20.x` (o superior)
   - **Architecture**: `x86_64`
   - **Permissions**: **Create a new role with basic Lambda permissions**
4. Pulsa **Create function**.

## 2. Pegar el código

1. En **Code source** abre el archivo `index.mjs`.
2. Borra todo y pega el contenido completo de
   [`lambda-console.mjs`](./lambda-console.mjs).
3. Pulsa **Deploy**.
4. Verifica que el **Handler** sea `index.handler`
   (Runtime settings → Edit → Handler).

## 3. Variable de entorno

1. **Configuration → Environment variables → Edit**.
2. Añade:
   - `TABLE_NAME` = `LecturaSensor`
3. Guarda.

La región la toma automáticamente de Lambda (`AWS_REGION`), que debe ser `us-west-1`.
Si tu tabla está en otra región, crea la Lambda en esa misma región.

## 4. Dar permiso de lectura a la Lambda

1. **Configuration → Permissions**.
2. Pulsa el enlace del **Execution role** (abre IAM).
3. **Add permissions → Create inline policy**.
4. Pestaña **JSON** y pega esto, cambiando `TU_CUENTA` por tu número de cuenta
   (lo ves arriba a la derecha en la consola):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dynamodb:Scan",
      "Resource": "arn:aws:dynamodb:us-west-1:TU_CUENTA:table/LecturaSensor"
    }
  ]
}
```

   También puedes copiar el ARN exacto desde **DynamoDB → Tables → LecturaSensor →
   Additional info → ARN**.
5. Ponle nombre, por ejemplo `LecturaSensorScan`, y guarda.

## 5. Probar la función

1. Pestaña **Test**.
2. **Create new event**, nombre `vacio`, y deja el JSON como `{}`.
3. Pulsa **Test**.
4. Debes ver `statusCode: 200` y un `body` con `rows`, `total` y tus lecturas.

Si ves `statusCode: 500`, el `body` trae el motivo (por ejemplo, permiso o tabla).
Si `total` es 0 pero tu tabla tiene ítems, revisa que la Lambda esté en `us-west-1` y
que `TABLE_NAME` sea exactamente `LecturaSensor`.

## 6. Crear la Function URL

1. **Configuration → Function URL → Create function URL**.
2. **Auth type**: `NONE` (lectura pública; no permite escribir).
3. Marca **Configure cross-origin resource sharing (CORS)**:
   - **Allow origin**: `https://TU-USUARIO.github.io`
     (o `*` mientras pruebas)
   - **Allow methods**: `GET`
   - **Allow headers**: `*`
4. Guarda y copia la **Function URL**. Será algo como:

```
https://abcde12345.lambda-url.us-west-1.on.aws/
```

5. Pruébala en el navegador añadiendo `/readings`:

```
https://abcde12345.lambda-url.us-west-1.on.aws/readings
```

Debe devolver el JSON con tus lecturas. Esa es la URL que usará el dashboard.

## 7. Conectar el dashboard

Edita `dashboard/config.js`:

```js
window.DASHBOARD_CONFIG = {
  apiUrl: "https://abcde12345.lambda-url.us-west-1.on.aws",
  pollMs: 3000,
};
```

Haz commit y push:

```powershell
git add dashboard/config.js
git commit -m "Dashboard en vivo con Lambda Function URL"
git push
```

GitHub Actions vuelve a desplegar Pages. Abre la página publicada: el punto debe estar
verde y decir **En vivo**. Cada 3 segundos consulta la Function URL, así que los ítems
nuevos que crees en DynamoDB aparecen solos.

## 8. Seguridad y costos

- La URL es **pública de solo lectura**. Cualquiera que la tenga puede leer la tabla.
  Restringe CORS a tu dominio de GitHub Pages y no añadas permisos de escritura.
- Para desactivarla: **Configuration → Function URL → Delete**.
- Lambda gratis: 1 millón de invocaciones/mes. Con polling cada 3 s y una pestaña
  abierta son ~28.800 invocaciones/día; entra en la capa gratuita.
- DynamoDB `Scan` se cobra por RCU. Para miles de ítems es barato; si la tabla crece
  mucho, crea un GSI por `fecha` y cambia `Scan` por `Query`.

## Alternativa con SAM (si prefieres CLI)

El proyecto ya incluye `infra/api/template.yaml`:

```powershell
sam build
sam deploy --guided
```

Pon `AllowedOrigin` con tu dominio de Pages y copia el `ApiUrl` que imprime al final en
`dashboard/config.js`.
