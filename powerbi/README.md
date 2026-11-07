# Power BI con los datos del sensor

Guía para principiantes. Power BI Desktop es gratis y funciona en Windows.

> **Importante:** Power BI no se conecta a DynamoDB directamente y no actualiza cada
> segundo. Para tiempo real usa el dashboard web (`dashboard/index.html`). Power BI
> sirve para analizar y hacer reportes; actualizas con el botón **Actualizar** o con
> una programación.

## 1. Instalar Power BI Desktop

1. Entra a <https://powerbi.microsoft.com/desktop/>.
2. Pulsa **Descargar gratis** (o búscalo en Microsoft Store como **Power BI Desktop**).
3. Instálalo y ábrelo. Para un reporte local no necesitas cuenta; si te pide iniciar
   sesión, puedes omitirlo o usar tu cuenta de Microsoft.

## 2. Conectar los datos

Tienes **tres fuentes** posibles. Cambia solo la URL en la consulta M:

| Fuente | URL |
|---|---|
| GitHub Pages (con datos reales si configuras los secrets) | `https://figueroa1127.github.io/sensor-dashboard/data.json` |
| Lambda Function URL (tiempo real) | `https://TU-URL.lambda-url.us-west-1.on.aws/readings` |
| Localhost (con `npm run serve`) | `http://localhost:4321/data.json` |

Para probar en tu PC con los datos del ejemplo, usa `http://localhost:4321/data.json`
(ya está el servidor estático corriendo en el proyecto; si no, `npm run serve`).

Pasos:

1. En Power BI: **Inicio → Obtener datos → Consulta en blanco**.
2. Pulsa **Editor avanzado**.
3. Borra lo que haya y pega el contenido de [`consulta-data-json.pq`](./consulta-data-json.pq)
   (cambia la URL si quieres localhost o la Lambda).
4. Pulsa **Listo**.
5. Verás una tabla con las columnas: `sensor`, `fecha`, `frontal`, `izquierda`,
   `derecha`, `obstaculo`, `direccion`, `girando`.
6. Pulsa **Cerrar y aplicar**.

> Ahora mismo esa URL tiene el **ítem de ejemplo** (1 fila). Cuando configures los
> secrets de AWS en GitHub o la Lambda, tendrá tus datos reales.

### Si ya tienes la Lambda en vivo

Usa [`consulta-lambda.pq`](./consulta-lambda.pq) y cambia `TU-URL` por tu Function URL.
Ventaja: los datos son los mismos que ve el dashboard web.

## 3. Crear el reporte

En la vista **Informe**:

| Visual | Configuración |
|---|---|
| **Tarjeta** | Arrastra `sensor` y elige **Recuento**. Muestra cuántas lecturas hay. |
| **Tarjeta** | Arrastra `frontal` y elige **Promedio**. |
| **Gráfico de líneas** | Eje X: `fecha`. Valores: `frontal`, `izquierda`, `derecha`. |
| **Gráfico de columnas** | Eje X: `obstaculo`. Valor: recuento de `sensor`. |
| **Tabla** | `sensor`, `fecha`, `frontal`, `izquierda`, `derecha`, `direccion`, `obstaculo`. |
| **Segmentación de datos** | Arrastra `sensor` para filtrar por sensor. |

Consejos:

- En el gráfico de líneas, quita la agregación (no uses "Suma"); usa **No resumir**
  para que cada lectura sea un punto.
- Formatea `fecha` como fecha/hora en **Herramientas de columna**.
- Puedes cambiar el título del reporte y guardarlo como `.pbix`.

## 4. Actualizar los datos

- **Manual:** pestaña **Inicio → Actualizar**. Vuelve a leer el JSON.
- **Automático:** publica el reporte en **Power BI Service** (requiere cuenta/licencia)
  y configura **Actualización programada**. El mínimo habitual es cada 30 minutos;
  no es tiempo real.
- Power BI Desktop no puede refrescar solo cada 3 segundos para una fuente Web
  importada.

## 5. Limitaciones frente al dashboard web

| | Dashboard web | Power BI |
|---|---|---|
| Actualización cada 3 s | **Sí** | No |
| Funciona sin instalar nada | **Sí** | No (instalar Desktop) |
| Reportes y análisis | Básico | **Mejor** |
| Compartir por enlace | **Sí** (GitHub Pages) | Requiere licencia |
| Conectar a DynamoDB directo | No | No |

## 6. Si algo falla

- **Error de credenciales/Web:** el JSON es público; en Power BI elige **Anónimo**
  si te pide autenticación.
- **No aparecen filas:** revisa que la URL abra en el navegador y que `rows` tenga
  datos. Si el dashboard muestra un aviso amarillo, el JSON es de ejemplo/importado.
- **Columnas vacías:** los nombres deben coincidir con los del JSON. El mapeo está en
  `infra/api/normalize.mjs`.
