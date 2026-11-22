/**
 * MNU411 v2.0 — Cliente API sincronizado con api/main.py (FastAPI)
 */
class MNU411ApiClient {
  constructor() {
    this.endpoints = {
      M0: "/api/calc/scalar",
      M1: "/api/m1/errores",
      M2: "/api/m2/no-lineales",
      M3: "/api/m3/sistemas",
      M5: "/api/m5/interpolacion",
      M6: "/api/m6/proyecciones",
      PDF: "/api/m4/pdf",
    };
  }

  async solveModule(moduleCode, payload) {
    const endpoint = this.endpoints[moduleCode];
    if (!endpoint) {
      throw new Error(`Módulo no soportado: ${moduleCode}`);
    }

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
          ? data.detail.map((e) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(" | ")
          : `Error HTTP ${resp.status} en ${endpoint}`;
      throw new Error(detail);
    }

    if (data.exito === false) {
      throw new Error(data.mensaje || "No se pudo completar el cálculo.");
    }

    return data;
  }

  async downloadPdfReport(pdfPayload) {
    const resp = await fetch(this.endpoints.PDF, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pdfPayload),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.detail || "No se pudo generar el reporte PDF.");
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (pdfPayload.titulo_metodo || "Reporte")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 32);
    a.download = `MNU411_${safeName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

window.MNU411 = window.MNU411 || {};
window.MNU411.api = new MNU411ApiClient();
