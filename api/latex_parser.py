import re
import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)


class LatexParseError(ValueError):
    """Error controlado cuando una expresión LaTeX no puede traducirse."""


def _leer_bloque_delimitado(texto: str, inicio: int, abrir: str = "{", cerrar: str = "}") -> tuple[str, int]:
    """Extrae el contenido de un bloque balanceado {...} o [...] a partir de `inicio`."""
    n = len(texto)
    while inicio < n and texto[inicio].isspace():
        inicio += 1
    if inicio >= n or texto[inicio] != abrir:
        raise LatexParseError(f"Expresión incompleta: falta '{abrir}' en la fórmula.")

    profundidad = 0
    i = inicio
    while i < n:
        if texto[i] == abrir:
            profundidad += 1
        elif texto[i] == cerrar:
            profundidad -= 1
            if profundidad == 0:
                return texto[inicio + 1 : i], i + 1
        i += 1
    raise LatexParseError(f"Hay un paréntesis o llave '{abrir}...{cerrar}' sin cerrar.")


def _expandir_fracciones(s: str) -> str:
    """Convierte recursivamente \\frac{num}{den} en ((num)/(den))."""
    while r"\frac" in s:
        idx = s.find(r"\frac")
        num, pos = _leer_bloque_delimitado(s, idx + 5, "{", "}")
        den, fin = _leer_bloque_delimitado(s, pos, "{", "}")
        if not num.strip() or not den.strip():
            raise LatexParseError("Hay una fracción con numerador o denominador vacío.")
        s = s[:idx] + f"(({num})/({den}))" + s[fin:]
    return s


def _expandir_raices(s: str) -> str:
    """Convierte \\sqrt[n]{x} en ((x)**(1/(n))) y \\sqrt{x} en sqrt(x)."""
    while r"\sqrt" in s:
        idx = s.find(r"\sqrt")
        pos = idx + 5
        while pos < len(s) and s[pos].isspace():
            pos += 1
        if pos < len(s) and s[pos] == "[":
            indice, pos = _leer_bloque_delimitado(s, pos, "[", "]")
            radicando, fin = _leer_bloque_delimitado(s, pos, "{", "}")
            if not indice.strip() or not radicando.strip():
                raise LatexParseError("Hay una raíz con índice o contenido vacío.")
            reemplazo = f"(({radicando})**(1/({indice})))"
        else:
            radicando, fin = _leer_bloque_delimitado(s, pos, "{", "}")
            if not radicando.strip():
                raise LatexParseError("Hay una raíz cuadrada vacía.")
            reemplazo = f"sqrt({radicando})"
        s = s[:idx] + reemplazo + s[fin:]
    return s


def _expandir_potencias(s: str) -> str:
    """Convierte ^{exp} en **(exp) y ^a en **(a)."""
    while "^{" in s:
        idx = s.find("^{")
        exp_bloque, fin = _leer_bloque_delimitado(s, idx + 1, "{", "}")
        if not exp_bloque.strip():
            raise LatexParseError("Hay un exponente vacío. Rellénalo o bórralo con DEL.")
        s = s[:idx] + f"**({exp_bloque})" + s[fin:]
    s = re.sub(r"\^([0-9a-zA-Z])", r"**(\1)", s)
    return s


def _preprocesar_latex(latex_str: str, ans_val: float | None = None) -> str:
    """Normaliza macros de MathLive/Casio antes de convertir a SymPy."""
    if not latex_str or not latex_str.strip():
        raise LatexParseError("La pantalla está vacía. Ingrese una expresión.")

    s = latex_str.strip()
    s = re.sub(r"^\$\$|\$\$$|^\$|\$$", "", s).strip()

    # Detectar cuadros editables vacíos de MathLive (\placeholder{} o \square)
    if r"\placeholder" in s or r"\square" in s:
        raise LatexParseError("Hay un cuadro vacío (□) en la pantalla. Rellénalo o bórralo con DEL.")

    # Normalizar variantes de fracciones y constantes
    s = s.replace(r"\dfrac", r"\frac").replace(r"\tfrac", r"\frac")
    s = s.replace(r"\exponentialE", "e").replace(r"\mathrm{e}", "e")
    s = s.replace(r"\imaginaryI", "I")
    s = s.replace(r"\left|", "Abs(").replace(r"\right|", ")")
    s = s.replace(r"\left(", "(").replace(r"\right)", ")")
    s = s.replace(r"\left[", "(").replace(r"\right]", ")")

    # Funciones en español o variantes LaTeX
    s = s.replace(r"\operatorname{sen}", r"\sin").replace(r"\sen", r"\sin")
    s = s.replace(r"\operatorname{tg}", r"\tan").replace(r"\tg", r"\tan")
    s = s.replace(r"\operatorname{arcsen}", r"\arcsin").replace(r"\operatorname{arctg}", r"\arctan")
    s = s.replace("−", "-").replace("×", "*").replace("÷", "/")

    # Memoria Ans
    if r"\text{Ans}" in s or "Ans" in s:
        if ans_val is None:
            raise LatexParseError("La memoria Ans aún no tiene un valor almacenado.")
        s = s.replace(r"\text{Ans}", f"({ans_val})").replace("Ans", f"({ans_val})")

    # Notación científica estilo Casio: \times 10^{x}
    s = re.sub(r"\\times\s*10\^\{([^}]+)\}", r"*10^{\1}", s)

    # Convención calculadora científica: \log sin base es base 10
    s = re.sub(r"\\log(?!_)", r"\\log_{10}", s)

    # Normalizar subíndices de variables: x_{1} -> x_1
    s = re.sub(r"([a-zA-Z])_\{(\d+)\}", r"\1_\2", s)

    return s


def _latex_a_sympy_nativo(limpio: str) -> sp.Expr:
    """Traduce LaTeX normalizado a expresión SymPy sin dependencias externas."""
    s = _expandir_fracciones(limpio)
    s = _expandir_raices(s)
    s = _expandir_potencias(s)

    # Bases de logaritmos: \log_{10} -> log10, \log_{b} -> (1/log(b))*log
    s = s.replace(r"\log_{10}", " log10 ")
    s = re.sub(r"\\log_\{([^}]+)\}", r" (1/log(\1))*log ", s)

    # Funciones matemáticas estándar (con espacios para multiplicación implícita)
    reemplazos_fn = [
        (r"\arcsin", " asin "),
        (r"\arccos", " acos "),
        (r"\arctan", " atan "),
        (r"\sinh", " sinh "),
        (r"\cosh", " cosh "),
        (r"\tanh", " tanh "),
        (r"\sin", " sin "),
        (r"\cos", " cos "),
        (r"\tan", " tan "),
        (r"\ln", " log "),
        (r"\exp", " exp "),
        (r"\pi", " pi "),
        (r"\cdot", "*"),
        (r"\times", "*"),
        (r"\div", "/"),
    ]
    for macro, py_tok in reemplazos_fn:
        s = s.replace(macro, py_tok)

    # Variables con subíndice: x_1 -> x1 (con espacios para separar 3x_1x_2 -> 3 x1 x2)
    s = re.sub(r"([a-zA-Z])_(\d+)", r" \1\2 ", s)

    # Llaves restantes de agrupación -> paréntesis
    s = s.replace("{", "(").replace("}", ")")

    s_clean = s.strip()
    if s_clean.endswith(("+", "-", "*", "/", "^")):
        raise LatexParseError("La expresión termina en un operador incompleto.")

    local_dict = {
        "sin": sp.sin,
        "cos": sp.cos,
        "tan": sp.tan,
        "asin": sp.asin,
        "acos": sp.acos,
        "atan": sp.atan,
        "sinh": sp.sinh,
        "cosh": sp.cosh,
        "tanh": sp.tanh,
        "log": sp.log,
        "ln": sp.log,
        "log10": lambda z: sp.log(z, 10),
        "sqrt": sp.sqrt,
        "exp": sp.exp,
        "Abs": sp.Abs,
        "pi": sp.pi,
        "e": sp.E,
        "E": sp.E,
    }
    transformations = standard_transformations + (
        implicit_multiplication_application,
        convert_xor,
    )
    return parse_expr(s_clean, local_dict=local_dict, transformations=transformations)


def _sympy_a_geogebra(expr: sp.Expr) -> str:
    """Convierte una expresión de SymPy a sintaxis compatible con GeoGebra."""
    texto = str(expr)
    texto = re.sub(r"log\(([^,]+),\s*10\)", r"log10(\1)", texto)
    texto = texto.replace("**", "^")
    return texto


def latex_a_sympy_info(latex_str: str, ans_val: float | None = None) -> dict:
    """
    Traduce una expresión LaTeX a:
      - sympy_expr: objeto SymPy validado
      - sympy_str: cadena lista para engine/ (ej. 'x**2/5 - exp(x)/5')
      - geogebra_str: cadena lista para GeoGebra (ej. 'x^2/5 - exp(x)/5')
      - variables: lista ordenada de variables detectadas
    """
    limpio = _preprocesar_latex(latex_str, ans_val=ans_val)

    try:
        expr = _latex_a_sympy_nativo(limpio)
    except LatexParseError:
        raise
    except Exception:
        raise LatexParseError("Sintaxis matemática incompleta. Revisa paréntesis o exponentes.")

    variables = sorted([s.name for s in expr.free_symbols])

    return {
        "sympy_expr": expr,
        "sympy_str": str(expr),
        "geogebra_str": _sympy_a_geogebra(expr),
        "latex_normalizado": sp.latex(expr),
        "variables": variables,
    }


def evaluar_escalar_latex(latex_str: str, ans_val: float | None = None) -> dict:
    """
    Evalúa expresiones numéricas puras (sin incógnitas libres) para el modo
    calculadora científica estándar al presionar '='.
    """
    info = latex_a_sympy_info(latex_str, ans_val=ans_val)
    expr = info["sympy_expr"]

    if info["variables"]:
        raise LatexParseError(
            f"La expresión contiene variables ({', '.join(info['variables'])}). "
            "Selecciona un módulo numérico (M1–M6) para resolverla."
        )

    valor_eval = expr.evalf(15)
    if not valor_eval.is_real:
        raise LatexParseError("El resultado no pertenece a los números reales (indefinido o complejo).")

    valor_float = float(valor_eval)
    if sp.zoo in expr.atoms() or abs(valor_float) == float("inf"):
        raise LatexParseError("Error matemático: división entre cero o desbordamiento.")

    return {
        "valor": valor_float,
        "sympy_str": info["sympy_str"],
        "latex_normalizado": info["latex_normalizado"],
    }
