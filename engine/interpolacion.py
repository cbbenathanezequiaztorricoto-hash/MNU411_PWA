import math
import numpy as np
import sympy as sp


class InterpolacionEngine:

    # -------------------------------------------------------------------------
    # VALIDACIONES INTERNAS
    # -------------------------------------------------------------------------
    @staticmethod
    def _parsear_escalar(valor, nombre_parametro):
        try:
            val = float(valor)
        except (TypeError, ValueError):
            raise ValueError(
                f"Entrada inválida en '{nombre_parametro}': se recibió '{valor}', "
                "pero debe ser un número real (no se permiten letras ni texto)."
            )
        if math.isnan(val) or math.isinf(val):
            raise ValueError(f"El parámetro '{nombre_parametro}' no puede ser NaN ni infinito.")
        return val

    @staticmethod
    def _validar_datos_base(x_vals, y_vals):
        if len(x_vals) != len(y_vals):
            raise ValueError("Las columnas x y f(x) deben tener la misma cantidad de filas.")
        if len(x_vals) < 2:
            raise ValueError("Se requieren al menos 2 puntos tabulados para interpolar.")

        x_limpio, y_limpio = [], []
        for idx, (xv, yv) in enumerate(zip(x_vals, y_vals), start=1):
            try:
                x_num = float(xv)
            except (TypeError, ValueError):
                raise ValueError(
                    f"Dato inválido en columna 'x', fila {idx}: '{xv}' no es un número válido."
                )
            try:
                y_num = float(yv)
            except (TypeError, ValueError):
                raise ValueError(
                    f"Dato inválido en columna 'f(x)', fila {idx}: '{yv}' no es un número válido."
                )
            x_limpio.append(x_num)
            y_limpio.append(y_num)

        x = np.array(x_limpio, dtype=float)
        y = np.array(y_limpio, dtype=float)

        if np.any(np.isnan(x)) or np.any(np.isnan(y)) or np.any(np.isinf(x)) or np.any(np.isinf(y)):
            raise ValueError("La tabla contiene celdas vacías (NaN) o valores infinitos.")
        if len(np.unique(x)) != len(x):
            raise ValueError("Los valores de 'x' no pueden repetirse.")

        return x, y
    @staticmethod
    def _validar_paso_constante(x, xp):
        diferencias = np.diff(x)
        h = float(diferencias[0])

        if h <= 0 or not np.all(diferencias > 0):
            raise ValueError("Para Newton, los valores de x deben estar ordenados de forma estrictamente creciente.")
        if not np.allclose(diferencias, h, rtol=1e-7, atol=1e-9):
            raise ValueError("Los datos no tienen separación constante h; use el método de Lagrange.")
        if xp < x[0] or xp > x[-1]:
            raise ValueError(
                f"El valor buscado ({xp}) está fuera del rango [{x[0]}, {x[-1]}]. "
                "Newton solo aplica para interpolación; use Lagrange para extrapolar."
            )

        return h

    # -------------------------------------------------------------------------
    # 5.1.A NEWTON HACIA ADELANTE (TRIANGULAR SUPERIOR)
    # -------------------------------------------------------------------------
    @staticmethod
    def newton_adelante(x_vals, y_vals, xp):
        x, y = InterpolacionEngine._validar_datos_base(x_vals, y_vals)
        xp = float(xp)
        h = InterpolacionEngine._validar_paso_constante(x, xp)
        n = len(x)

        # Matriz de diferencias finitas alineada hacia arriba (triangular superior)
        diff = np.full((n, n), np.nan)
        diff[:, 0] = y
        for k in range(1, n):
            for i in range(n - k):
                diff[i, k] = diff[i + 1, k - 1] - diff[i, k - 1]

        x0 = float(x[0])
        P = (xp - x0) / h

        resultado = float(diff[0, 0])
        terminos = [
            {
                "orden": 0,
                "diferencia": round(float(diff[0, 0]), 6),
                "factor_P": 1.0,
                "aporte": round(resultado, 6),
            }
        ]

        prod_p = 1.0
        for k in range(1, n):
            prod_p *= (P - (k - 1))
            coef_p = prod_p / math.factorial(k)
            delta_y = float(diff[0, k])
            aporte = coef_p * delta_y
            resultado += aporte
            terminos.append(
                {
                    "orden": k,
                    "diferencia": round(delta_y, 6),
                    "factor_P": round(coef_p, 6),
                    "aporte": round(aporte, 6),
                }
            )

        # Construcción de tabla tabular para UI y reporte PDF
        tabla_diferencias = []
        for i in range(n):
            fila = {"i": i, "x_i": round(float(x[i]), 6), "f(x_i)": round(float(diff[i, 0]), 6)}
            for k in range(1, n):
                col_name = f"Δ^{k}f"
                fila[col_name] = None if np.isnan(diff[i, k]) else round(float(diff[i, k]), 6)
            tabla_diferencias.append(fila)

        return {
            "metodo": "Interpolación de Newton hacia Adelante",
            "solucion": round(resultado, 6),
            "xp": xp,
            "x0": x0,
            "h": round(h, 6),
            "P": round(P, 6),
            "terminos": terminos,
            "iteraciones": tabla_diferencias,
        }

    # -------------------------------------------------------------------------
    # 5.1.B NEWTON HACIA ATRÁS (TRIANGULAR INFERIOR)
    # -------------------------------------------------------------------------
    @staticmethod
    def newton_atras(x_vals, y_vals, xp):
        x, y = InterpolacionEngine._validar_datos_base(x_vals, y_vals)
        xp = float(xp)
        h = InterpolacionEngine._validar_paso_constante(x, xp)
        n = len(x)

        # Matriz de diferencias finitas alineada hacia abajo (triangular inferior)
        diff = np.full((n, n), np.nan)
        diff[:, 0] = y
        for k in range(1, n):
            for i in range(k, n):
                diff[i, k] = diff[i, k - 1] - diff[i - 1, k - 1]

        x0 = float(x[-1])
        P = (xp - x0) / h

        resultado = float(diff[n - 1, 0])
        terminos = [
            {
                "orden": 0,
                "diferencia": round(float(diff[n - 1, 0]), 6),
                "factor_P": 1.0,
                "aporte": round(resultado, 6),
            }
        ]

        prod_p = 1.0
        for k in range(1, n):
            prod_p *= (P + (k - 1))
            coef_p = prod_p / math.factorial(k)
            nabla_y = float(diff[n - 1, k])
            aporte = coef_p * nabla_y
            resultado += aporte
            terminos.append(
                {
                    "orden": k,
                    "diferencia": round(nabla_y, 6),
                    "factor_P": round(coef_p, 6),
                    "aporte": round(aporte, 6),
                }
            )

        # Construcción de tabla tabular para UI y reporte PDF
        tabla_diferencias = []
        for i in range(n):
            fila = {"i": i, "x_i": round(float(x[i]), 6), "f(x_i)": round(float(diff[i, 0]), 6)}
            for k in range(1, n):
                col_name = f"∇^{k}f"
                fila[col_name] = None if np.isnan(diff[i, k]) else round(float(diff[i, k]), 6)
            tabla_diferencias.append(fila)

        return {
            "metodo": "Interpolación de Newton hacia Atrás",
            "solucion": round(resultado, 6),
            "xp": xp,
            "x0": x0,
            "h": round(h, 6),
            "P": round(P, 6),
            "terminos": terminos,
            "iteraciones": tabla_diferencias,
        }

    # -------------------------------------------------------------------------
    # 5.1.C POLINOMIO DE APROXIMACIÓN DE LAGRANGE (INTERPOLA Y EXTRAPOLA)
    # -------------------------------------------------------------------------
    @staticmethod
    def lagrange(x_vals, y_vals, xp):
        x, y = InterpolacionEngine._validar_datos_base(x_vals, y_vals)
        xp = float(xp)
        n = len(x)

        es_extrapolacion = bool(xp < np.min(x) or xp > np.max(x))
        resultado = 0.0
        desglose = []

        for i in range(n):
            numerador = 1.0
            denominador = 1.0
            for j in range(n):
                if i != j:
                    numerador *= (xp - x[j])
                    denominador *= (x[i] - x[j])

            li = numerador / denominador
            aporte = li * float(y[i])
            resultado += aporte

            desglose.append(
                {
                    "i": i,
                    "x_i": round(float(x[i]), 6),
                    "f(x_i)": round(float(y[i]), 6),
                    "L_i(x)": round(float(li), 6),
                    "L_i(x)*f_i": round(float(aporte), 6),
                }
            )

        # Construcción simbólica del polinomio de Lagrange y su forma expandida
        x_sym = sp.Symbol("x")
        poli_lagrange_expr = sp.Integer(0)
        for i in range(n):
            li_sym = sp.Integer(1)
            for j in range(n):
                if i != j:
                    li_sym *= (x_sym - sp.Float(float(x[j]), 10)) / sp.Float(
                        float(x[i] - x[j]), 10
                    )
            poli_lagrange_expr += sp.Float(float(y[i]), 10) * li_sym

        poli_expandido_raw = sp.expand(poli_lagrange_expr)
        poly_obj = sp.Poly(poli_expandido_raw, x_sym)
        poli_expandido_expr = sum(
            sp.Float(round(float(coef), 8), 8) * (x_sym ** deg)
            for (deg,), coef in poly_obj.terms()
            if abs(float(coef)) > 1e-12
        )
        if poli_expandido_expr == 0:
            poli_expandido_expr = sp.Float(0.0, 4)

        x_min, x_max = float(np.min(x)), float(np.max(x))

        return {
            "metodo": "Polinomio de Aproximación de Lagrange",
            "solucion": round(resultado, 6),
            "x": xp,
            "x_eval": xp,
            "rango_x": [x_min, x_max],
            "es_extrapolacion": es_extrapolacion,
            "tipo_evaluacion": "Extrapolación" if es_extrapolacion else "Interpolación",
            "polinomio_latex": sp.latex(poli_lagrange_expr),
            "polinomio_expandido_latex": sp.latex(poli_expandido_expr),
            "polinomio_geogebra": str(poli_expandido_expr).replace("**", "^"),
            "iteraciones": desglose,
        }

def _validar_puntos_interpolacion(x_vals, y_vals, min_puntos: int = 2):
    """
    Valida consistencia dimensional y unicidad de abscisas (Regla 3 de estabilidad:
    evitar división entre cero por nodos repetidos).
    """
    x = np.asarray(x_vals, dtype=float)
    y = np.asarray(y_vals, dtype=float)

    if x.ndim != 1 or y.ndim != 1 or len(x) != len(y):
        return False, "Los vectores X e Y deben ser unidimensionales y tener la misma longitud.", None, None

    if len(x) < min_puntos:
        return False, f"Se requieren al menos {min_puntos} puntos para este método.", None, None

    if np.any(np.isnan(x)) or np.any(np.isnan(y)) or np.any(np.isinf(x)) or np.any(np.isinf(y)):
        return False, "Los datos contienen valores NaN o infinitos.", None, None

    # Verificar nodos X duplicados (|x_i - x_j| < 1e-15)
    n = len(x)
    for i in range(n):
        for j in range(i + 1, n):
            if abs(x[i] - x[j]) < 1e-15:
                return (
                    False,
                    f"Error de estabilidad (División por cero): existen abscisas repetidas (x[{i}] = x[{j}] = {x[i]}).",
                    None,
                    None,
                )

    return True, "OK", x, y


# =============================================================================
# PIEZA 5.4.C: DIFERENCIAS DIVIDIDAS DE NEWTON (Nieves & Domínguez, Sec. 5.3-5.4)
# =============================================================================
def interpolacion_diferencias_divididas(x_vals, y_vals, x_eval: float) -> dict:
    """
    Calcula el polinomio interpolante de Newton mediante tabla de diferencias divididas
    (Algoritmos 5.3 y 5.4 de Nieves & Domínguez) y lo evalúa en x_eval usando
    esquema anidado de Horner (Sec. 2.10) para minimizar errores de redondeo.
    Soporta paso variable o constante, interpolación y extrapolación.
    """
    valido, msg, x, y = _validar_puntos_interpolacion(x_vals, y_vals, min_puntos=2)
    if not valido:
        return {"exito": False, "mensaje": msg}

    n = len(x)
    # Matriz n x n para la tabla de diferencias divididas
    tabla = np.zeros((n, n), dtype=float)
    tabla[:, 0] = y

    pasos = []
    # Construcción iterativa de diferencias divididas de orden j = 1 .. n-1
    for j in range(1, n):
        for i in range(n - j):
            denom = x[i + j] - x[i]
            if abs(denom) < 1e-15:
                return {
                    "exito": False,
                    "mensaje": f"Denominador cercano a cero en orden {j}: x[{i + j}] - x[{i}] = {denom}.",
                }
            num = tabla[i + 1, j - 1] - tabla[i, j - 1]
            tabla[i, j] = num / denom
            pasos.append(
                {
                    "orden": j,
                    "fila": i,
                    "formula": f"f[x_{i}..x_{i+j}] = ({tabla[i+1, j-1]:.6g} - {tabla[i, j-1]:.6g}) / ({x[i+j]:.6g} - {x[i]:.6g})",
                    "valor": float(tabla[i, j]),
                }
            )

    # Coeficientes b_j = f[x_0, x_1, ..., x_j] (diagonal superior)
    coeficientes = [float(tabla[0, j]) for j in range(n)]

    # Evaluación numérica anidada (Horner generalizado para base de Newton)
    resultado = coeficientes[-1]
    for k in range(n - 2, -1, -1):
        resultado = resultado * (x_eval - x[k]) + coeficientes[k]

    # Construcción simbólica con SymPy (forma Newton y forma canónica expandida)
    x_sym = sp.Symbol("x")
    poli_newton_expr = sp.Float(coeficientes[0], 10)
    termino_prod = sp.Integer(1)
    for j in range(1, n):
        termino_prod = termino_prod * (x_sym - sp.Float(x[j - 1], 10))
        poli_newton_expr += sp.Float(coeficientes[j], 10) * termino_prod

    poli_expandido_expr = sp.expand(poli_newton_expr)

    # Detección de interpolación vs extrapolación
    x_min, x_max = float(np.min(x)), float(np.max(x))
    es_extrapolacion = bool(x_eval < x_min or x_eval > x_max)

    return {
        "exito": True,
        "mensaje": "Cálculo completado exitosamente.",
        "metodo": "Diferencias Divididas de Newton (Pieza 5.4.C)",
        "x": x.tolist(),
        "y": y.tolist(),
        "x_eval": float(x_eval),
        "resultado": float(resultado),
        "grado": n - 1,
        "tabla_diferencias": tabla.tolist(),
        "coeficientes_b": coeficientes,
        "pasos": pasos,
        "polinomio_newton_latex": sp.latex(poli_newton_expr),
        "polinomio_expandido_latex": sp.latex(poli_expandido_expr),
        "polinomio_geogebra": str(poli_expandido_expr).replace("**", "^"),
        "es_extrapolacion": es_extrapolacion,
        "rango_x": (x_min, x_max),
    }


# =============================================================================
# PIEZA 5.5.D: INTERPOLACIÓN LINEAL (SIMPLE Y SEGMENTARIA POR TRAMOS)
# =============================================================================
def interpolacion_lineal(x_vals, y_vals, x_eval: float) -> dict:
    """
    Realiza interpolación lineal simple (si n = 2) o interpolación lineal
    segmentaria por tramos (si n > 2; Nieves & Domínguez, Sec. 5.1 y 5.7).
    Ordena los nodos por abscisa creciente, construye cada recta S_k(x) en [x_k, x_{k+1}],
    identifica el subintervalo activo y evalúa P_1(x_eval).
    """
    valido, msg, x, y = _validar_puntos_interpolacion(x_vals, y_vals, min_puntos=2)
    if not valido:
        return {"exito": False, "mensaje": msg}

    # Ordenar pares (x_i, y_i) de forma ascendente respecto a X
    orden = np.argsort(x)
    x = x[orden]
    y = y[orden]
    n = len(x)

    segmentos = []
    for k in range(n - 1):
        dx = x[k + 1] - x[k]
        if abs(dx) < 1e-15:
            return {
                "exito": False,
                "mensaje": f"División por cero en tramo {k}: x[{k+1}] - x[{k}] = 0.",
            }
        pendiente = (y[k + 1] - y[k]) / dx
        intercepto = y[k] - pendiente * x[k]
        segmentos.append(
            {
                "tramo": k + 1,
                "x0": float(x[k]),
                "x1": float(x[k + 1]),
                "y0": float(y[k]),
                "y1": float(y[k + 1]),
                "pendiente": float(pendiente),
                "intercepto": float(intercepto),
                "ecuacion_texto": f"S_{k+1}(x) = {y[k]:.6g} + ({pendiente:.6g})*(x - {x[k]:.6g})",
                "ecuacion_canonica": f"{pendiente:.8g}*x + ({intercepto:.8g})",
            }
        )

    # Localizar subintervalo activo [x_k, x_{k+1}]
    es_extrapolacion = False
    tipo_extr = ""
    if x_eval < x[0]:
        idx_activo = 0
        es_extrapolacion = True
        tipo_extr = "Extrapolación hacia la izquierda (x_eval < x_min)"
    elif x_eval > x[-1]:
        idx_activo = n - 2
        es_extrapolacion = True
        tipo_extr = "Extrapolación hacia la derecha (x_eval > x_max)"
    else:
        idx_activo = 0
        for k in range(n - 1):
            if x[k] <= x_eval <= x[k + 1]:
                idx_activo = k
                break

    seg = segmentos[idx_activo]
    resultado = seg["y0"] + seg["pendiente"] * (x_eval - seg["x0"])

    # Expresión condicional para GeoGebra
    if len(segmentos) == 1:
        geogebra_expr = seg["ecuacion_canonica"]
    else:
        # Construcción anidada Si(x <= x_1, S_1, Si(x <= x_2, S_2, ..., S_{n-1}))
        geogebra_expr = segmentos[-1]["ecuacion_canonica"]
        for k in range(len(segmentos) - 2, -1, -1):
            s_k = segmentos[k]
            geogebra_expr = f"If(x <= {s_k['x1']}, {s_k['ecuacion_canonica']}, {geogebra_expr})"

    return {
        "exito": True,
        "mensaje": "Interpolación lineal calculada exitosamente.",
        "metodo": "Interpolación Lineal (Pieza 5.5.D)",
        "x": x.tolist(),
        "y": y.tolist(),
        "x_eval": float(x_eval),
        "resultado": float(resultado),
        "tramo_activo": seg,
        "segmentos": segmentos,
        "es_extrapolacion": es_extrapolacion,
        "advertencia_extrapolacion": tipo_extr,
        "polinomio_geogebra": geogebra_expr,
    }
