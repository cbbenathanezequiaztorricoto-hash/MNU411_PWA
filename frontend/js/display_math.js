/**
 * MNU411 v2.0 — Control de Pantalla LCD Natural Display (MathLive)
 * Garantiza que el usuario nunca vea sintaxis de programación (^, **, *, sqrt())
 * ni que se abra el teclado QWERTY del celular al tocar la pantalla.
 */
class MathDisplayController {
  constructor() {
    this.mf = document.getElementById("math-display");
    this.fallbackEl = document.getElementById("math-katex-fallback");
    this.promptEl = document.getElementById("lcd-prompt-label");
    this.msgEl = document.getElementById("lcd-message");
    this.resultEl = document.getElementById("lcd-result");
    this.ansBadgeEl = document.getElementById("ans-badge");
    this.varBarEl = document.getElementById("var-quick-bar");

    this.latexBuffer = "";
    this.mathliveReady = false;

    this.ansValue = this._loadAns();
    this.history = JSON.parse(localStorage.getItem("mnu411_history") || "[]");
    this.historyIndex = this.history.length;
    this._updateAnsBadge();
    this._initMathField();
  }

  _loadAns() {
    const saved = localStorage.getItem("mnu411_ans");
    if (saved === null) return null;
    const num = Number(saved);
    return Number.isFinite(num) ? num : null;
  }

  _updateAnsBadge() {
    if (!this.ansBadgeEl) return;
    if (this.ansValue !== null) {
      this.ansBadgeEl.classList.remove("hidden");
      this.ansBadgeEl.title = `Memoria Ans = ${this.ansValue}`;
    } else {
      this.ansBadgeEl.classList.add("hidden");
    }
  }

  _initMathField() {
    this._renderFallback();
    if (!this.mf) return;

    if (window.customElements && typeof window.customElements.whenDefined === "function") {
      window.customElements.whenDefined("math-field").then(() => {
        this._upgradeMathField();
      });
    } else if (window.MathfieldElement) {
      this._upgradeMathField();
    }
  }

  _upgradeMathField() {
    if (!this.mf || this.mathliveReady) return;

    if (window.MathfieldElement) {
      window.MathfieldElement.fontsDirectory =
        "https://cdn.jsdelivr.net/npm/mathlive@0.101.0/dist/fonts";
      window.MathfieldElement.soundsDirectory = null;
    }

    // Bloquear teclado virtual nativo del teléfono (solo teclado científico Casio)
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.policy = "manual";
    }
    this.mf.setAttribute("inputmode", "none");
    this.mf.mathVirtualKeyboardPolicy = "manual";
    this.mf.smartMode = false;
    this.mf.mode = "math";

    this.mf.addEventListener("input", () => {
      this.latexBuffer = this.mf.getValue("latex") || "";
    });

    this.mf.addEventListener("focus", () => {
      if (window.mathVirtualKeyboard) {
        window.mathVirtualKeyboard.hide();
      }
    });

    // Atajos de teclado físico en PC sincronizados con escritura natural
    this.mf.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        document.getElementById("key-equals")?.click();
      } else if (ev.key === "^") {
        ev.preventDefault();
        this.insertLatex("^{#?}");
      } else if (ev.key === "*") {
        ev.preventDefault();
        this.insertLatex("\\times");
      } else if (ev.key === "/") {
        ev.preventDefault();
        this.insertLatex("\\frac{#@}{#?}");
      }
    });

    if (this.latexBuffer) {
      this.mf.setValue(this.latexBuffer);
    }

    // Activar MathLive solo si el Shadow DOM montó correctamente
    if (this.mf.shadowRoot) {
      this.mathliveReady = true;
      this.mf.classList.remove("hidden");
      this.fallbackEl?.classList.add("hidden");
    }
  }

  _renderFallback() {
    if (this.mathliveReady || !this.fallbackEl) return;

    if (!window.katex) {
      setTimeout(() => this._renderFallback(), 60);
      return;
    }

    const visualTex = (this.latexBuffer || "").replace(/#@|#\?/g, "\\square");
    this.fallbackEl.innerHTML = "";
    const mathSpan = document.createElement("span");
    try {
      window.katex.render(visualTex || "\\color{#5c6b57}{0}", mathSpan, {
        throwOnError: false,
        displayMode: false,
      });
    } catch (_) {
      mathSpan.textContent = visualTex || "0";
    }

    const cursor = document.createElement("span");
    cursor.className = "lcd-cursor";
    this.fallbackEl.appendChild(mathSpan);
    this.fallbackEl.appendChild(cursor);
  }

  /**
   * Inserta una plantilla LaTeX visual con cuadros editables (#@ / #?)
   */
  insertLatex(latexSnippet) {
    const current = this.getLatex().trim();
    const isPower =
      latexSnippet === "^{2}" || latexSnippet === "^{3}" || latexSnippet === "^{#?}";

    if (this.mathliveReady && this.mf) {
      this.mf.focus({ preventScroll: true });
      if (this.mf.mode !== "math") {
        this.mf.mode = "math";
      }
      if (isPower && current === "") {
        this.mf.executeCommand(["insert", `{#?}${latexSnippet}`, { selectionMode: "placeholder" }]);
      } else {
        this.mf.executeCommand(["insert", latexSnippet, { selectionMode: "placeholder" }]);
      }
      this.latexBuffer = this.mf.getValue("latex") || "";
    } else {
      const normalized = latexSnippet.replace(/#@/g, "#?");
      const prefix = isPower && this.latexBuffer === "" ? "{#?}" : "";
      const token = `${prefix}${normalized}`;

      if (this.latexBuffer.includes("#?") && !token.includes("#?")) {
        this.latexBuffer = this.latexBuffer.replace("#?", token);
      } else {
        this.latexBuffer += token;
      }
      this._renderFallback();
    }

    this.setMessage("Editando expresión...");
  }

  /**
   * Navegación con la cruceta REPLAY (◄ ▲ ▼ ►) por nodos y cuadros editables
   */
  navigate(direction) {
    if (this.mathliveReady && this.mf) {
      this.mf.focus({ preventScroll: true });

      const commandMap = {
        left: "moveToPreviousChar",
        right: "moveToNextChar",
        up: "moveUp",
        down: "moveDown",
      };

      const beforePos = this.mf.position;
      const cmd = commandMap[direction];
      if (cmd) {
        this.mf.executeCommand(cmd);
      }

      if (
        (direction === "up" || direction === "down") &&
        this.mf.position === beforePos &&
        this.history.length > 0
      ) {
        this._stepHistory(direction);
      }
      return;
    }

    if ((direction === "up" || direction === "down") && this.history.length > 0) {
      this._stepHistory(direction);
    }
  }

  _stepHistory(direction) {
    if (direction === "up" && this.historyIndex > 0) {
      this.historyIndex -= 1;
    } else if (direction === "down" && this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
    } else {
      return;
    }
    const item = this.history[this.historyIndex];
    if (item) {
      this.setLatex(item.latex);
      this.setResult(item.result, false);
      this.setMessage(`Historial (${this.historyIndex + 1}/${this.history.length})`);
    }
  }

  saveHistory(latex, result) {
    if (!latex) return;
    this.history.push({ latex, result });
    if (this.history.length > 30) this.history.shift();
    this.historyIndex = this.history.length;
    localStorage.setItem("mnu411_history", JSON.stringify(this.history));
  }

  /**
   * Borra el nodo o carácter anterior (DEL)
   */
  deleteBackward() {
    if (this.mathliveReady && this.mf) {
      this.mf.focus({ preventScroll: true });
      this.mf.executeCommand("deleteBackward");
      this.latexBuffer = this.mf.getValue("latex") || "";
      return;
    }

    this.latexBuffer = this.latexBuffer
      .replace(/(\\[a-zA-Z]+(?:\{[^}]*\})*|#[\?@]|.)$/, "");
    this._renderFallback();
  }

  /**
   * Limpia toda la pantalla (AC)
   */
  clearAll() {
    this.latexBuffer = "";
    if (this.mathliveReady && this.mf) {
      this.mf.setValue("");
      this.mf.focus({ preventScroll: true });
    } else {
      this._renderFallback();
    }
    this.setResult("0", false);
    this.setMessage("Pantalla limpia");
  }

  getLatex() {
    if (this.mathliveReady && this.mf) {
      return this.mf.getValue("latex") || "";
    }
    return this.latexBuffer.replace(/#@|#\?/g, "\\placeholder{}");
  }

  setLatex(latexStr) {
    this.latexBuffer = latexStr || "";
    if (this.mathliveReady && this.mf) {
      this.mf.setValue(this.latexBuffer);
    } else {
      this._renderFallback();
    }
  }

  setPrompt(label) {
    if (this.promptEl) {
      this.promptEl.textContent = label;
    }
  }

  toggleVarQuickBar(visible) {
    if (!this.varBarEl) return;
    this.varBarEl.classList.toggle("hidden", !visible);
  }

  setMessage(text, isError = false) {
    if (!this.msgEl) return;
    this.msgEl.textContent = text;
    this.msgEl.classList.toggle("error", Boolean(isError));
  }

  setResult(value, saveAsAns = true) {
    if (!this.resultEl) return;

    if (typeof value === "number" && Number.isFinite(value)) {
      const formatted = Number(value.toPrecision(10)).toString();
      this.resultEl.textContent = formatted;
      if (saveAsAns) {
        this.ansValue = value;
        localStorage.setItem("mnu411_ans", String(value));
        this._updateAnsBadge();
      }
    } else {
      this.resultEl.textContent = String(value);
    }
  }

  getAns() {
    return this.ansValue;
  }
}

window.MNU411 = window.MNU411 || {};
window.addEventListener("DOMContentLoaded", () => {
  window.MNU411.display = new MathDisplayController();
});
