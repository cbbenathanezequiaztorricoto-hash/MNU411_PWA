/**
 * MNU411 v2.0 — Controlador de Teclado Científico Casio (KaTeX + SHIFT / ALPHA)
 * Todas las etiquetas de teclas se renderizan con tipografía matemática real.
 */
class ScientificKeypadController {
  constructor(displayController) {
    this.display = displayController;
    this.shiftActive = false;
    this.alphaActive = false;
    this.activeModule = "M0";

    this.moduleMeta = {
      M0: { code: "M0 · CALC", title: "Calculadora Científica Estándar", prompt: "Expr:", vars: false },
      M1: { code: "M1 · ERROR", title: "Módulo 1: Análisis de Errores", prompt: "f(x):", vars: true },
      M2: { code: "M2 · RAÍZ", title: "Módulo 2: Ecuaciones No Lineales", prompt: "f(x)=0:", vars: false },
      M3: { code: "M3 · SIST", title: "Módulo 3: Sistemas Lineales A·x = b", prompt: "Sist:", vars: false },
      M5: { code: "M5 · INTERP", title: "Módulo 5: Interpolación Funcional", prompt: "Puntos:", vars: false },
      M6: { code: "M6 · PROY", title: "Módulo 6: Proyecciones y Series de Tiempo", prompt: "Ajuste:", vars: false },
    };

    this._renderKatexLabels();
    this._bindEvents();
    this._bindWorkstationTabs();
  }

  /**
   * Renderiza con KaTeX cada botón y cada sub-leyenda SHIFT / ALPHA
   * para que nunca aparezcan símbolos de código (^, *, sqrt).
   */
  _renderKatexLabels() {
    const renderAll = () => {
      if (!window.katex) {
        setTimeout(renderAll, 60);
        return;
      }

      document.querySelectorAll("[data-katex]").forEach((el) => {
        const tex = el.getAttribute("data-katex");
        if (!tex) return;
        try {
          window.katex.render(tex, el, {
            throwOnError: false,
            displayMode: false,
          });
        } catch (_) {
          el.textContent = tex;
        }
      });
    };

    renderAll();
  }

  _bindEvents() {
    // 1. Modificadores SHIFT y ALPHA
    document.getElementById("key-shift")?.addEventListener("click", () => {
      this.setShift(!this.shiftActive);
    });

    document.getElementById("key-alpha")?.addEventListener("click", () => {
      this.setAlpha(!this.alphaActive);
    });

    // 2. Cruceta REPLAY (◄ ▲ ▼ ►)
    document.querySelectorAll(".replay-btn[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.display.navigate(btn.getAttribute("data-nav"));
      });
    });

    // 3. Teclas de inserción matemática (científicas, números, operadores y chips de variables)
    document.querySelectorAll("[data-latex]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let snippet = btn.getAttribute("data-latex");

        if (this.shiftActive && btn.hasAttribute("data-shift-latex")) {
          snippet = btn.getAttribute("data-shift-latex");
        } else if (this.alphaActive && btn.hasAttribute("data-alpha-latex")) {
          snippet = btn.getAttribute("data-alpha-latex");
        }

        // Apagar modificadores tras una pulsación (comportamiento estándar Casio)
        if (this.shiftActive) this.setShift(false);
        if (this.alphaActive) this.setAlpha(false);

        this.display.insertLatex(snippet);
      });
    });

    // 4. Teclas de edición y control (DEL, AC, MODE, TABLA, GGB/PDF, =)
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        if (action === "del") {
          this.display.deleteBackward();
        } else if (action === "ac") {
          this.setShift(false);
          this.setAlpha(false);
          this.display.clearAll();
        } else if (action === "mode") {
          this.cycleModule();
        } else if (action === "toggle-table") {
          this.openWorkstation("params", true);
        } else if (action === "open-panel") {
          this.openWorkstation("geogebra", false);
        } else if (action === "calculate") {
          this.handleCalculate();
        }
      });
    });

    // 5. Tira superior de módulos (M0..M6) y botón de estado en LCD
    document.querySelectorAll(".mod-tab[data-mod]").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.selectModule(tab.getAttribute("data-mod"));
      });
    });

    document.getElementById("btn-status-mode")?.addEventListener("click", () => {
      this.cycleModule();
    });

    // 6. Botón cerrar panel en móvil
    document.getElementById("btn-close-panel")?.addEventListener("click", () => {
      document.getElementById("workstation-panel")?.classList.remove("mobile-open");
    });
  }

  _bindWorkstationTabs() {
    document.querySelectorAll(".ws-tab[data-ws-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-ws-tab");
        this.switchWorkstationTab(target);
      });
    });
  }

  setShift(active) {
    this.shiftActive = active;
    if (active) this.setAlpha(false);

    document.getElementById("key-shift")?.classList.toggle("is-on", active);
    document.getElementById("flag-shift")?.classList.toggle("active", active);

    document.querySelectorAll("[data-shift-latex]").forEach((el) => {
      el.classList.toggle("highlight-shift", active);
    });
  }

  setAlpha(active) {
    this.alphaActive = active;
    if (active) this.setShift(false);

    document.getElementById("key-alpha")?.classList.toggle("is-on", active);
    document.getElementById("flag-alpha")?.classList.toggle("active", active);

    document.querySelectorAll("[data-alpha-latex]").forEach((el) => {
      el.classList.toggle("highlight-alpha", active);
    });
  }

  cycleModule() {
    const order = ["M0", "M1", "M2", "M3", "M5", "M6"];
    const nextIdx = (order.indexOf(this.activeModule) + 1) % order.length;
    this.selectModule(order[nextIdx]);
  }

  selectModule(modCode) {
    if (!this.moduleMeta[modCode]) return;
    this.activeModule = modCode;
    const meta = this.moduleMeta[modCode];

    // Actualizar indicadores visuales en LCD y tira superior
    const pill = document.getElementById("btn-status-mode");
    if (pill) pill.textContent = meta.code;

    document.querySelectorAll(".mod-tab").forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-mod") === modCode);
    });

    const badge = document.getElementById("ws-module-badge");
    const title = document.getElementById("ws-module-title");
    if (badge) badge.textContent = modCode;
    if (title) title.textContent = meta.title;

    this.display.setPrompt(meta.prompt);
    this.display.toggleVarQuickBar(meta.vars);
    this.display.setMessage(`Modo activo: ${meta.code}`);

    // En móvil, abrir panel de configuración si se elige un módulo numérico (M1–M6)
    if (modCode !== "M0" && window.innerWidth < 768) {
      this.openWorkstation("params", ["M3", "M5", "M6"].includes(modCode));
    }

    // Notificar a Pieza 3 (modules_ui.js)
    window.dispatchEvent(
      new CustomEvent("mnu411:module-changed", { detail: { module: modCode } })
    );
  }

  switchWorkstationTab(tabName) {
    document.querySelectorAll(".ws-tab").forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-ws-tab") === tabName);
    });

    document.querySelectorAll(".ws-view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`ws-view-${tabName}`)?.classList.add("active");
  }

  openWorkstation(tabName = "params", focusMatrixGrid = false) {
    const panel = document.getElementById("workstation-panel");
    if (panel) panel.classList.add("mobile-open");
    this.switchWorkstationTab(tabName);

    if (focusMatrixGrid) {
      const grid = document.getElementById("matrix-grid-container");
      if (grid) {
        grid.classList.remove("hidden");
        grid.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  /**
   * Al pulsar '=' (CALC):
   * - En M0: evalúa la expresión LaTeX contra el backend FastAPI (/api/calc/scalar).
   * - En M1–M6: despacha el evento 'mnu411:calculate' hacia Pieza 3.
   */
  async handleCalculate() {
    const latex = this.display.getLatex().trim();

    if (this.activeModule !== "M0") {
      window.dispatchEvent(
        new CustomEvent("mnu411:calculate", {
          detail: { module: this.activeModule, latex, ans: this.display.getAns() },
        })
      );
      return;
    }

    if (!latex) {
      this.display.setMessage("Ingrese una expresión", true);
      return;
    }

    this.display.setMessage("Calculando...");
    try {
      const resp = await fetch("/api/calc/scalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex, ans: this.display.getAns() }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        this.display.setMessage(data.detail || "Expresión incompleta", true);
        return;
      }

      this.display.setResult(data.valor, true);
      this.display.setMessage("OK");
    } catch (_) {
      this.display.setMessage("Inicie el servidor API (uvicorn)", true);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Esperar un ciclo para asegurar que window.MNU411.display ya fue instanciado
  setTimeout(() => {
    window.MNU411.keypad = new ScientificKeypadController(window.MNU411.display);
  }, 0);
});
