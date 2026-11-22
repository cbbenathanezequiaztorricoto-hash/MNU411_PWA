/**
 * MNU411 v2.0 — Controlador de Subtemas, Cuadrículas Táctiles y Resultados (M1–M6)
 * Alineado exactamente con api/schemas.py y api/main.py
 */
class ModulesUIController {
  constructor() {
    this.paramsContainer = document.getElementById("module-params-container");
    this.gridContainer = document.getElementById("matrix-grid-container");
    this.resultsContainer = document.getElementById("results-container");
    this.pdfBtn = document.getElementById("btn-export-pdf");

    this.currentModule = "M0";
    this.currentSubtema = "";
    this.lastPdfPayload = null;

    this.catalog = {
      M1: {
        subtemas: [
          { id: "absoluto", label: "Error Absoluto" },
          { id: "relativo", label: "Error Relativo" },
          { id: "porcentual", label: "Error Porcentual" },
          { id: "redondeo", label: "Cota Redondeo" },
          { id: "taylor", label: "Serie de Taylor" },
          { id: "propagacion", label: "Propagación f(x₁,x₂)" },
        ],
      },
      M2: {
        subtemas: [
          { id: "biseccion", label: "Bisección" },
          { id: "regula_falsi", label: "Regula Falsi" },
          { id: "secante", label: "Secante" },
          { id: "newton_1", label: "Newton 1er Orden" },
          { id: "newton_2", label: "Newton 2do Orden" },
          { id: "punto_fijo", label: "Punto Fijo" },
        ],
      },
      M3: {
        subtemas: [
          { id: "gauss", label: "Eliminación Gaussiana" },
          { id: "gauss_jordan", label: "Gauss-Jordan" },
          { id: "jacobi", label: "Jacobi" },
          { id: "gauss_seidel", label: "Gauss-Seidel" },
        ],
      },
      M5: {
        subtemas: [
          { id: "newton_adelante", label: "Newton Adelante" },
          { id: "newton_atras", label: "Newton Atrás" },
          { id: "lagrange", label: "Lagrange" },
          { id: "diferencias_divididas", label: "Dif. Divididas" },
          { id: "lineal", label: "Lineal / Tramos" },
        ],
      },
      M6: {
        subtemas: [
          { id: "lineal", label: "Regresión Lineal" },
          { id: "polinomial", label: "Polinomial" },
          { id: "exponencial", label: "Exponencial" },
          { id: "potencial", label: "Potencial" },
          { id: "logaritmica", label: "Logarítmica" },
          { id: "comparar", label: "Comparador R²" },
          { id: "series_tiempo", label: "Series de Tiempo" },
        ],
      },
    };

    this._bindGlobalEvents();
  }

  _bindGlobalEvents() {
    window.addEventListener("mnu411:module-changed", (ev) => {
      const mod = ev.detail?.module || "M0";
      this.renderModule(mod);
    });

    window.addEventListener("mnu411:calculate", (ev) => {
      const mod = ev.detail?.module || this.currentModule;
      if (mod !== "M0") {
        this.executeActiveMethod();
      }
    });

    this.pdfBtn?.addEventListener("click", async () => {
      if (!this.lastPdfPayload) return;
      try {
        this.pdfBtn.disabled = true;
        this.pdfBtn.textContent = "...";
        await window.MNU411.api.downloadPdfReport(this.lastPdfPayload);
      } catch (err) {
        window.MNU411.display?.setMessage(err.message, true);
      } finally {
        this.pdfBtn.disabled = false;
        this.pdfBtn.textContent = "PDF";
      }
    });
  }

  renderModule(moduleCode) {
    this.currentModule = moduleCode;

    if (moduleCode === "M0") {
      this.gridContainer.classList.add("hidden");
      this.gridContainer.innerHTML = "";
      this.paramsContainer.innerHTML = `
        <p class="ws-placeholder-text">
          Escribe cualquier expresión matemática usando las teclas de la calculadora (fracciones, raíces, potencias, logaritmos o funciones trigonométricas) y presiona <strong>=</strong>.
        </p>
        <p class="ws-placeholder-text">
          Para resolver ecuaciones no lineales, sistemas lineales, interpolación o proyecciones, selecciona un módulo en <strong>MODE</strong> o en la barra superior (<strong>M1</strong> a <strong>M6</strong>).
        </p>
      `;
      return;
    }

    const modConfig = this.catalog[moduleCode];
    if (!modConfig) return;

    this.currentSubtema = modConfig.subtemas[0].id;
    this._renderSubtemaBarAndForm();
  }

  _renderSubtemaBarAndForm() {
    const modConfig = this.catalog[this.currentModule];
    const pillsHtml = modConfig.subtemas
      .map(
        (sub) => `
        <button
          type="button"
          class="subtema-pill ${sub.id === this.currentSubtema ? "active" : ""}"
          data-subtema="${sub.id}"
        >
          ${sub.label}
        </button>`
      )
      .join("");

    this.paramsContainer.innerHTML = `
      <div class="subtema-section">
        <span class="field-section-label">1. Selecciona el Subtema / Método:</span>
        <div class="subtema-bar">${pillsHtml}</div>
      </div>
      <div id="dynamic-form-fields" class="dynamic-form-fields"></div>
      <div class="form-footer-actions">
        <button type="button" id="btn-load-example" class="btn-secondary-sm">Cargar ejemplo</button>
        <button type="button" id="btn-run-method" class="btn-primary-run">Calcular Método ( = )</button>
      </div>
    `;

    this.paramsContainer.querySelectorAll(".subtema-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.currentSubtema = btn.getAttribute("data-subtema");
        this._renderSubtemaBarAndForm();
      });
    });

    document.getElementById("btn-load-example")?.addEventListener("click", () => {
      this._loadPresetExample();
    });

    document.getElementById("btn-run-method")?.addEventListener("click", () => {
      this.executeActiveMethod();
    });

    this._buildFieldsForSubtema();
  }

  _numInputHtml(id, label, defaultVal, step = "any") {
    return `
      <div class="param-field">
        <label for="${id}">${label}</label>
        <div class="param-input-row">
          <input type="number" id="${id}" value="${defaultVal}" step="${step}" />
          <button type="button" class="btn-paste-ans" data-target="${id}" title="Pegar Ans de la calculadora">Ans</button>
        </div>
      </div>
    `;
  }

  _buildFieldsForSubtema() {
    const formEl = document.getElementById("dynamic-form-fields");
    this.gridContainer.classList.add("hidden");
    this.gridContainer.innerHTML = "";

    const mod = this.currentModule;
    const sub = this.currentSubtema;

    // -------------------- MÓDULO 1: ANÁLISIS DE ERRORES --------------------
    if (mod === "M1") {
      if (["absoluto", "relativo", "porcentual"].includes(sub)) {
        window.MNU411.display?.setPrompt("M1:");
        formEl.innerHTML = `
          <p class="helper-hint">Introduce el valor real <strong>x</strong> y el aproximado <strong>x̄</strong> (o pégalos desde <strong>Ans</strong>):</p>
          <div class="params-grid-2">
            ${this._numInputHtml("p-x", "Valor Real (x)", "1.206539823")}
            ${this._numInputHtml("p-x-bar", "Valor Aproximado (x̄)", "1.206433")}
          </div>
        `;
      } else if (sub === "redondeo") {
        window.MNU411.display?.setPrompt("Red:");
        formEl.innerHTML = `
          <p class="helper-hint">Calcula la cota máxima <strong>0.5 × 10⁻ᵈ</strong> y verifica si |x - x̄| cumple:</p>
          <div class="params-grid-3">
            ${this._numInputHtml("p-d", "Cifras significativas (d)", "4", "1")}
            ${this._numInputHtml("p-x", "Valor Real (x)", "3.14159265")}
            ${this._numInputHtml("p-x-bar", "Valor Aproximado (x̄)", "3.1416")}
          </div>
        `;
      } else if (sub === "taylor") {
        window.MNU411.display?.setPrompt("f(x):");
        formEl.innerHTML = `
          <p class="helper-hint">Escribe <strong>f(x)</strong> en la pantalla LCD izquierda (ej. eˣ o sin(x)) y define los parámetros:</p>
          <div class="params-grid-3">
            ${this._numInputHtml("p-x0", "Punto expansión (x₀)", "0")}
            ${this._numInputHtml("p-xeval", "Evaluar en (x)", "0.5")}
            ${this._numInputHtml("p-orden", "Orden / Grado (d)", "3", "1")}
          </div>
        `;
      } else if (sub === "propagacion") {
        window.MNU411.display?.setPrompt("f(x₁,x₂):");
        formEl.innerHTML = `
          <p class="helper-hint">Escribe <strong>f(x₁, x₂, ...)</strong> en la calculadora usando los botones rápidos (x₁, x₂, x₃, x₄):</p>
          <div class="params-grid-2">
            ${this._numInputHtml("p-x1", "Valor x₁", "2.0")}
            ${this._numInputHtml("p-dx1", "Error Δx₁", "0.01")}
            ${this._numInputHtml("p-x2", "Valor x₂", "3.0")}
            ${this._numInputHtml("p-dx2", "Error Δx₂", "0.01")}
            ${this._numInputHtml("p-x3", "Valor x₃ (si se usa)", "1.0")}
            ${this._numInputHtml("p-dx3", "Error Δx₃ (si se usa)", "0.01")}
            ${this._numInputHtml("p-x4", "Valor x₄ (si se usa)", "1.0")}
            ${this._numInputHtml("p-dx4", "Error Δx₄ (si se usa)", "0.01")}
          </div>
        `;
      }
    }

    // -------------------- MÓDULO 2: ECUACIONES NO LINEALES -----------------
    else if (mod === "M2") {
      window.MNU411.display?.setPrompt(sub === "punto_fijo" ? "g(x):" : "f(x)=0:");
      const commonStop = `
        ${this._numInputHtml("p-tol", "Tolerancia (E)", "0.0001")}
        ${this._numInputHtml("p-iter", "Iteraciones máx.", "30", "1")}
      `;

      if (sub === "biseccion" || sub === "regula_falsi") {
        formEl.innerHTML = `
          <p class="helper-hint">Escribe <strong>f(x)</strong> en la calculadora izquierda e indica el intervalo <strong>[a, b]</strong>:</p>
          <div class="params-grid-2">
            ${this._numInputHtml("p-a", "Extremo inferior (a)", "1")}
            ${this._numInputHtml("p-b", "Extremo superior (b)", "2")}
            ${commonStop}
          </div>
        `;
      } else if (sub === "newton_1" || sub === "newton_2" || sub === "punto_fijo") {
        const fnLabel =
          sub === "punto_fijo"
            ? "g(x) tal que x = g(x)"
            : "f(x) (las derivadas se calculan simbólicamente)";
        formEl.innerHTML = `
          <p class="helper-hint">Escribe <strong>${fnLabel}</strong> en la calculadora izquierda:</p>
          <div class="params-grid-3">
            ${this._numInputHtml("p-x0", "Valor inicial (x₀)", "1.5")}
            ${commonStop}
          </div>
        `;
      } else if (sub === "secante") {
        formEl.innerHTML = `
          <p class="helper-hint">Escribe <strong>f(x)</strong> en la calculadora izquierda y dos puntos iniciales:</p>
          <div class="params-grid-2">
            ${this._numInputHtml("p-x0", "Primer punto (x₀)", "1")}
            ${this._numInputHtml("p-x1", "Segundo punto (x₁)", "2")}
            ${commonStop}
          </div>
        `;
      }
    }

    // -------------------- MÓDULO 3: SISTEMAS LINEALES A·x = b --------------
    else if (mod === "M3") {
      window.MNU411.display?.setPrompt("A·x=b:");
      const isIterative = sub === "jacobi" || sub === "gauss_seidel";
      formEl.innerHTML = `
        <div class="params-grid-3">
          <div class="param-field">
            <label for="p-dim-n">Dimensión (n × n)</label>
            <select id="p-dim-n">
              <option value="2">2 × 2</option>
              <option value="3" selected>3 × 3</option>
              <option value="4">4 × 4</option>
              <option value="5">5 × 5</option>
            </select>
          </div>
          ${
            isIterative
              ? `${this._numInputHtml("p-tol", "Tolerancia (E)", "0.0001")}
                 ${this._numInputHtml("p-iter", "Iteraciones máx.", "30", "1")}
                 <div class="param-field">
                   <label for="p-tipo-err">Criterio de Error</label>
                   <select id="p-tipo-err">
                     <option value="residuo" selected>Residuo |b - Ax|</option>
                     <option value="distancia">Distancia ||x_k - x_{k-1}||</option>
                   </select>
                 </div>`
              : ""
          }
        </div>
      `;

      this._renderMatrixGrid(3, isIterative);
      document.getElementById("p-dim-n")?.addEventListener("change", (e) => {
        this._renderMatrixGrid(Number(e.target.value), isIterative);
      });
    }

    // -------------------- MÓDULO 5: INTERPOLACIÓN FUNCIONAL ----------------
    else if (mod === "M5") {
      window.MNU411.display?.setPrompt("Puntos:");
      const note =
        sub === "newton_adelante" || sub === "newton_atras"
          ? `<p class="helper-hint">Nota: Newton hacia adelante/atrás requiere nodos <strong>xᵢ</strong> equidistantes (paso h constante) y <strong>x*</strong> dentro del rango.</p>`
          : `<p class="helper-hint">Soporta nodos con separación variable o constante:</p>`;

      formEl.innerHTML = `
        ${note}
        <div class="params-grid-2">
          ${this._numInputHtml("p-xeval", "Valor x* a interpolar", "2.5")}
          <div class="param-field">
            <label>Nodos (xᵢ, yᵢ)</label>
            <div class="table-row-btns">
              <button type="button" id="btn-add-pt" class="btn-secondary-sm">+ Punto</button>
              <button type="button" id="btn-del-pt" class="btn-secondary-sm">- Punto</button>
            </div>
          </div>
        </div>
      `;

      this._renderPointsTable([
        [1, 2.0],
        [2, 4.5],
        [3, 3.8],
        [4, 7.2],
      ]);

      document.getElementById("btn-add-pt")?.addEventListener("click", () => this._addPointRow());
      document.getElementById("btn-del-pt")?.addEventListener("click", () => this._removePointRow());
    }

    // -------------------- MÓDULO 6: PROYECCIONES Y SERIES ------------------
    else if (mod === "M6") {
      window.MNU411.display?.setPrompt("Proy:");

      if (sub === "series_tiempo") {
        formEl.innerHTML = `
          <div class="params-grid-3">
            <div class="param-field">
              <label for="p-ts-sub">Técnica Serie de Tiempo</label>
              <select id="p-ts-sub">
                <option value="SES">SES (Suavizamiento Exp. Simple)</option>
                <option value="HOLT">HOLT (Tendencia Doble)</option>
                <option value="PMS">PMS (Promedio Móvil Simple)</option>
                <option value="PMP">PMP (Promedio Móvil Ponderado)</option>
                <option value="ESTACIONAL">ESTACIONAL (Multiplicativa)</option>
              </select>
            </div>
            ${this._numInputHtml("p-horizonte", "Horizonte futuro (h)", "3", "1")}
            ${this._numInputHtml("p-alpha", "Nivel α (0 a 1)", "0.35")}
            ${this._numInputHtml("p-beta", "Tendencia β (Holt)", "0.15")}
            ${this._numInputHtml("p-ventana-k", "Ventana k (PMS)", "3", "1")}
            ${this._numInputHtml("p-periodo-l", "Ciclo L (Estacional)", "4", "1")}
            <div class="param-field">
              <label for="p-pesos">Pesos PMP (coma)</label>
              <input type="text" id="p-pesos" value="0.2, 0.3, 0.5" />
            </div>
            <div class="param-field">
              <label>Periodos (t, y_t)</label>
              <div class="table-row-btns">
                <button type="button" id="btn-add-pt" class="btn-secondary-sm">+ Dato</button>
                <button type="button" id="btn-del-pt" class="btn-secondary-sm">- Dato</button>
              </div>
            </div>
          </div>
        `;
      } else {
        const needsGrado = sub === "polinomial" || sub === "comparar";
        formEl.innerHTML = `
          <div class="params-grid-3">
            ${needsGrado ? this._numInputHtml("p-grado", "Grado polinomio (m)", "2", "1") : ""}
            ${this._numInputHtml("p-xeval", "Valor a proyectar (x_eval)", "7")}
            <div class="param-field">
              <label>Datos (xᵢ, yᵢ)</label>
              <div class="table-row-btns">
                <button type="button" id="btn-add-pt" class="btn-secondary-sm">+ Dato</button>
                <button type="button" id="btn-del-pt" class="btn-secondary-sm">- Dato</button>
              </div>
            </div>
          </div>
        `;
      }

      this._renderPointsTable([
        [1, 2.5],
        [2, 4.1],
        [3, 6.8],
        [4, 10.9],
        [5, 17.5],
        [6, 28.2],
      ]);

      document.getElementById("btn-add-pt")?.addEventListener("click", () => this._addPointRow());
      document.getElementById("btn-del-pt")?.addEventListener("click", () => this._removePointRow());
    }

    // Vincular botones "Ans"
    this.paramsContainer.querySelectorAll(".btn-paste-ans").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ans = window.MNU411.display?.getAns();
        if (ans === null || ans === undefined) {
          window.MNU411.display?.setMessage("Memoria Ans vacía", true);
          return;
        }
        const input = document.getElementById(btn.getAttribute("data-target"));
        if (input) input.value = ans;
      });
    });
  }

  _renderMatrixGrid(n, includeX0 = false) {
    this.gridContainer.classList.remove("hidden");
    const defaultA = [
      [10, 1, 2, 0, 0],
      [4, 6, -1, 0, 0],
      [-2, 3, 8, 0, 0],
      [0, 1, -1, 7, 0],
      [0, 0, 1, -1, 6],
    ];
    const defaultB = [3, 9, 51, 12, 18];

    let headerCols = "";
    for (let j = 0; j < n; j++) headerCols += `<th>x<sub>${j + 1}</sub></th>`;
    headerCols += `<th class="col-b">b</th>`;
    if (includeX0) headerCols += `<th class="col-x0">x<sup>(0)</sup></th>`;

    let rowsHtml = "";
    for (let i = 0; i < n; i++) {
      let cells = "";
      for (let j = 0; j < n; j++) {
        const val = defaultA[i]?.[j] ?? (i === j ? 5 : 0);
        cells += `<td><input type="number" step="any" class="mat-a" data-r="${i}" data-c="${j}" value="${val}" /></td>`;
      }
      cells += `<td class="col-b"><input type="number" step="any" class="vec-b" data-r="${i}" value="${defaultB[i] ?? 1}" /></td>`;
      if (includeX0) {
        cells += `<td class="col-x0"><input type="number" step="any" class="vec-x0" data-r="${i}" value="0" /></td>`;
      }
      rowsHtml += `<tr>${cells}</tr>`;
    }

    this.gridContainer.innerHTML = `
      <span class="field-section-label">2. Matriz Aumentada [ A | b ]${includeX0 ? " y Vector Inicial" : ""}:</span>
      <div class="tactile-table-scroll">
        <table class="tactile-grid-table" data-dim="${n}">
          <thead><tr>${headerCols}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  _renderPointsTable(points) {
    this.gridContainer.classList.remove("hidden");
    const rowsHtml = points
      .map(
        ([x, y], idx) => `
        <tr>
          <td class="pt-idx">${idx + 1}</td>
          <td><input type="number" step="any" class="pt-x" value="${x}" /></td>
          <td><input type="number" step="any" class="pt-y" value="${y}" /></td>
        </tr>`
      )
      .join("");

    this.gridContainer.innerHTML = `
      <span class="field-section-label">2. Tabla de Pares Ordenados (xᵢ, yᵢ):</span>
      <div class="tactile-table-scroll">
        <table class="tactile-grid-table" id="points-table">
          <thead>
            <tr>
              <th>i</th>
              <th>xᵢ</th>
              <th>yᵢ</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  _addPointRow() {
    const tbody = document.querySelector("#points-table tbody");
    if (!tbody) return;
    const count = tbody.rows.length + 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="pt-idx">${count}</td>
      <td><input type="number" step="any" class="pt-x" value="${count}" /></td>
      <td><input type="number" step="any" class="pt-y" value="0" /></td>
    `;
    tbody.appendChild(tr);
  }

  _removePointRow() {
    const tbody = document.querySelector("#points-table tbody");
    if (!tbody || tbody.rows.length <= 2) return;
    tbody.deleteRow(tbody.rows.length - 1);
  }

  _loadPresetExample() {
    const mod = this.currentModule;
    const sub = this.currentSubtema;

    if (mod === "M1") {
      if (sub === "taylor") {
        window.MNU411.display?.setLatex("e^{x}");
      } else if (sub === "propagacion") {
        window.MNU411.display?.setLatex("3x_{1}x_{2}^{3}");
      }
    } else if (mod === "M2") {
      if (sub === "punto_fijo") {
        window.MNU411.display?.setLatex("\\frac{x^{2} - e^{x}}{5}");
        const x0El = document.getElementById("p-x0");
        if (x0El) x0El.value = "0";
      } else {
        window.MNU411.display?.setLatex("x^{3} - x - 2");
        const aEl = document.getElementById("p-a");
        const bEl = document.getElementById("p-b");
        const x0El = document.getElementById("p-x0");
        const x1El = document.getElementById("p-x1");
        if (aEl) aEl.value = "1";
        if (bEl) bEl.value = "2";
        if (x0El) x0El.value = "1.5";
        if (x1El) x1El.value = "2";
      }
    }
    window.MNU411.display?.setMessage("Ejemplo cargado. Presiona =");
  }

  /**
   * Construye el JSON exacto que espera cada Pydantic Schema en api/schemas.py
   */
  _collectPayload() {
    const mod = this.currentModule;
    const sub = this.currentSubtema;
    const latex = window.MNU411.display?.getLatex().trim() || "";

    if (mod === "M1") {
      if (["absoluto", "relativo", "porcentual"].includes(sub)) {
        return {
          tipo: sub,
          x: Number(document.getElementById("p-x")?.value),
          x_bar: Number(document.getElementById("p-x-bar")?.value),
        };
      }
      if (sub === "redondeo") {
        return {
          tipo: "redondeo",
          d: Number(document.getElementById("p-d")?.value || 4),
          x: Number(document.getElementById("p-x")?.value),
          x_bar: Number(document.getElementById("p-x-bar")?.value),
        };
      }
      if (sub === "taylor") {
        return {
          tipo: "taylor",
          func_latex: latex,
          x0: Number(document.getElementById("p-x0")?.value || 0),
          x_eval: Number(document.getElementById("p-xeval")?.value || 0.5),
          orden: Number(document.getElementById("p-orden")?.value || 3),
        };
      }
      if (sub === "propagacion") {
        // latex_parser.py convierte x_{1} -> x1, x_{2} -> x2, etc.
        return {
          tipo: "propagacion",
          func_latex: latex,
          valores: {
            x1: Number(document.getElementById("p-x1")?.value || 0),
            x2: Number(document.getElementById("p-x2")?.value || 0),
            x3: Number(document.getElementById("p-x3")?.value || 0),
            x4: Number(document.getElementById("p-x4")?.value || 0),
          },
          errores: {
            x1: Number(document.getElementById("p-dx1")?.value || 0),
            x2: Number(document.getElementById("p-dx2")?.value || 0),
            x3: Number(document.getElementById("p-dx3")?.value || 0),
            x4: Number(document.getElementById("p-dx4")?.value || 0),
          },
        };
      }
    }

    if (mod === "M2") {
      return {
        metodo: sub,
        func_latex: latex,
        a: Number(document.getElementById("p-a")?.value),
        b: Number(document.getElementById("p-b")?.value),
        x0: Number(document.getElementById("p-x0")?.value),
        x1: Number(document.getElementById("p-x1")?.value),
        tol: Number(document.getElementById("p-tol")?.value || 0.0001),
        max_iter: Number(document.getElementById("p-iter")?.value || 30),
      };
    }

    if (mod === "M3") {
      const n = Number(document.getElementById("p-dim-n")?.value || 3);
      const A = Array.from({ length: n }, () => Array(n).fill(0));
      const b = Array(n).fill(0);
      const x0 = Array(n).fill(0);

      document.querySelectorAll(".mat-a").forEach((inp) => {
        A[Number(inp.dataset.r)][Number(inp.dataset.c)] = Number(inp.value);
      });
      document.querySelectorAll(".vec-b").forEach((inp) => {
        b[Number(inp.dataset.r)] = Number(inp.value);
      });
      document.querySelectorAll(".vec-x0").forEach((inp) => {
        x0[Number(inp.dataset.r)] = Number(inp.value);
      });

      return {
        metodo: sub,
        A,
        b,
        x0,
        tol: Number(document.getElementById("p-tol")?.value || 1e-4),
        max_iter: Number(document.getElementById("p-iter")?.value || 30),
        tipo_error: document.getElementById("p-tipo-err")?.value || "residuo",
      };
    }

    if (mod === "M5") {
      const x_vals = Array.from(document.querySelectorAll(".pt-x")).map((i) => Number(i.value));
      const y_vals = Array.from(document.querySelectorAll(".pt-y")).map((i) => Number(i.value));
      return {
        metodo: sub,
        x_vals,
        y_vals,
        x_eval: Number(document.getElementById("p-xeval")?.value),
      };
    }

    if (mod === "M6") {
      const x_vals = Array.from(document.querySelectorAll(".pt-x")).map((i) => Number(i.value));
      const y_vals = Array.from(document.querySelectorAll(".pt-y")).map((i) => Number(i.value));
      const pesosRaw = document.getElementById("p-pesos")?.value || "0.2, 0.3, 0.5";
      const pesos = pesosRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));

      return {
        metodo: sub,
        x_vals,
        y_vals,
        x_eval: Number(document.getElementById("p-xeval")?.value || 7),
        grado: Number(document.getElementById("p-grado")?.value || 2),
        submetodo_ts: document.getElementById("p-ts-sub")?.value || "SES",
        ventana_k: Number(document.getElementById("p-ventana-k")?.value || 3),
        pesos: pesos.length >= 2 ? pesos : [0.2, 0.3, 0.5],
        alpha: Number(document.getElementById("p-alpha")?.value || 0.35),
        beta: Number(document.getElementById("p-beta")?.value || 0.15),
        horizonte_h: Number(document.getElementById("p-horizonte")?.value || 3),
        periodo_estacional: Number(document.getElementById("p-periodo-l")?.value || 4),
      };
    }

    return {};
  }

  async executeActiveMethod() {
    const payload = this._collectPayload();
    window.MNU411.display?.setMessage("Procesando método...");

    try {
      const res = await window.MNU411.api.solveModule(this.currentModule, payload);

      // Extraer el valor principal para pantalla LCD y Ans
      const mainVal =
        res.raiz ??
        res.resultado ??
        res.valor_nominal ??
        res.error_truncamiento ??
        res.cota_teorica ??
        res.mejor_modelo?.proyeccion ??
        (Array.isArray(res.solucion)
          ? `[${res.solucion.map((v) => Number(v).toFixed(4)).join(", ")}]`
          : "OK");

      window.MNU411.display?.setResult(mainVal, typeof mainVal === "number");
      window.MNU411.display?.setMessage("Cálculo completado");

      // Renderizar procedimiento y tablas
      this._renderResultsView(payload, res);
      window.MNU411.display?.saveHistory(
        window.MNU411.display?.getLatex() || `${this.currentModule} (${this.currentSubtema})`,
        mainVal
      );

      // En móvil cerrar hoja para ver el resultado en la pantalla LCD; en PC mostrar pestaña resultados
      if (window.innerWidth < 768) {
        document.getElementById("workstation-panel")?.classList.remove("mobile-open");
        window.MNU411.display?.setMessage("Listo · Toca GGB/PDF para ver tabla");
      } else {
        window.MNU411.keypad?.openWorkstation("results", false);
      }

      // Actualizar gráfica en GeoGebra
      window.MNU411.geogebra?.plotModuleResult(this.currentModule, this.currentSubtema, payload, res);

      // Preparar payload exacto para /api/m4/pdf
      this.lastPdfPayload = {
        titulo_metodo: res.metodo || `${this.currentModule} - ${this.currentSubtema}`,
        entradas_dict: payload,
        resultado_str: String(mainVal),
        iteraciones_list: Array.isArray(res.iteraciones)
          ? res.iteraciones
          : Array.isArray(res.segmentos)
          ? res.segmentos
          : Array.isArray(res.ranking)
          ? res.ranking.map(({ detalle, ...rest }) => rest)
          : null,
        pasos_matriz_list: Array.isArray(res.pasos_matriz) ? res.pasos_matriz : null,
      };
      if (this.pdfBtn) this.pdfBtn.disabled = false;
    } catch (err) {
      window.MNU411.display?.setMessage(err.message, true);
    }
  }

  _renderResultsView(payload, res) {
    let html = `<div class="res-summary-box">`;

    if (res.f_latex) {
      html += `<div class="res-math-row"><strong>Función:</strong> <span class="katex-render" data-tex="f(x) = ${res.f_latex}"></span></div>`;
    }
    if (res.fd1_latex) {
      html += `<div class="res-math-row"><strong>1.ª Derivada:</strong> <span class="katex-render" data-tex="f'(x) = ${res.fd1_latex}"></span></div>`;
    }
    if (res.fd2_latex) {
      html += `<div class="res-math-row"><strong>2.ª Derivada:</strong> <span class="katex-render" data-tex="f''(x) = ${res.fd2_latex}"></span></div>`;
    }
    if (res.polinomio_latex || res.polinomio_expandido_latex) {
      const tex = res.polinomio_expandido_latex || res.polinomio_latex;
      html += `<div class="res-math-row"><strong>Polinomio:</strong> <span class="katex-render" data-tex="P(x) = ${tex}"></span></div>`;
    }
    if (res.ecuacion_latex) {
      html += `<div class="res-math-row"><strong>Modelo ajustado:</strong> <span class="katex-render" data-tex="${res.ecuacion_latex}"></span></div>`;
    }

    const skipKeys = new Set([
      "exito",
      "mensaje",
      "iteraciones",
      "terminos",
      "pasos",
      "pasos_matriz",
      "tabla_diferencias",
      "segmentos",
      "tramo_activo",
      "ranking",
      "mejor_modelo",
      "descartados",
      "detalles",
      "f_latex",
      "fd1_latex",
      "fd2_latex",
      "g_latex",
      "polinomio_latex",
      "polinomio_newton_latex",
      "polinomio_expandido_latex",
      "ecuacion_latex",
      "geogebra_str",
      "polinomio_geogebra",
      "funcion_geogebra",
      "sympy_str",
    ]);

    Object.entries(res).forEach(([k, v]) => {
      if (skipKeys.has(k) || v === null || v === undefined) return;
      const prettyKey = k.replace(/_/g, " ").toUpperCase();
      const prettyVal = Array.isArray(v)
        ? `[ ${v.map((item) => (typeof item === "number" ? Number(item.toPrecision(7)) : item)).join(" , ")} ]`
        : typeof v === "number"
        ? Number(v.toPrecision(10))
        : typeof v === "object"
        ? Object.entries(v)
            .map(([sk, sv]) => `${sk}: ${typeof sv === "number" ? Number(sv.toPrecision(6)) : sv}`)
            .join(" | ")
        : v;
      html += `<div class="res-kv"><span>${prettyKey}:</span> <strong>${prettyVal}</strong></div>`;
    });
    html += `</div>`;

    // Tabla de iteraciones (M2, M3 iterativos, M5 Newton/Lagrange)
    if (Array.isArray(res.iteraciones) && res.iteraciones.length > 0) {
      html += this._buildGenericTableHtml("Tabla de Iteraciones / Desglose", res.iteraciones);
    }

    // Tabla de términos polinomiales (M5 Newton Adelante / Atrás)
    if (Array.isArray(res.terminos) && res.terminos.length > 0) {
      html += this._buildGenericTableHtml("Aporte por Orden Polinomial", res.terminos);
    }

    // Ranking comparativo (M6 comparar)
    if (Array.isArray(res.ranking) && res.ranking.length > 0) {
      const cleanRanking = res.ranking.map(({ detalle, ecuacion_latex, ...rest }) => rest);
      html += this._buildGenericTableHtml("Ranking de Modelos por R²", cleanRanking);
    }

    // Tramos lineales (M5 lineal)
    if (Array.isArray(res.segmentos) && res.segmentos.length > 0) {
      html += this._buildGenericTableHtml("Ecuaciones por Tramo", res.segmentos);
    }

    // Reducción matricial paso a paso (M3 Gauss / Gauss-Jordan)
    if (Array.isArray(res.pasos_matriz) && res.pasos_matriz.length > 0) {
      html += `<h3 class="res-subtitle">Reducción Matricial Paso a Paso</h3>`;
      res.pasos_matriz.forEach((pm) => {
        const matRows = pm.matriz
          .map(
            (row) =>
              `<tr>${row.map((val) => `<td>${Number(val).toFixed(4)}</td>`).join("")}</tr>`
          )
          .join("");
        html += `
          <div class="matrix-step-card">
            <div class="matrix-step-title"><strong>${pm.paso}</strong> — <code>${pm.formula}</code></div>
            <div class="tactile-table-scroll">
              <table class="results-iter-table"><tbody>${matRows}</tbody></table>
            </div>
          </div>
        `;
      });
    }

    // Tabla de diferencias divididas (M5)
    if (Array.isArray(res.tabla_diferencias) && res.tabla_diferencias.length > 0) {
      const matRows = res.tabla_diferencias
        .map(
          (row, idx) =>
            `<tr><td>${res.x[idx]}</td>${row
              .map((val) => `<td>${Number(val).toFixed(6)}</td>`)
              .join("")}</tr>`
        )
        .join("");
      html += `
        <h3 class="res-subtitle">Tabla de Diferencias Divididas</h3>
        <div class="tactile-table-scroll">
          <table class="results-iter-table"><tbody>${matRows}</tbody></table>
        </div>
      `;
    }

    // Detalles derivadas parciales (M1 propagación)
    if (Array.isArray(res.detalles) && res.detalles.length > 0) {
      html += this._buildGenericTableHtml("Aporte por Derivada Parcial", res.detalles);
    }

    this.resultsContainer.innerHTML = html;

    if (window.katex) {
      this.resultsContainer.querySelectorAll(".katex-render").forEach((el) => {
        window.katex.render(el.getAttribute("data-tex") || "", el, { throwOnError: false });
      });
    }
  }

  _buildGenericTableHtml(title, rows) {
    const cols = Object.keys(rows[0]);
    const ths = cols.map((c) => `<th>${c}</th>`).join("");
    const trs = rows
      .map((row) => {
        const tds = cols
          .map((c) => {
            const val = row[c];
            if (val === null || val === undefined) return `<td>—</td>`;
            return `<td>${typeof val === "number" ? Number(val.toPrecision(7)) : val}</td>`;
          })
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");

    return `
      <h3 class="res-subtitle">${title}</h3>
      <div class="tactile-table-scroll">
        <table class="results-iter-table">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    `;
  }
}

window.MNU411 = window.MNU411 || {};
window.addEventListener("DOMContentLoaded", () => {
  window.MNU411.modulesUI = new ModulesUIController();
});
