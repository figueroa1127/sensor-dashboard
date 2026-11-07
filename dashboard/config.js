// Configuración del dashboard.
// - apiUrl vacío  -> usa data.json (GitHub Pages, se actualiza cada 10 min).
// - apiUrl con URL -> tiempo real: consulta DynamoDB vía API Gateway cada pollMs.
//   Ejemplo: "https://abc123.execute-api.us-west-1.amazonaws.com"
window.DASHBOARD_CONFIG = {
  apiUrl: "",
  pollMs: 3000,
};
