/**
 * MNU411 v2.0 — Controlador de Subtemas, Validación de Entradas y Resultados (M1–M6)
 * Alineado con api/schemas.py y api/main.py
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
        this._showFormError(err.message);
      } finally {
        this.pdfBtn.disabled = false;
        this.pdfBtn.textContent = "PDF";
      }
    });
  }

  _showFormError(message) {
    window.MNU411.display?.setMessage(message, true);
    const banner = document.getElementById("module-error-banner");
    if (banner) {
      banner.textContent = `⚠️ ${message}`;
      banner.style.display = "block";
    }
    // En móvil, si el panel estaba cerrado al pulsar '=' desde la calculadora, abrirlo para ver el aviso
    if (window.innerWidth < 768 && this.currentModule !== "M0") {
      document.getElementById("workstation-panel")?.classList.add("mobile-open");
      window.MNU411.keypad?.switchWorkstationTab("params");
    }
  }

  _clearFormError() {
    const banner = document.getElementById("module-error-banner");
    if (banner) {
      banner.textContent = "";
      banner.style.display = "none";
    }
  }

  /**
   * Lee y valida estrictamente un campo numérico del formulario.
   * Evita que celdas vacías se conviertan silenciosamente en 0 o NaN.
   */
  _readNumber(id, label, { required = true, min = null, max = null, positive = false, integer = false } = {}) {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = String(el.value ?? "").trim();

    if (raw === "") {
      if (!required) return null;
      throw new Error(`Falta ingresar el valor en "${label}".`);
    }

    const num = Number(raw);
    if (!Number.isFinite(num)) {
      throw new Error(`El campo "${label}" debe contener un número válido.`);
    }
    if (integer && !Number.isInteger(num)) {
      throw new Error(`El campo "${label}" debe ser un número entero.`);
    }
    if (positive && num <= 0) {
      throw new Error(`El campo "${label}" debe ser mayor que cero (> 0).`);
    }
    if (min !== null && num < min) {
      throw new Error(`El campo "${label}" debe ser mayor o igual a ${min}.`);
    }
    if (max !== null && num > max) {
      throw new Error(`El campo "${label}" debe ser menor o igual a ${max}.`);
    }
    return num;
  }

  _readRequiredLatex(contextDesc) {
    const latex = window.MNU411.display?.getLatex().trim() || "";
    if (!latex) {
      throw new Error(`Escribe primero ${contextDesc} en la pantalla verde de la calculadora.`);
    }
    if (latex.includes("\\placeholder") || latex.includes("\\square")) {
      throw new Error("Hay un cuadro vacío (□) en la pantalla verde. Rellénalo o bórralo con DEL.");
    }
    return latex;
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
      <div
        id="module-error-banner"
        role="alert"
        style="display:none; margin-top:12px; padding:10px 12px; border-radius:8px; background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; font-size:0.82rem; font-weight:700; line-height:1.4;"
      ></div>
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
      this._clearFormError();
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
          <p class="helper-hint">Escribe <strong>f(x)</strong> en la pantalla LCD verde (o pulsa <em>Cargar ejemplo</em>) y define los parámetros:</p>
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
            ${this._numInputHtml("p-x3", "Valor x₃ (opcional)", "1.0")}
            ${this._numInputHtml("p-dx3", "Error Δx₃ (opcional)", "0.01")}
            ${this._numInputHtml("p-x4", "Valor x₄ (opcional)", "1.0")}
            ${this._numInputHtml("p-dx4", "Error Δx₄ (opcional)", "0.01")}
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
          <p class="helper-hint">Escribe <strong>f(x)</strong> en la pantalla verde (o pulsa <em>Cargar ejemplo</em>) e indica el intervalo <strong>[a, b]</strong>:</p>
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
          <p class="helper-hint">Escribe <strong>${fnLabel}</strong> en la pantalla verde (o pulsa <em>Cargar ejemplo</em>):</p>
          <div class="params-grid-3">
            ${this._numInputHtml("p-x0", "Valor inicial (x₀)", "1.5")}
            ${commonStop}
          </div>
        `;
      } else if (sub === "secante") {
        formEl.innerHTML = `
          <p class="helper-hint">Escribe <strong>f(x)</strong> en la pantalla verde y dos puntos iniciales:</p>
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
        this._clearFormError();
        this._renderMatrixGrid(Number(e.target.value), isIterative);
      });
    }

    // -------------------- MÓDULO 5: INTERPOLACIÓN FUNCIONAL ----------------
    else if (mod === "M5") {
      window.MNU411.display?.setPrompt("Puntos:");
      const esNewtonFinitas = sub === "newton_adelante" || sub === "newton_atras";
      const note = esNewtonFinitas
        ? `<p class="helper-hint">Newton hacia adelante/atrás requiere nodos <strong>xᵢ</strong> equidistantes (paso h constante) y <strong>x*</strong> dentro del rango. Permite múltiples puntos, órdenes y factor de conversión:</p>`
        : `<p class="helper-hint">Soporta nodos desordenados, múltiples puntos x* y comparación de órdenes en una sola corrida:</p>`;

      const inputsPolinomiales =
        sub !== "lineal"
          ? `
          <div class="param-field">
            <label for="p-xevals-multi">Puntos x* (separados por coma)</label>
            <input type="text" id="p-xevals-multi" value="2.5" placeholder="Ej: 1.5, 2.5" />
          </div>
          <div class="param-field">
            <label for="p-ordenes-m5">Órdenes / Grados (opcional)</label>
            <input type="text" id="p-ordenes-m5" value="" placeholder="Ej: 3, 4" />
          </div>
          <div class="param-field">
            <label for="p-func-exacta">f(x) exacta (opcional)</label>
            <input type="text" id="p-func-exacta" value="" placeholder="Ej: exp(x), log(x)" />
          </div>
          ${
            esNewtonFinitas
              ? `<div class="param-field">
                  <label for="p-factor-conv">Factor conversión (opcional)</label>
                  <input type="number" step="any" id="p-factor-conv" value="" placeholder="Ej: 0.070307" />
                </div>`
              : ""
          }`
          : `${this._numInputHtml("p-xeval", "Valor x* a interpolar", "2.5")}`;

      formEl.innerHTML = `
        ${note}
        <div class="params-grid-2">
          ${inputsPolinomiales}
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
          this._showFormError("La memoria Ans está vacía. Calcula un valor primero.");
          return;
        }
        this._clearFormError();
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

  _readPointsValidated(minPoints = 2) {
    const xInputs = Array.from(document.querySelectorAll(".pt-x"));
    const yInputs = Array.from(document.querySelectorAll(".pt-y"));

    if (xInputs.length < minPoints) {
      throw new Error(`Se requieren al menos ${minPoints} filas de datos en la tabla.`);
    }

    const x_vals = [];
    const y_vals = [];

    for (let i = 0; i < xInputs.length; i++) {
      const rx = String(xInputs[i].value ?? "").trim();
      const ry = String(yInputs[i].value ?? "").trim();
      if (rx === "" || ry === "") {
        throw new Error(`Fila ${i + 1} de la tabla tiene una celda vacía.`);
      }
      const nx = Number(rx);
      const ny = Number(ry);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        throw new Error(`Fila ${i + 1} contiene un valor no numérico.`);
      }
      x_vals.push(nx);
      y_vals.push(ny);
    }

    return { x_vals, y_vals };
  }

  /**
   * Valida entradas en el navegador y construye el JSON exacto para api/schemas.py
   */
  _collectPayload() {
    const mod = this.currentModule;
    const sub = this.currentSubtema;

    if (mod === "M1") {
      if (["absoluto", "relativo", "porcentual"].includes(sub)) {
        const x = this._readNumber("p-x", "Valor Real (x)");
        const x_bar = this._readNumber("p-x-bar", "Valor Aproximado (x̄)");
        if ((sub === "relativo" || sub === "porcentual") && x === 0) {
          throw new Error("El Valor Real (x) no puede ser 0 para calcular error relativo o porcentual.");
        }
        return { tipo: sub, x, x_bar };
      }

      if (sub === "redondeo") {
        const d = this._readNumber("p-d", "Cifras significativas (d)", { min: 1, max: 15, integer: true });
        const x = this._readNumber("p-x", "Valor Real (x)", { required: false });
        const x_bar = this._readNumber("p-x-bar", "Valor Aproximado (x̄)", { required: false });
        if ((x === null) !== (x_bar === null)) {
          throw new Error("Para verificar redondeo ingresa tanto x como x̄, o deja ambos vacíos para ver solo la cota.");
        }
        return { tipo: "redondeo", d, x, x_bar };
      }

      if (sub === "taylor") {
        const func_latex = this._readRequiredLatex("la función f(x)");
        const x0 = this._readNumber("p-x0", "Punto de expansión (x₀)");
        const x_eval = this._readNumber("p-xeval", "Valor a evaluar (x)");
        const orden = this._readNumber("p-orden", "Orden / Grado (d)", { min: 1, max: 20, integer: true });
        return { tipo: "taylor", func_latex, x0, x_eval, orden };
      }

      if (sub === "propagacion") {
        const func_latex = this._readRequiredLatex("la función multivariable f(x₁, x₂, ...)");
        const valores = {};
        const errores = {};
        for (let idx = 1; idx <= 4; idx++) {
          const v = this._readNumber(`p-x${idx}`, `Valor x${idx}`, { required: false });
          const dv = this._readNumber(`p-dx${idx}`, `Error Δx${idx}`, { required: false, min: 0 });
          if (v !== null) valores[`x${idx}`] = v;
          if (dv !== null) errores[`x${idx}`] = dv;
        }
        return { tipo: "propagacion", func_latex, valores, errores };
      }
    }

    if (mod === "M2") {
      const func_latex = this._readRequiredLatex(
        sub === "punto_fijo" ? "la función g(x)" : "la función f(x)"
      );
      const tol = this._readNumber("p-tol", "Tolerancia (E)", { positive: true });
      const max_iter = this._readNumber("p-iter", "Iteraciones máx.", { min: 1, max: 500, integer: true });

      if (sub === "biseccion" || sub === "regula_falsi") {
        const a = this._readNumber("p-a", "Extremo inferior (a)");
        const b = this._readNumber("p-b", "Extremo superior (b)");
        if (a === b) {
          throw new Error("Los extremos a y b deben ser números distintos.");
        }
        return { metodo: sub, func_latex, a, b, tol, max_iter };
      }

      if (sub === "secante") {
        const x0 = this._readNumber("p-x0", "Primer punto (x₀)");
        const x1 = this._readNumber("p-x1", "Segundo punto (x₁)");
        if (x0 === x1) {
          throw new Error("Los dos puntos iniciales x₀ y x₁ deben ser distintos.");
        }
        return { metodo: sub, func_latex, x0, x1, tol, max_iter };
      }

      const x0 = this._readNumber("p-x0", "Valor inicial (x₀)");
      return { metodo: sub, func_latex, x0, tol, max_iter };
    }

    if (mod === "M3") {
      const n = this._readNumber("p-dim-n", "Dimensión n", { min: 2, max: 6, integer: true });
      const A = Array.from({ length: n }, () => Array(n).fill(0));
      const b = Array(n).fill(0);
      const x0 = Array(n).fill(0);

      document.querySelectorAll(".mat-a").forEach((inp) => {
        const r = Number(inp.dataset.r);
        const c = Number(inp.dataset.c);
        const raw = String(inp.value ?? "").trim();
        if (raw === "" || !Number.isFinite(Number(raw))) {
          throw new Error(`Falta o es inválido el coeficiente en Fila ${r + 1}, Columna x${c + 1}.`);
        }
        A[r][c] = Number(raw);
      });

      document.querySelectorAll(".vec-b").forEach((inp) => {
        const r = Number(inp.dataset.r);
        const raw = String(inp.value ?? "").trim();
        if (raw === "" || !Number.isFinite(Number(raw))) {
          throw new Error(`Falta o es inválido el término independiente b en Fila ${r + 1}.`);
        }
        b[r] = Number(raw);
      });

      const isIterative = sub === "jacobi" || sub === "gauss_seidel";
      if (isIterative) {
        document.querySelectorAll(".vec-x0").forEach((inp) => {
          const r = Number(inp.dataset.r);
          const raw = String(inp.value ?? "").trim();
          if (raw === "" || !Number.isFinite(Number(raw))) {
            throw new Error(`Falta o es inválido el valor inicial x⁽⁰⁾ en Fila ${r + 1}.`);
          }
          x0[r] = Number(raw);
        });
      }

      const tol = isIterative ? this._readNumber("p-tol", "Tolerancia (E)", { positive: true }) : 1e-4;
      const max_iter = isIterative
        ? this._readNumber("p-iter", "Iteraciones máx.", { min: 1, max: 500, integer: true })
        : 30;

      return {
        metodo: sub,
        A,
        b,
        x0: isIterative ? x0 : null,
        tol,
        max_iter,
        tipo_error: document.getElementById("p-tipo-err")?.value || "residuo",
      };
    }

    if (mod === "M5") {
      const { x_vals, y_vals } = this._readPointsValidated(2);
      if (new Set(x_vals).size !== x_vals.length) {
        throw new Error("Los valores de xᵢ no pueden repetirse en interpolación.");
      }
      if (sub !== "lineal") {
        const rawMulti = (document.getElementById("p-xevals-multi")?.value || "").trim();
        const x_evals = rawMulti
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "")
          .map(Number);
        if (x_evals.length === 0 || x_evals.some((v) => !Number.isFinite(v))) {
          throw new Error("Ingresa al menos un punto x* numérico válido (ej: 1.5, 2.5).");
        }
        const rawOrd = (document.getElementById("p-ordenes-m5")?.value || "").trim();
        const ordenes = rawOrd
          ? rawOrd
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s !== "")
              .map(Number)
          : null;
        if (ordenes && ordenes.some((g) => !Number.isInteger(g) || g < 1 || g >= x_vals.length)) {
          throw new Error(`Los órdenes deben ser enteros entre 1 y ${x_vals.length - 1}.`);
        }
        const func_exacta = (document.getElementById("p-func-exacta")?.value || "").trim() || null;
        const factor_conversion = this._readNumber("p-factor-conv", "Factor de conversión", {
          required: false,
        });
        return {
          metodo: sub,
          x_vals,
          y_vals,
          x_eval: x_evals[0],
          x_evals,
          ordenes,
          func_exacta,
          factor_conversion,
          decimales: 6,
        };
      }
      const x_eval = this._readNumber("p-xeval", "Valor x* a interpolar");
      return { metodo: sub, x_vals, y_vals, x_eval };
    }

    if (mod === "M6") {
      const minPts = sub === "series_tiempo" ? 3 : 2;
      const { x_vals, y_vals } = this._readPointsValidated(minPts);

      if (sub === "series_tiempo") {
        const submetodo_ts = document.getElementById("p-ts-sub")?.value || "SES";
        const horizonte_h = this._readNumber("p-horizonte", "Horizonte futuro (h)", {
          min: 1,
          max: 120,
          integer: true,
        });
        const alpha = this._readNumber("p-alpha", "Nivel α", { positive: true, max: 1 });
        const beta = this._readNumber("p-beta", "Tendencia β", { min: 0, max: 1 });
        const ventana_k = this._readNumber("p-ventana-k", "Ventana k (PMS)", {
          min: 1,
          max: 30,
          integer: true,
        });
        const periodo_estacional = this._readNumber("p-periodo-l", "Ciclo L", {
          min: 2,
          max: 24,
          integer: true,
        });

        const pesosRaw = (document.getElementById("p-pesos")?.value || "").trim();
        const pesos = pesosRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "")
          .map(Number);

        if (submetodo_ts === "PMP" && (pesos.length < 2 || pesos.some((p) => !Number.isFinite(p) || p < 0))) {
          throw new Error("En PMP ingresa al menos 2 pesos numéricos no negativos separados por coma.");
        }

        return {
          metodo: "series_tiempo",
          x_vals,
          y_vals,
          x_eval: 0,
          submetodo_ts,
          ventana_k,
          pesos: pesos.length >= 2 ? pesos : [0.2, 0.3, 0.5],
          alpha,
          beta,
          horizonte_h,
          periodo_estacional,
        };
      }

      const x_eval = this._readNumber("p-xeval", "Valor a proyectar (x_eval)");
      const grado =
        sub === "polinomial" || sub === "comparar"
          ? this._readNumber("p-grado", "Grado polinomio (m)", { min: 1, max: 10, integer: true })
          : 2;

      if (sub === "polinomial" && x_vals.length < grado + 1) {
        throw new Error(`Para grado ${grado} se necesitan al menos ${grado + 1} puntos.`);
      }
      if (sub === "exponencial" && y_vals.some((y) => y <= 0)) {
        throw new Error("El modelo exponencial requiere que todos los valores yᵢ sean mayores que 0.");
      }
      if (sub === "potencial" && (x_vals.some((x) => x <= 0) || y_vals.some((y) => y <= 0) || x_eval <= 0)) {
        throw new Error("El modelo potencial requiere xᵢ > 0, yᵢ > 0 y x_eval > 0.");
      }
      if (sub === "logaritmica" && (x_vals.some((x) => x <= 0) || x_eval <= 0)) {
        throw new Error("El modelo logarítmico requiere xᵢ > 0 y x_eval > 0.");
      }

      return { metodo: sub, x_vals, y_vals, x_eval, grado };
    }

    return {};
  }

  async executeActiveMethod(keepPanelOpen = false) {
    this._clearFormError();
    let payload;
    try {
      payload = this._collectPayload();
    } catch (validationErr) {
      this._showFormError(validationErr.message);
      return;
    }

    window.MNU411.display?.setMessage("Procesando método...");

    try {
      const res = await window.MNU411.api.solveModule(this.currentModule, payload);

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

      this._renderResultsView(payload, res);
      window.MNU411.display?.saveHistory(
        window.MNU411.display?.getLatex() || `${this.currentModule} (${this.currentSubtema})`,
        mainVal
      );

      // En móvil cerrar hoja salvo recálculo rápido dentro de resultados; en PC mostrar pestaña resultados
      if (window.innerWidth < 768 && !keepPanelOpen) {
        document.getElementById("workstation-panel")?.classList.remove("mobile-open");
        window.MNU411.display?.setMessage("Listo · Toca GGB/PDF para ver tabla");
      } else {
        window.MNU411.keypad?.openWorkstation("results", false);
      }

      window.MNU411.geogebra?.plotModuleResult(this.currentModule, this.currentSubtema, payload, res);

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
      this._showFormError(err.message);
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
    if (
      res.polinomio_latex &&
      res.polinomio_expandido_latex &&
      res.polinomio_latex !== res.polinomio_expandido_latex
    ) {
      html += `<div class="res-math-row"><strong>Polinomio de Lagrange:</strong> <span class="katex-render" data-tex="P(x) = ${res.polinomio_latex}"></span></div>`;
      html += `<div class="res-math-row"><strong>Polinomio Expandido:</strong> <span class="katex-render" data-tex="P(x) = ${res.polinomio_expandido_latex}"></span></div>`;
    } else if (res.polinomio_latex || res.polinomio_expandido_latex) {
      const tex = res.polinomio_expandido_latex || res.polinomio_latex;
      html += `<div class="res-math-row"><strong>Polinomio:</strong> <span class="katex-render" data-tex="P(x) = ${tex}"></span></div>`;
    }

    if (this.currentModule === "M5" && Array.isArray(payload.x_vals)) {
      const xMin = Math.min(...payload.x_vals);
      const xMax = Math.max(...payload.x_vals);
      const step =
        payload.x_vals.length > 1
          ? Math.abs(payload.x_vals[1] - payload.x_vals[0]) || 1
          : 1;
      const xLeft = Number((xMin - step).toPrecision(6));
      const xRight = Number((xMax + step).toPrecision(6));

      html += `
        <div class="m5-extrapolate-bar" style="margin-top:8px; padding:10px 12px; background:#f0fdf4; border:1px solid #86efac; border-radius:10px;">
          <div style="font-size:0.78rem; font-weight:800; color:#166534; margin-bottom:6px;">
            ⚡ Extrapolar / Evaluar en otro x* (Rango nodal: [${xMin}, ${xMax}]):
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            <input
              type="number"
              id="quick-xeval-input"
              step="any"
              value="${payload.x_eval}"
              aria-label="Nuevo valor x* a evaluar"
              style="flex:1; min-width:95px; padding:6px 9px; border:1px solid #86efac; border-radius:7px; font-size:0.88rem; font-weight:700; background:#ffffff; color:#0f172a;"
            />
            <button type="button" class="btn-secondary-sm quick-xeval-chip" data-x="${xLeft}">
              x* = ${xLeft}
            </button>
            <button type="button" class="btn-secondary-sm quick-xeval-chip" data-x="${xRight}">
              x* = ${xRight}
            </button>
            <button type="button" id="btn-quick-extrapolate" class="btn-primary-run" style="margin-left:0; padding:7px 12px; font-size:0.8rem;">
              Extrapolar
            </button>
          </div>
        </div>
      `;
    }
    if (res.ecuacion_latex) {
      html += `<div class="res-math-row"><strong>Modelo ajustado:</strong> <span class="katex-render" data-tex="${res.ecuacion_latex}"></span></div>`;
    }

    if (res.reporte_texto) {
      const escapedReport = String(res.reporte_texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      html += `
        <div style="margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="font-size:0.82rem; color:#0f172a;">Reporte Paso a Paso (Word / Excel):</strong>
            <button type="button" id="btn-copy-reporte" class="btn-secondary-sm">Copiar Reporte</button>
          </div>
          <pre id="pre-reporte-texto" style="background:#0f172a; color:#e2e8f0; padding:10px; border-radius:8px; font-size:0.74rem; line-height:1.45; overflow-x:auto; white-space:pre;">${escapedReport}</pre>
        </div>
      `;
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
      "resultados_puntos",
      "comparacion_ordenes",
      "analisis_errores_exactos",
      "curvas_extra",
      "reporte_texto",
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

    if (Array.isArray(res.resultados_puntos) && res.resultados_puntos.length > 0) {
      const flatPuntos = res.resultados_puntos.map((rp) => ({
        "x*": rp.x_p,
        Tipo: rp.tipo,
        ...(rp.estimaciones || {}),
        ...(rp.estimaciones_convertidas || {}),
      }));
      html += this._buildGenericTableHtml("Evaluación por Punto y Orden", flatPuntos);
    }

    if (Array.isArray(res.comparacion_ordenes) && res.comparacion_ordenes.length > 0) {
      html += this._buildGenericTableHtml("Comparación entre Órdenes Consecutivos", res.comparacion_ordenes);
    }

    if (Array.isArray(res.analisis_errores_exactos) && res.analisis_errores_exactos.length > 0) {
      html += this._buildGenericTableHtml("Análisis de Error vs. Función Exacta", res.analisis_errores_exactos);
    }

    if (Array.isArray(res.iteraciones) && res.iteraciones.length > 0) {
      html += this._buildGenericTableHtml("Tabla de Iteraciones / Desglose", res.iteraciones);
    }

    if (Array.isArray(res.terminos) && res.terminos.length > 0) {
      html += this._buildGenericTableHtml("Aporte por Orden Polinomial", res.terminos);
    }

    if (Array.isArray(res.ranking) && res.ranking.length > 0) {
      const cleanRanking = res.ranking.map(({ detalle, ecuacion_latex, ...rest }) => rest);
      html += this._buildGenericTableHtml("Ranking de Modelos por R²", cleanRanking);
    }

    if (Array.isArray(res.segmentos) && res.segmentos.length > 0) {
      html += this._buildGenericTableHtml("Ecuaciones por Tramo", res.segmentos);
    }

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

    if (Array.isArray(res.tabla_diferencias) && res.tabla_diferencias.length > 0) {
      const nPts = res.tabla_diferencias.length;
      const matRows = res.tabla_diferencias
        .map(
          (row, idx) =>
            `<tr><td>${res.x[idx]}</td>${row
              .map((val, colIdx) =>
                colIdx >= nPts - idx
                  ? `<td>—</td>`
                  : `<td>${Number(val).toFixed(6)}</td>`
              )
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

    if (Array.isArray(res.pasos) && res.pasos.length > 0) {
      const pasosLi = res.pasos
        .map(
          (p) =>
            `<li><code>${p.formula}</code> = <strong>${Number(p.valor).toFixed(6)}</strong></li>`
        )
        .join("");
      html += `
        <h3 class="res-subtitle">Desarrollo Paso a Paso (Diferencias Divididas)</h3>
        <ol class="res-steps-list">${pasosLi}</ol>
      `;
    }

    if (Array.isArray(res.t_futuro) && Array.isArray(res.pronosticos_futuros)) {
      const futRows = res.t_futuro.map((tf, idx) => ({
        "Periodo (t)": tf,
        "Pronóstico ŷ_t": res.pronosticos_futuros[idx],
      }));
      html += this._buildGenericTableHtml("Tabla de Pronósticos Futuros", futRows);
    }

    if (Array.isArray(res.detalles) && res.detalles.length > 0) {
      html += this._buildGenericTableHtml("Aporte por Derivada Parcial", res.detalles);
    }

    this.resultsContainer.innerHTML = html;

    document.getElementById("btn-copy-reporte")?.addEventListener("click", async (ev) => {
      const txt = res.reporte_texto || "";
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        ev.target.textContent = "Copiado";
        setTimeout(() => {
          ev.target.textContent = "Copiar Reporte";
        }, 1800);
      } catch (_) {
        this._showFormError("No se pudo copiar automáticamente; selecciona el bloque negro y presiona Ctrl+C.");
      }
    });

    if (window.katex) {
      this.resultsContainer.querySelectorAll(".katex-render").forEach((el) => {
        window.katex.render(el.getAttribute("data-tex") || "", el, { throwOnError: false });
      });
    }

    if (this.currentModule === "M5") {
      const runQuickX = (rawVal) => {
        const nextX = Number(String(rawVal ?? "").trim());
        if (!Number.isFinite(nextX)) {
          this._showFormError('Ingresa un valor numérico válido en "x*".');
          return;
        }
        const xMin = Math.min(...payload.x_vals);
        const xMax = Math.max(...payload.x_vals);
        if (
          (this.currentSubtema === "newton_adelante" || this.currentSubtema === "newton_atras") &&
          (nextX < xMin || nextX > xMax)
        ) {
          this.currentSubtema = "lagrange";
          this.paramsContainer.querySelectorAll(".subtema-pill").forEach((pill) => {
            pill.classList.toggle("active", pill.getAttribute("data-subtema") === "lagrange");
          });
        }
        const formXInput = document.getElementById("p-xeval");
        if (formXInput) formXInput.value = nextX;
        const formXMultiInput = document.getElementById("p-xevals-multi");
        if (formXMultiInput) formXMultiInput.value = nextX;
        this.executeActiveMethod(true);
      };

      this.resultsContainer.querySelectorAll(".quick-xeval-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const val = chip.getAttribute("data-x");
          const inp = document.getElementById("quick-xeval-input");
          if (inp) inp.value = val;
          runQuickX(val);
        });
      });

      document.getElementById("btn-quick-extrapolate")?.addEventListener("click", () => {
        runQuickX(document.getElementById("quick-xeval-input")?.value);
      });

      document.getElementById("quick-xeval-input")?.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          runQuickX(ev.target.value);
        }
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
