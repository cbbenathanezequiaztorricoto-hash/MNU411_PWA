/**
 * MNU411 v2.0 — Control de Pantalla LCD Natural Display (MathLive)
 * Garantiza que el usuario nunca vea sintaxis de programación (^, **, *, sqrt())
 * ni que se abra el teclado QWERTY del celular al tocar la pantalla.
 */
class MathDisplayController {
  constructor() {
    this.mf = document.getElementById("math-display");
    this.promptEl = document.getElementById("lcd-prompt-label");
    this.msgEl = document.getElementById("lcd-message");
    this.resultEl = document.getElementById("lcd-result");
    this.ansBadgeEl = document.getElementById("ans-badge");
    this.varBarEl = document.getElementById("var-quick-bar");

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
    if (!this.mf) return;

    // Bloquear teclado virtual nativo del teléfono (solo teclado científico Casio)
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.policy = "manual";
    }
    this.mf.setAttribute("inputmode", "none");
    this.mf.mathVirtualKeyboardPolicy = "manual";
    this.mf.smartMode = false;
    this.mf.mode = "math";

    // Evitar atajos de teclado crudos que muestren barras '\' al usuario
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
  }

  /**
   * Inserta una plantilla LaTeX visual con cuadros editables (#@ / #?)
   */
  insertLatex(latexSnippet) {
    if (!this.mf) return;
    this.mf.focus({ preventScroll: true });
    if (this.mf.mode !== "math") {
      this.mf.mode = "math";
    }

    // Si el usuario pulsa potencia (x² o □^□) en una pantalla vacía, anteponer cuadro base
    const current = this.getLatex().trim();
    if ((latexSnippet === "^{2}" || latexSnippet === "^{3}" || latexSnippet === "^{#?}") && current === "") {
      this.mf.executeCommand(["insert", `{#?}${latexSnippet}`, { selectionMode: "placeholder" }]);
    } else {
      this.mf.executeCommand(["insert", latexSnippet, { selectionMode: "placeholder" }]);
    }

    this.setMessage("Editando expresión...");
  }

  /**
   * Navegación con la cruceta REPLAY (◄ ▲ ▼ ►) por nodos y cuadros editables
   */
  navigate(direction) {
    if (!this.mf) return;
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

    // Si ▲ o ▼ no movieron el cursor dentro de una fracción/potencia, recorrer historial
    if ((direction === "up" || direction === "down") && this.mf.position === beforePos && this.history.length > 0) {
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
    if (!this.mf) return;
    this.mf.focus({ preventScroll: true });
    this.mf.executeCommand("deleteBackward");
  }

  /**
   * Limpia toda la pantalla (AC)
   */
  clearAll() {
    if (!this.mf) return;
    this.mf.setValue("");
    this.mf.focus({ preventScroll: true });
    this.setResult("0", false);
    this.setMessage("Pantalla limpia");
  }

  getLatex() {
    if (!this.mf) return "";
    return this.mf.getValue("latex") || "";
  }

  setLatex(latexStr) {
    if (!this.mf) return;
    this.mf.setValue(latexStr || "");
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
