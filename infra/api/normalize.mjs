/**
 * Normalización compartida de los ítems de LecturaSensor.
 * La usan la Lambda (infra/api/index.mjs), el fetch de GitHub Actions
 * (scripts/fetch.mjs) y el servidor local (scripts/dev-server.mjs).
 */

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    return ["true", "1", "si", "sí", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return null;
}

export function toIso(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value; // segundos o milisegundos
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const text = String(value).trim().replace(" ", "T");
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * El idSensor real es del tipo "sensor-01_1794037530" (sensor + epoch).
 * Devuelve el nombre base y, si existe, la fecha que aporta el sufijo.
 */
export function parseSensorId(raw) {
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

export function normalizeItem(item) {
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
