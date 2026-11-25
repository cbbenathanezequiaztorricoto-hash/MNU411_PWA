/**
 * MNU411 v2.0 — Integración Nativa de GeoGebra Graphing Calculator
 * Usa directamente las expresiones traducidas por SymPy (geogebra_str / funcion_geogebra).
 */
class GeoGebraNativeController {
  constructor() {
    this.containerId = "geogebra-container";
    this.applet = null;
    this.isReady = false;
    this.pendingTask = null;

    this._bindTabActivation();
  }

  _bindTabActivation() {
    document.querySelectorAll('.ws-tab[data-ws-tab="geogebra"]').forEach((tab) => {
      tab.addEventListener("click", () => {
        this.ensureInitialized();
        setTimeout(() => this.resizeToContainer(), 50);
      });
    });

    document.getElementById("key-ggb")?.addEventListener("click", () => {
      this.ensureInitialized();
      setTimeout(() => this.resizeToContainer(), 50);
    });

    window.addEventListener("resize", () => this.resizeToContainer());
  }

  _getTargetWidth(container) {
    const bodyEl = container.closest(".ws-body");
    const rawWidth = container.clientWidth || bodyEl?.clientWidth || window.innerWidth - 40;
    return Math.max(320, Math.min(rawWidth - 24, 860));
  }

  resizeToContainer() {
    if (!this.applet || !this.isReady) return;
    const container = document.getElementById(this.containerId);
    if (!container) return;
    const width = this._getTargetWidth(container);
    if (typeof this.applet.setSize === "function") {
      this.applet.setSize(width, 430);
    }
  }

  ensureInitialized() {
    if (this.applet || !window.GGBApplet) return;

    const container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = "";

    const width = this._getTargetWidth(container);
    const params = {
      appName: "graphing",
      perspective: "G",
      width,
      height: 430,
      showToolBar: true,
      showAlgebraInput: false,
      showMenuBar: false,
      enableRightClick: false,
      enableShiftDragZoom: true,
      showResetIcon: true,
      language: "es",
      appletOnLoad: (api) => {
        this.applet = api;
        this.isReady = true;
        this.resizeToContainer();
        if (this.pendingTask) {
          const task = this.pendingTask;
          this.pendingTask = null;
          this.plotModuleResult(task.moduleCode, task.subtema, task.payload, task.result);
        }
      },
    };

    const ggbApp = new window.GGBApplet(params, true);
    ggbApp.inject(this.containerId);
  }
  plotModuleResult(moduleCode, subtema, payload, result) {
    this.ensureInitialized();

    if (!this.isReady || !this.applet) {
      this.pendingTask = { moduleCode, subtema, payload, result };
      return;
    }

    const ggb = this.applet;
    ggb.reset();

    try {
      // MÓDULO 2: ECUACIONES NO LINEALES
      if (moduleCode === "M2") {
        const fx = result.geogebra_str;
        if (fx) {
          ggb.evalCommand(`f(x) = ${fx}`);
          ggb.setColor("f", 2, 132, 199);
          ggb.setLineThickness("f", 4);
        }

        const root = Number(result.raiz);
        if (subtema === "punto_fijo") {
          ggb.evalCommand("id(x) = x");
          ggb.setColor("id", 100, 116, 139);
          if (Number.isFinite(root)) {
            ggb.evalCommand(`Raiz = (${root}, ${root})`);
            ggb.setColor("Raiz", 220, 38, 38);
            ggb.setPointSize("Raiz", 6);
            ggb.setCoordSystem(root - 5, root + 5, root - 5, root + 5);
          }
        } else if (Number.isFinite(root)) {
          ggb.evalCommand(`Raiz = (${root}, 0)`);
          ggb.setColor("Raiz", 220, 38, 38);
          ggb.setPointSize("Raiz", 6);
          ggb.setCoordSystem(root - 5, root + 5, -5, 5);
        }
      }

      // MÓDULO 1: SERIE DE TAYLOR
      else if (moduleCode === "M1" && subtema === "taylor") {
        if (result.geogebra_str) {
          ggb.evalCommand(`f(x) = ${result.geogebra_str}`);
          ggb.setColor("f", 15, 23, 42);
          ggb.setLineThickness("f", 3);
        }
      }

      // MÓDULO 5 Y MÓDULO 6: INTERPOLACIÓN, REGRESIÓN Y SERIES DE TIEMPO
      else if (moduleCode === "M5" || moduleCode === "M6") {
        const xs = result.t || payload.x_vals || [];
        const ys = result.y || payload.y_vals || [];

        xs.forEach((xVal, idx) => {
          const yVal = ys[idx];
          if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
            const pName = `P_${idx + 1}`;
            ggb.evalCommand(`${pName} = (${xVal}, ${yVal})`);
            ggb.setColor(pName, 2, 132, 199);
            ggb.setPointSize(pName, 5);
          }
        });

        const curveExpr =
          result.polinomio_geogebra ||
          result.funcion_geogebra ||
          result.mejor_modelo?.funcion_geogebra;

        if (curveExpr) {
          ggb.evalCommand(`Curva(x) = ${curveExpr}`);
          ggb.setColor("Curva", 225, 29, 72);
          ggb.setLineThickness("Curva", 4);
        }

        // Curvas adicionales (ej. órdenes secundarios P_3 vs P_4)
        if (Array.isArray(result.curvas_extra)) {
          const palette = [
            [124, 58, 237],
            [234, 88, 12],
            [13, 148, 136],
          ];
          result.curvas_extra.forEach((extra, idx) => {
            if (extra && extra.geogebra) {
              const fnName = (extra.nombre || `Extra_${idx + 1}`).replace(/[^a-zA-Z0-9_]/g, "_");
              ggb.evalCommand(`${fnName}(x) = ${extra.geogebra}`);
              const [r, g, b] = palette[idx % palette.length];
              ggb.setColor(fnName, r, g, b);
              ggb.setLineThickness(fnName, 3);
            }
          });
        }

        const extraEvalX = [];
        const extraEvalY = [];

        if (Array.isArray(result.resultados_puntos) && result.resultados_puntos.length > 0) {
          result.resultados_puntos.forEach((rp, idx) => {
            const px = Number(rp.x_p);
            const py = Number(rp.valor_principal);
            if (Number.isFinite(px) && Number.isFinite(py)) {
              const ptLabel = result.resultados_puntos.length === 1 ? "Estimado" : `Est_${idx + 1}`;
              ggb.evalCommand(`${ptLabel} = (${px}, ${py})`);
              ggb.setColor(ptLabel, 22, 163, 74);
              ggb.setPointSize(ptLabel, 6);
              extraEvalX.push(px);
              extraEvalY.push(py);
            }
          });
        } else {
          const xEval = Number(result.x_eval ?? payload.x_eval);
          const yEval = Number(result.resultado ?? result.mejor_modelo?.proyeccion);
          if (Number.isFinite(xEval) && Number.isFinite(yEval)) {
            ggb.evalCommand(`Estimado = (${xEval}, ${yEval})`);
            ggb.setColor("Estimado", 22, 163, 74);
            ggb.setPointSize("Estimado", 6);
            extraEvalX.push(xEval);
            extraEvalY.push(yEval);
          }
        }

        if (xs.length > 0 && ys.length > 0) {
          const allX = [...xs, ...extraEvalX];
          const allY = [...ys, ...extraEvalY];
          const minX = Math.min(...allX) - 2;
          const maxX = Math.max(...allX) + 2;
          const minY = Math.min(...allY) - 2;
          const maxY = Math.max(...allY) + 2;
          ggb.setCoordSystem(minX, maxX, minY, maxY);
        }
      }

      // MÓDULO 3: SISTEMAS LINEALES 2x2
      else if (moduleCode === "M3" && Array.isArray(payload.A) && payload.A.length === 2) {
        const A = payload.A;
        const b = payload.b || [0, 0];
        ggb.evalCommand(`Ec1: ${A[0][0]}*x + ${A[0][1]}*y = ${b[0]}`);
        ggb.evalCommand(`Ec2: ${A[1][0]}*x + ${A[1][1]}*y = ${b[1]}`);
        ggb.setColor("Ec1", 2, 132, 199);
        ggb.setColor("Ec2", 225, 29, 72);

        const sol = result.solucion;
        if (Array.isArray(sol) && sol.length >= 2) {
          ggb.evalCommand(`Sol = (${sol[0]}, ${sol[1]})`);
          ggb.setColor("Sol", 22, 163, 74);
          ggb.setPointSize("Sol", 6);
        }
      }
    } catch (err) {
      console.warn("Aviso GeoGebra:", err);
    }
  }
}

window.MNU411 = window.MNU411 || {};
window.addEventListener("DOMContentLoaded", () => {
  window.MNU411.geogebra = new GeoGebraNativeController();
});
