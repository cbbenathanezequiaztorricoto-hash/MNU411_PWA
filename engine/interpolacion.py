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
    # MOTOR UNIFICADO PARA DIFERENCIAS FINITAS (ADELANTE Y ATRÁS — A.3 HITO 4)
    # -------------------------------------------------------------------------
    @staticmethod
    def _resolver_newton_finitas(
        x_vals,
        y_vals,
        xp,
        direccion: str = "adelante",
        x_evals=None,
        ordenes=None,
        func_exacta: str | None = None,
        factor_conversion: float | None = None,
        decimales: int = 6,
        imprimir_consola: bool = True,
    ) -> dict:
        x, y = InterpolacionEngine._validar_datos_base(x_vals, y_vals)
        n = len(x)
        n_max = n - 1
        dec = int(decimales)
        es_adelante = direccion == "adelante"
        simbolo = "Δ" if es_adelante else "∇"
        nombre_metodo = (
            "Interpolación de Newton hacia Adelante"
            if es_adelante
            else "Interpolación de Newton hacia Atrás"
        )

        # Lista consolidada de puntos a evaluar
        if x_evals is not None and len(x_evals) > 0:
            puntos_eval = [InterpolacionEngine._parsear_escalar(v, "x_evals") for v in x_evals]
        elif isinstance(xp, (list, tuple, np.ndarray)):
            puntos_eval = [InterpolacionEngine._parsear_escalar(v, "xp") for v in xp]
            if not puntos_eval:
                raise ValueError("Debe proporcionar al menos un punto x_p a evaluar.")
        else:
            puntos_eval = [InterpolacionEngine._parsear_escalar(xp, "xp")]

        # Validar paso constante h y rango para cada punto objetivo
        h = InterpolacionEngine._validar_paso_constante(x, puntos_eval[0])
        for pt in puntos_eval[1:]:
            InterpolacionEngine._validar_paso_constante(x, pt)

        if ordenes is not None and len(ordenes) > 0:
            ordenes_lista = sorted({int(g) for g in ordenes if 1 <= int(g) <= n_max})
            if not ordenes_lista:
                raise ValueError(f"Los órdenes solicitados deben estar entre 1 y {n_max}.")
        else:
            ordenes_lista = [n_max]

        factor_conv = None
        if factor_conversion is not None:
            factor_conv = InterpolacionEngine._parsear_escalar(
                factor_conversion, "factor_conversion"
            )
            if abs(factor_conv) < 1e-15:
                raise ValueError("El factor de conversión no puede ser cero.")

        # Matriz de diferencias finitas completa
        diff = np.full((n, n), np.nan)
        diff[:, 0] = y
        if es_adelante:
            for k in range(1, n):
                for i in range(n - k):
                    diff[i, k] = diff[i + 1, k - 1] - diff[i, k - 1]
            x_base = float(x[0])
            dif_diagonal = [float(diff[0, k]) for k in range(n)]
        else:
            for k in range(1, n):
                for i in range(k, n):
                    diff[i, k] = diff[i, k - 1] - diff[i - 1, k - 1]
            x_base = float(x[-1])
            dif_diagonal = [float(diff[n - 1, k]) for k in range(n)]

        # Tabla tabular para UI y reporte PDF
        tabla_diferencias = []
        for i in range(n):
            fila = {
                "i": i,
                "x_i": round(float(x[i]), dec),
                "f(x_i)": round(float(diff[i, 0]), dec),
            }
            for k in range(1, n):
                col_name = f"{simbolo}^{k}f"
                fila[col_name] = None if np.isnan(diff[i, k]) else round(float(diff[i, k]), dec)
            tabla_diferencias.append(fila)

        def _evaluar_newton_finito_orden(x_target: float, g: int):
            p_val = (x_target - x_base) / h
            acc = dif_diagonal[0]
            terms = [
                {
                    "orden": 0,
                    "diferencia": round(dif_diagonal[0], dec),
                    "factor_P": 1.0,
                    "aporte": round(acc, dec),
                }
            ]
            prod_p = 1.0
            for k in range(1, g + 1):
                prod_p *= (p_val - (k - 1)) if es_adelante else (p_val + (k - 1))
                coef_p = prod_p / math.factorial(k)
                dk_y = dif_diagonal[k]
                aporte = coef_p * dk_y
                acc += aporte
                terms.append(
                    {
                        "orden": k,
                        "diferencia": round(dk_y, dec),
                        "factor_P": round(coef_p, dec),
                        "aporte": round(aporte, dec),
                    }
                )
            return float(acc), float(p_val), terms

        orden_principal = ordenes_lista[-1]
        resultados_puntos = []
        comparacion_ordenes = []
        analisis_errores_exactos = []
        terminos_principales = []
        p_principal = (puntos_eval[0] - x_base) / h

        for idx_p, x_target in enumerate(puntos_eval):
            valores_ord = {}
            estimaciones = {}
            estimaciones_conv = {}

            for g in ordenes_lista:
                val_g, p_val, terms_g = _evaluar_newton_finito_orden(x_target, g)
                valores_ord[g] = val_g
                estimaciones[f"P_{g}"] = round(val_g, dec)
                if factor_conv is not None:
                    estimaciones_conv[f"P_{g}_conv"] = round(val_g * factor_conv, dec)

                if idx_p == 0 and g == orden_principal:
                    terminos_principales = terms_g
                    p_principal = p_val

            val_ref = valores_ord[orden_principal]
            punto_info = {
                "x_p": round(x_target, dec),
                "P": round((x_target - x_base) / h, dec),
                "tipo": "Interpolación",
                "estimaciones": estimaciones,
                "valor_principal": round(val_ref, dec),
            }
            if factor_conv is not None:
                punto_info["estimaciones_convertidas"] = estimaciones_conv
                punto_info["valor_principal_convertido"] = round(val_ref * factor_conv, dec)
            resultados_puntos.append(punto_info)

            if len(ordenes_lista) >= 2:
                fila_comp = {"x_p": round(x_target, dec)}
                for idx_o in range(len(ordenes_lista) - 1):
                    g1 = ordenes_lista[idx_o]
                    g2 = ordenes_lista[idx_o + 1]
                    diff_ord = abs(valores_ord[g2] - valores_ord[g1])
                    fila_comp[f"E_P{g2}-P{g1}"] = float(f"{diff_ord:.{dec}e}")
                    if factor_conv is not None:
                        fila_comp[f"E_conv_P{g2}-P{g1}"] = float(
                            f"{(diff_ord * abs(factor_conv)):.{dec}e}"
                        )
                comparacion_ordenes.append(fila_comp)

            if func_exacta and str(func_exacta).strip():
                nodos_activos_x = x[: orden_principal + 1] if es_adelante else x[n - 1 - orden_principal :]
                err_e = InterpolacionEngine._evaluar_error_exacto_lagrange(
                    func_exacta, nodos_activos_x, x_target, val_ref, dec
                )
                err_e["x_p"] = round(x_target, dec)
                err_e["orden"] = orden_principal
                err_e["P_n(x_p)"] = round(val_ref, dec)
                analisis_errores_exactos.append(err_e)

        # Construcción simbólica SymPy del polinomio interpolador para KaTeX y GeoGebra
        x_sym = sp.Symbol("x")
        p_sym = (x_sym - sp.Float(x_base, 10)) / sp.Float(h, 10)

        def _construir_expr_sympy(g: int):
            expr_g = sp.Float(dif_diagonal[0], 10)
            prod_sym = sp.Integer(1)
            for k in range(1, g + 1):
                prod_sym *= (p_sym - (k - 1)) if es_adelante else (p_sym + (k - 1))
                expr_g += (
                    sp.Float(dif_diagonal[k], 10) * prod_sym / sp.factorial(k)
                )
            poly_obj = sp.Poly(sp.expand(expr_g), x_sym)
            expr_clean = sum(
                sp.Float(round(float(coef), 8), 8) * (x_sym ** deg)
                for (deg,), coef in poly_obj.terms()
                if abs(float(coef)) > 1e-12
            )
            return expr_clean if expr_clean != 0 else sp.Float(0.0, 4)

        poli_principal_expr = _construir_expr_sympy(orden_principal)
        curvas_extra = []
        for g in ordenes_lista:
            if g != orden_principal:
                expr_g = _construir_expr_sympy(g)
                curvas_extra.append(
                    {
                        "nombre": f"P_{g}",
                        "etiqueta": f"Orden {g}",
                        "geogebra": str(expr_g).replace("**", "^"),
                    }
                )

        # Reporte estándar de 5 bloques (Plantilla Hito 4)
        x_min, x_max = float(np.min(x)), float(np.max(x))
        lineas = [
            "=" * 68,
            f"MÉTODO: {nombre_metodo} (Orden(es): {ordenes_lista})",
            "=" * 68,
            "1. DATOS DE ENTRADA Y PARÁMETROS:",
            f"   - Total de nodos: n = {n} | Rango X: [{x_min:g}, {x_max:g}] | Paso constante h = {h:.{dec}f}",
            f"   - Nodo base x_0 = {x_base:g} ({'inicial' if es_adelante else 'final'})",
            f"   - Vector X: {[round(float(v), dec) for v in x]}",
            f"   - Vector Y: {[round(float(v), dec) for v in y]}",
            f"   - Punto(s) objetivo x_p: {[round(float(v), dec) for v in puntos_eval]}",
            f"   - Orden(es) evaluados: {ordenes_lista}",
        ]
        if factor_conv is not None:
            lineas.append(f"   - Factor de conversión aplicado: {factor_conv:g}")
        if func_exacta and str(func_exacta).strip():
            lineas.append(f"   - Función exacta de referencia: f(x) = {str(func_exacta).strip()}")

        lineas.extend(
            [
                "",
                f"2. TABLA DE CÁLCULOS INTERMEDIOS (DIFERENCIAS FINITAS {simbolo}^k f):",
            ]
        )
        header = f"   {'i':>3} | {'x_i':>12} | {'f(x_i)':>14}"
        for k in range(1, n):
            header += f" | {simbolo}^{k}f{'':>9}"
        lineas.append(header)
        lineas.append("   " + "-" * (len(header) - 3))
        for i in range(n):
            fila_txt = f"   {i:>3} | {float(x[i]):>12.{dec}f} | {float(diff[i, 0]):>14.{dec}f}"
            for k in range(1, n):
                if np.isnan(diff[i, k]):
                    fila_txt += f" | {'—':>14}"
                else:
                    fila_txt += f" | {float(diff[i, k]):>14.{dec}f}"
            lineas.append(fila_txt)
        lineas.append(
            f"   Diferencias activas ({simbolo}^k y_{'0' if es_adelante else n-1}): "
            f"{[round(d, dec) for d in dif_diagonal]}"
        )

        lineas.extend(
            [
                "",
                "3. DESARROLLO PASO A PASO (FÓRMULAS Y SUSTITUCIÓN):",
                f"   P = (x_p - ({x_base:g})) / {h:.{dec}f}",
            ]
        )
        for x_target in puntos_eval:
            p_val = (x_target - x_base) / h
            lineas.append(f"   >>> Punto x_p = {x_target:g} => P = {p_val:.{dec}f}:")
            for g in ordenes_lista:
                val_g, _, terms_g = _evaluar_newton_finito_orden(x_target, g)
                partes_sum = [f"{t['aporte']:.{dec}f}" for t in terms_g]
                lineas.append(
                    f"      P_{g}({x_target:g}) = {' + '.join(partes_sum)} = {val_g:.{dec}f}"
                )

        lineas.extend(
            [
                "",
                "4. ECUACIÓN / MODELO RESULTANTE:",
                f"   P_{orden_principal}(x) = {sp.latex(poli_principal_expr)}",
                "",
                "5. RESULTADOS, ANÁLISIS DE ERRORES Y PROYECCIÓN:",
            ]
        )
        for rp in resultados_puntos:
            est_str = " | ".join(f"{k} = {v:.{dec}f}" for k, v in rp["estimaciones"].items())
            lineas.append(f"   - En x_p = {rp['x_p']:g} (P = {rp['P']}): {est_str}")
            if factor_conv is not None:
                conv_str = " | ".join(
                    f"{k} = {v:.{dec}f}" for k, v in rp["estimaciones_convertidas"].items()
                )
                lineas.append(f"     Convertido (× {factor_conv:g}): {conv_str}")

        if comparacion_ordenes:
            lineas.append("   - Comparación entre órdenes consecutivos:")
            for co in comparacion_ordenes:
                det_c = " | ".join(
                    f"{k} = {v:.{dec}e}" for k, v in co.items() if k != "x_p" and v is not None
                )
                lineas.append(f"     * En x_p = {co['x_p']:g}: {det_c}")

        if analisis_errores_exactos:
            lineas.append("   - Análisis contra función exacta y cota teórica:")
            for err_e in analisis_errores_exactos:
                lineas.append(
                    f"     * En x_p = {err_e['x_p']:g}: f({err_e['x_p']:g}) = {err_e['f_real']:.{dec}f} | "
                    f"P_{err_e['orden']}({err_e['x_p']:g}) = {err_e['P_n(x_p)']:.{dec}f} | "
                    f"Ea = {err_e['error_absoluto']:.{dec}f} | Er = {err_e['error_relativo']}"
                )

        lineas.append(
            "   - Interpretación numérica: Método de diferencias finitas sobre malla equiespaciada "
            f"(h = {h:g}) centrado en el extremo {'superior' if es_adelante else 'inferior'} de la tabla."
        )
        lineas.append(
            "   - Significado físico/aplicado (completar según enunciado): [Ej: La magnitud interpolada en x_p representa ...]"
        )
        lineas.append("=" * 68)
        reporte_texto = "\n".join(lineas)

        if imprimir_consola:
            print(reporte_texto)

        primer_rp = resultados_puntos[0]
        solucion_final = (
            primer_rp["valor_principal_convertido"]
            if factor_conv is not None
            else primer_rp["valor_principal"]
        )

        return {
            "metodo": nombre_metodo,
            "solucion": solucion_final,
            "solucion_sin_convertir": primer_rp["valor_principal"],
            "factor_conversion": factor_conv,
            "xp": puntos_eval[0],
            "x_eval": puntos_eval[0],
            "x_evals": [round(float(v), dec) for v in puntos_eval],
            "ordenes": ordenes_lista,
            "x0": x_base,
            "h": round(h, dec),
            "P": round(p_principal, dec),
            "polinomio_expandido_latex": sp.latex(poli_principal_expr),
            "polinomio_geogebra": str(poli_principal_expr).replace("**", "^"),
            "curvas_extra": curvas_extra,
            "resultados_puntos": resultados_puntos,
            "comparacion_ordenes": comparacion_ordenes,
            "analisis_errores_exactos": analisis_errores_exactos,
            "reporte_texto": reporte_texto,
            "terminos": terminos_principales,
            "iteraciones": tabla_diferencias,
        }

    # -------------------------------------------------------------------------
    # 5.1.A NEWTON HACIA ADELANTE (TRIANGULAR SUPERIOR)
    # -------------------------------------------------------------------------
    @staticmethod
    def newton_adelante(
        x_vals,
        y_vals,
        xp,
        x_evals=None,
        ordenes=None,
        func_exacta: str | None = None,
        factor_conversion: float | None = None,
        decimales: int = 6,
        imprimir_consola: bool = True,
    ):
        return InterpolacionEngine._resolver_newton_finitas(
            x_vals=x_vals,
            y_vals=y_vals,
            xp=xp,
            direccion="adelante",
            x_evals=x_evals,
            ordenes=ordenes,
            func_exacta=func_exacta,
            factor_conversion=factor_conversion,
            decimales=decimales,
            imprimir_consola=imprimir_consola,
        )

    # -------------------------------------------------------------------------
    # 5.1.B NEWTON HACIA ATRÁS (TRIANGULAR INFERIOR)
    # -------------------------------------------------------------------------
    @staticmethod
    def newton_atras(
        x_vals,
        y_vals,
        xp,
        x_evals=None,
        ordenes=None,
        func_exacta: str | None = None,
        factor_conversion: float | None = None,
        decimales: int = 6,
        imprimir_consola: bool = True,
    ):
        return InterpolacionEngine._resolver_newton_finitas(
            x_vals=x_vals,
            y_vals=y_vals,
            xp=xp,
            direccion="atras",
            x_evals=x_evals,
            ordenes=ordenes,
            func_exacta=func_exacta,
            factor_conversion=factor_conversion,
            decimales=decimales,
            imprimir_consola=imprimir_consola,
        )

    # -------------------------------------------------------------------------
    # UTILIDADES ÁLGEBRA DE POLINOMIOS Y REPORTE PARA LAGRANGE (A.1)
    # -------------------------------------------------------------------------
    @staticmethod
    def _formatear_polinomio_texto(coefs_desc, dec: int = 6) -> str:
        grado = len(coefs_desc) - 1
        partes = []
        for idx, c in enumerate(coefs_desc):
            pot = grado - idx
            if abs(c) < 1e-13:
                continue
            signo = "-" if c < 0 else "+"
            val_abs = abs(c)
            if pot == 0:
                term = f"{val_abs:.{dec}f}"
            elif pot == 1:
                term = f"{val_abs:.{dec}f}*x"
            else:
                term = f"{val_abs:.{dec}f}*x^{pot}"
            if not partes:
                partes.append(f"-{term}" if c < 0 else term)
            else:
                partes.append(f" {signo} {term}")
        return "".join(partes) if partes else f"{0.0:.{dec}f}"

    @staticmethod
    def _seleccionar_nodos_lagrange(x: np.ndarray, y: np.ndarray, x_ref: float, orden: int):
        n_total = len(x)
        k_req = orden + 1
        if orden < 1 or k_req > n_total:
            raise ValueError(
                f"No se puede construir polinomio de orden {orden}: se requieren {k_req} nodos y hay {n_total}."
            )
        if k_req == n_total:
            idx_sel = np.arange(n_total)
        else:
            distancias = np.abs(x - x_ref)
            idx_cercanos = np.argsort(distancias, kind="mergesort")[:k_req]
            idx_sel = idx_cercanos
        # Ordenar los nodos seleccionados de forma ascendente por x_i para presentación limpia
        orden_asc = idx_sel[np.argsort(x[idx_sel])]
        return x[orden_asc], y[orden_asc], [int(i) for i in orden_asc]

    @staticmethod
    def _construir_lagrange_orden(x_sub: np.ndarray, y_sub: np.ndarray, dec: int = 6):
        m = len(x_sub) - 1
        p_poly = np.poly1d([0.0])
        bases_info = []

        for i in range(m + 1):
            li_poly = np.poly1d([1.0])
            num_factores = []
            den_factores = []
            denom_val = 1.0

            for j in range(m + 1):
                if i != j:
                    diff_ij = float(x_sub[i] - x_sub[j])
                    if abs(diff_ij) < 1e-15:
                        raise ValueError(f"División por cero en Lagrange: x[{i}] == x[{j}].")
                    li_poly = np.polymul(li_poly, np.poly1d([1.0, -float(x_sub[j])])) / diff_ij
                    denom_val *= diff_ij
                    xj_str = f"({x_sub[j]:g})" if x_sub[j] < 0 else f"{x_sub[j]:g}"
                    xi_str = f"({x_sub[i]:g})" if x_sub[i] < 0 else f"{x_sub[i]:g}"
                    num_factores.append(f"(x - {xj_str})")
                    den_factores.append(f"({xi_str} - {xj_str})")

            p_poly = np.polyadd(p_poly, float(y_sub[i]) * li_poly)
            li_fact_str = f"[{'·'.join(num_factores)}] / [{'·'.join(den_factores)}]"
            li_exp_str = InterpolacionEngine._formatear_polinomio_texto(li_poly.coeffs, dec)

            bases_info.append(
                {
                    "i": i,
                    "x_i": float(x_sub[i]),
                    "y_i": float(y_sub[i]),
                    "denominador": denom_val,
                    "poly_li": li_poly,
                    "L_i_factorizado": li_fact_str,
                    "L_i_expandido": li_exp_str,
                }
            )

        p_exp_str = InterpolacionEngine._formatear_polinomio_texto(p_poly.coeffs, dec)
        return p_poly, p_exp_str, bases_info

    @staticmethod
    def _evaluar_error_exacto_lagrange(
        func_exacta_str: str, x_sub: np.ndarray, xp: float, val_aprox: float, dec: int = 6
    ) -> dict:
        x_sym = sp.Symbol("x")
        expr_clean = func_exacta_str.strip().replace("^", "**")
        f_expr = sp.sympify(expr_clean, locals={"e": sp.E, "ln": sp.log})

        f_real = float(f_expr.evalf(subs={x_sym: xp}))
        ea = abs(f_real - val_aprox)
        er = (ea / abs(f_real)) if abs(f_real) > 1e-15 else float("nan")
        ep = er * 100.0 if not math.isnan(er) else float("nan")

        orden = len(x_sub) - 1
        df_next = sp.diff(f_expr, x_sym, orden + 1)
        a_int = float(min(np.min(x_sub), xp))
        b_int = float(max(np.max(x_sub), xp))
        grid_xi = np.linspace(a_int, b_int, 500)

        max_df = 0.0
        for xi_val in grid_xi:
            try:
                v = complex(df_next.evalf(subs={x_sym: float(xi_val)}))
                if math.isfinite(abs(v)):
                    max_df = max(max_df, abs(v))
            except Exception:
                continue

        prod_nodos = math.prod(abs(xp - float(xi)) for xi in x_sub)
        cota_error = (max_df / math.factorial(orden + 1)) * prod_nodos

        return {
            "funcion_exacta": str(f_expr),
            "derivada_orden_sup": str(df_next),
            "f_real": round(f_real, dec),
            "f_real_full": f_real,
            "error_absoluto": round(ea, dec),
            "error_relativo": round(er, dec) if not math.isnan(er) else None,
            "error_porcentual": round(ep, dec) if not math.isnan(ep) else None,
            "max_derivada_cota": round(max_df, dec),
            "prod_factores_cota": round(prod_nodos, dec),
            "cota_teorica": round(cota_error, dec),
            "cumple_cota": bool(ea <= cota_error + 1e-12),
        }

    # -------------------------------------------------------------------------
    # 5.1.C POLINOMIO DE APROXIMACIÓN DE LAGRANGE (A.1 — COMPLETO HITO 4)
    # -------------------------------------------------------------------------
    @staticmethod
    def lagrange(
        x_vals,
        y_vals,
        xp,
        ordenes=None,
        func_exacta: str | None = None,
        decimales: int = 6,
        imprimir_consola: bool = True,
    ):
        x, y = InterpolacionEngine._validar_datos_base(x_vals, y_vals)
        n = len(x)
        dec = int(decimales)

        if isinstance(xp, (list, tuple, np.ndarray)):
            x_evals = [InterpolacionEngine._parsear_escalar(v, "x_evals") for v in xp]
            if not x_evals:
                raise ValueError("Debe proporcionar al menos un punto x_p a evaluar.")
        else:
            x_evals = [InterpolacionEngine._parsear_escalar(xp, "xp")]

        if ordenes is not None and len(ordenes) > 0:
            ordenes_lista = [int(g) for g in ordenes]
        else:
            ordenes_lista = [n - 1]

        x_min, x_max = float(np.min(x)), float(np.max(x))
        desarrollo_ordenes = []
        resultados_puntos = []
        comparacion_ordenes = []
        analisis_errores_exactos = []

        # Para compatibilidad con UI/GeoGebra del orden principal (mayor grado solicitado)
        orden_principal = ordenes_lista[-1]
        desglose_principal = []
        p_poly_principal = np.poly1d([0.0])
        x_sub_principal = x

        for idx_p, x_target in enumerate(x_evals):
            es_extrap = bool(x_target < x_min or x_target > x_max)
            evals_por_orden = {}

            for g in ordenes_lista:
                x_sub, y_sub, idx_orig = InterpolacionEngine._seleccionar_nodos_lagrange(
                    x, y, x_target, g
                )
                p_poly, p_exp_str, bases_info = InterpolacionEngine._construir_lagrange_orden(
                    x_sub, y_sub, dec
                )

                val_xp = 0.0
                filas_xp = []
                for b in bases_info:
                    li_val = float(np.polyval(b["poly_li"], x_target))
                    aporte = li_val * b["y_i"]
                    val_xp += aporte
                    filas_xp.append(
                        {
                            "i": b["i"],
                            "x_i": round(b["x_i"], dec),
                            "f(x_i)": round(b["y_i"], dec),
                            "Fórmula L_i": b["L_i_factorizado"],
                            "L_i(x) expandido": b["L_i_expandido"],
                            "L_i(x*)": round(li_val, dec),
                            "L_i(x*)*f_i": round(aporte, dec),
                        }
                    )

                evals_por_orden[g] = {
                    "orden": g,
                    "valor": val_xp,
                    "valor_redondeado": round(val_xp, dec),
                    "polinomio_texto": p_exp_str,
                    "nodos_x": [round(float(v), dec) for v in x_sub],
                    "nodos_y": [round(float(v), dec) for v in y_sub],
                    "indices_originales": idx_orig,
                    "bases": bases_info,
                    "tabla_eval": filas_xp,
                }

                if idx_p == 0 and g == orden_principal:
                    desglose_principal = filas_xp
                    p_poly_principal = p_poly
                    x_sub_principal = x_sub

                if idx_p == 0:
                    desarrollo_ordenes.append(evals_por_orden[g])

            # Comparación automática entre órdenes consecutivos (ej. 3er vs 4to orden)
            for k_ord in range(1, len(ordenes_lista)):
                g_prev = ordenes_lista[k_ord - 1]
                g_curr = ordenes_lista[k_ord]
                v_prev = evals_por_orden[g_prev]["valor"]
                v_curr = evals_por_orden[g_curr]["valor"]
                err_ord = abs(v_curr - v_prev)
                err_rel_ord = (err_ord / abs(v_curr)) if abs(v_curr) > 1e-15 else float("nan")
                comparacion_ordenes.append(
                    {
                        "x_p": round(x_target, dec),
                        "orden_menor": g_prev,
                        "P_menor": round(v_prev, dec),
                        "orden_mayor": g_curr,
                        "P_mayor": round(v_curr, dec),
                        "error_entre_ordenes": round(err_ord, dec),
                        "error_rel_porcentual": round(err_rel_ord * 100.0, dec)
                        if not math.isnan(err_rel_ord)
                        else None,
                    }
                )

            # Error exacto y cota teórica si se proporciona f(x)
            err_exacto_info = None
            if func_exacta and str(func_exacta).strip():
                x_sub_top, _, _ = InterpolacionEngine._seleccionar_nodos_lagrange(
                    x, y, x_target, orden_principal
                )
                err_exacto_info = InterpolacionEngine._evaluar_error_exacto_lagrange(
                    func_exacta,
                    x_sub_top,
                    x_target,
                    evals_por_orden[orden_principal]["valor"],
                    dec,
                )
                err_exacto_info["x_p"] = round(x_target, dec)
                err_exacto_info["orden"] = orden_principal
                err_exacto_info["P_n(x_p)"] = round(evals_por_orden[orden_principal]["valor"], dec)
                analisis_errores_exactos.append(err_exacto_info)

            resultados_puntos.append(
                {
                    "x_p": round(x_target, dec),
                    "tipo": "Extrapolación" if es_extrap else "Interpolación",
                    "estimaciones": {
                        f"P_{g}({x_target:g})": evals_por_orden[g]["valor_redondeado"]
                        for g in ordenes_lista
                    },
                    "valor_principal": evals_por_orden[orden_principal]["valor_redondeado"],
                    "error_exacto": err_exacto_info,
                }
            )

        # Construcción simbólica SymPy para KaTeX y GeoGebra del orden principal
        x_sym = sp.Symbol("x")
        poli_lagrange_expr = sp.Integer(0)
        y_sub_principal = InterpolacionEngine._seleccionar_nodos_lagrange(
            x, y, x_evals[0], orden_principal
        )[1]
        for i in range(len(x_sub_principal)):
            li_sym = sp.Integer(1)
            for j in range(len(x_sub_principal)):
                if i != j:
                    li_sym *= (x_sym - sp.Float(float(x_sub_principal[j]), 10)) / sp.Float(
                        float(x_sub_principal[i] - x_sub_principal[j]), 10
                    )
            poli_lagrange_expr += sp.Float(float(y_sub_principal[i]), 10) * li_sym

        poli_expandido_expr = sum(
            sp.Float(round(float(coef), 8), 8) * (x_sym ** (orden_principal - idx))
            for idx, coef in enumerate(p_poly_principal.coeffs)
            if abs(float(coef)) > 1e-12
        )
        if poli_expandido_expr == 0:
            poli_expandido_expr = sp.Float(0.0, 4)

        # ---------------------------------------------------------------------
        # CONSTRUCCIÓN DEL REPORTE ESTÁNDAR DE 5 BLOQUES (PLANTILLA HITO 4)
        # ---------------------------------------------------------------------
        lineas = [
            "====================================================================",
            f"MÉTODO: Interpolación Polinomial de Lagrange (Grado(s): {ordenes_lista})",
            "====================================================================",
            "1. DATOS DE ENTRADA Y PARÁMETROS:",
            f"   - Total de nodos tabulados: n = {n} | Rango X: [{x_min:g}, {x_max:g}]",
            f"   - Vector X ingresado: {[round(float(v), dec) for v in x]}",
            f"   - Vector Y ingresado: {[round(float(v), dec) for v in y]}",
            f"   - Punto(s) objetivo x_p: {[round(v, dec) for v in x_evals]}",
            f"   - Grado(s) / Orden(es) evaluados: {ordenes_lista}",
        ]
        if func_exacta and str(func_exacta).strip():
            lineas.append(f"   - Función exacta de referencia: f(x) = {func_exacta.strip()}")

        lineas.append("")
        lineas.append("2. TABLA DE CÁLCULOS INTERMEDIOS Y SUMATORIAS:")
        for pt_res, x_target in zip(resultados_puntos, x_evals):
            for g in ordenes_lista:
                x_sub, y_sub, _ = InterpolacionEngine._seleccionar_nodos_lagrange(
                    x, y, x_target, g
                )
                _, _, bases_info = InterpolacionEngine._construir_lagrange_orden(x_sub, y_sub, dec)
                lineas.append(f"   [Evaluación en x_p = {x_target:g} — Orden {g} ({pt_res['tipo']})]")
                lineas.append(
                    f"   {'i':>3} | {'x_i':>12} | {'y_i = f(x_i)':>14} | {'L_i(x_p)':>14} | {'L_i(x_p)*y_i':>16}"
                )
                lineas.append("   " + "-" * 69)
                suma_li = 0.0
                suma_aporte = 0.0
                for b in bases_info:
                    li_v = float(np.polyval(b["poly_li"], x_target))
                    ap_v = li_v * b["y_i"]
                    suma_li += li_v
                    suma_aporte += ap_v
                    lineas.append(
                        f"   {b['i']:>3} | {b['x_i']:>12.{dec}f} | {b['y_i']:>14.{dec}f} | "
                        f"{li_v:>14.{dec}f} | {ap_v:>16.{dec}f}"
                    )
                lineas.append("   " + "-" * 69)
                lineas.append(
                    f"   {'Σ':>3} | {'':>12} | {'':>14} | {suma_li:>14.{dec}f} | {suma_aporte:>16.{dec}f}"
                )
                lineas.append("")

        lineas.append("3. DESARROLLO PASO A PASO (FÓRMULAS Y SUSTITUCIÓN):")
        for idx_p, x_target in enumerate(x_evals):
            for g in ordenes_lista:
                x_sub, y_sub, idx_orig = InterpolacionEngine._seleccionar_nodos_lagrange(
                    x, y, x_target, g
                )
                _, p_exp_str, bases_info = InterpolacionEngine._construir_lagrange_orden(
                    x_sub, y_sub, dec
                )
                lineas.append(
                    f"   >>> Punto x_p = {x_target:g} | Orden {g} (Nodos seleccionados: {[round(float(v), dec) for v in x_sub]}):"
                )
                for b in bases_info:
                    li_v = float(np.polyval(b["poly_li"], x_target))
                    lineas.append(f"   L_{b['i']}(x) = {b['L_i_factorizado']}")
                    lineas.append(f"   L_{b['i']}(x) [expandido] = {b['L_i_expandido']}")
                    lineas.append(
                        f"   L_{b['i']}({x_target:g}) = {li_v:.{dec}f}  =>  "
                        f"L_{b['i']}({x_target:g}) * y_{b['i']} = ({li_v:.{dec}f}) * ({b['y_i']:.{dec}f}) = {li_v * b['y_i']:.{dec}f}"
                    )
                terminos_sum = " + ".join(
                    f"({float(np.polyval(b['poly_li'], x_target)) * b['y_i']:.{dec}f})"
                    for b in bases_info
                )
                val_tot = sum(
                    float(np.polyval(b["poly_li"], x_target)) * b["y_i"] for b in bases_info
                )
                lineas.append(f"   Sustitución: P_{g}({x_target:g}) = {terminos_sum} = {val_tot:.{dec}f}")
                lineas.append("")

        lineas.append("4. ECUACIÓN / MODELO RESULTANTE:")
        vistos_ord = set()
        for x_target in x_evals:
            for g in ordenes_lista:
                x_sub, y_sub, _ = InterpolacionEngine._seleccionar_nodos_lagrange(
                    x, y, x_target, g
                )
                _, p_exp_str, _ = InterpolacionEngine._construir_lagrange_orden(x_sub, y_sub, dec)
                clave = (g, tuple(np.round(x_sub, 8)))
                if clave not in vistos_ord:
                    vistos_ord.add(clave)
                    lineas.append(f"   P_{g}(x) = {p_exp_str}")

        lineas.append("")
        lineas.append("5. RESULTADOS, ANÁLISIS DE ERRORES Y PROYECCIÓN:")
        for pt_res in resultados_puntos:
            est_str = " | ".join(
                f"{k} = {v:.{dec}f}" for k, v in pt_res["estimaciones"].items()
            )
            lineas.append(f"   - En x_p = {pt_res['x_p']:g} ({pt_res['tipo']}): {est_str}")

        if comparacion_ordenes:
            lineas.append("   - Comparación entre órdenes consecutivos:")
            for comp in comparacion_ordenes:
                lineas.append(
                    f"     * En x_p = {comp['x_p']:g}: |P_{comp['orden_mayor']} - P_{comp['orden_menor']}| = "
                    f"|{comp['P_mayor']:.{dec}f} - {comp['P_menor']:.{dec}f}| = {comp['error_entre_ordenes']:.{dec}f}"
                )

        if analisis_errores_exactos:
            lineas.append("   - Análisis contra función exacta y cota teórica:")
            for err_e in analisis_errores_exactos:
                lineas.append(
                    f"     * En x_p = {err_e['x_p']:g}: f({err_e['x_p']:g}) = {err_e['f_real']:.{dec}f} | "
                    f"P_{err_e['orden']}({err_e['x_p']:g}) = {err_e['P_n(x_p)']:.{dec}f}"
                )
                lineas.append(
                    f"       Ea = {err_e['error_absoluto']:.{dec}f} | "
                    f"Er = {err_e['error_relativo']} | Ep = {err_e['error_porcentual']}%"
                )
                lineas.append(
                    f"       Cota teórica |R_{err_e['orden']}| <= ({err_e['max_derivada_cota']:.{dec}f} / {math.factorial(err_e['orden'] + 1)}) * "
                    f"{err_e['prod_factores_cota']:.{dec}f} = {err_e['cota_teorica']:.{dec}f} "
                    f"({'CUMPLE' if err_e['cumple_cota'] else 'REVISAR'})"
                )

        lineas.append(
            "   - Interpretación numérica: El polinomio interpolador de Lagrange ajusta exactamente los "
            f"{orden_principal + 1} nodos seleccionados mediante combinación lineal de bases L_i(x)."
        )
        lineas.append(
            "   - Significado físico/aplicado (completar según enunciado): [Ej: La magnitud estimada en x_p representa ...]"
        )
        lineas.append("====================================================================")
        reporte_texto = "\n".join(lineas)

        if imprimir_consola:
            print(reporte_texto)

        primer_valor = resultados_puntos[0]["valor_principal"]
        es_extrap_principal = bool(x_evals[0] < x_min or x_evals[0] > x_max)

        return {
            "metodo": "Polinomio de Aproximación de Lagrange",
            "solucion": primer_valor,
            "x": x_evals[0],
            "x_eval": x_evals[0],
            "x_evals": [round(v, dec) for v in x_evals],
            "ordenes": ordenes_lista,
            "rango_x": [x_min, x_max],
            "es_extrapolacion": es_extrap_principal,
            "tipo_evaluacion": "Extrapolación" if es_extrap_principal else "Interpolación",
            "polinomio_latex": sp.latex(poli_lagrange_expr),
            "polinomio_expandido_latex": sp.latex(poli_expandido_expr),
            "polinomio_geogebra": str(poli_expandido_expr).replace("**", "^"),
            "resultados_puntos": resultados_puntos,
            "comparacion_ordenes": comparacion_ordenes,
            "analisis_errores_exactos": analisis_errores_exactos,
            "reporte_texto": reporte_texto,
            "iteraciones": desglose_principal,
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
def _calcular_tabla_dd_y_horner(x_sub: np.ndarray, y_sub: np.ndarray, xp: float):
    """Construye tabla de diferencias divididas y evalúa por Horner anidado."""
    m = len(x_sub)
    tabla_sub = np.zeros((m, m), dtype=float)
    tabla_sub[:, 0] = y_sub
    pasos_sub = []

    for j in range(1, m):
        for i in range(m - j):
            denom = float(x_sub[i + j] - x_sub[i])
            if abs(denom) < 1e-15:
                raise ValueError(
                    f"Denominador cercano a cero en orden {j}: x[{i + j}] - x[{i}] = {denom}."
                )
            num = float(tabla_sub[i + 1, j - 1] - tabla_sub[i, j - 1])
            tabla_sub[i, j] = num / denom
            pasos_sub.append(
                {
                    "orden": j,
                    "fila": i,
                    "formula": (
                        f"f[x_{i}..x_{i+j}] = ({tabla_sub[i+1, j-1]:.6g} - {tabla_sub[i, j-1]:.6g}) "
                        f"/ ({x_sub[i+j]:.6g} - {x_sub[i]:.6g})"
                    ),
                    "valor": float(tabla_sub[i, j]),
                }
            )

    coefs_b = [float(tabla_sub[0, j]) for j in range(m)]
    val_xp = float(coefs_b[-1])
    for k in range(m - 2, -1, -1):
        val_xp = val_xp * (float(xp) - float(x_sub[k])) + coefs_b[k]

    return tabla_sub, coefs_b, float(val_xp), pasos_sub


def interpolacion_diferencias_divididas(
    x_vals,
    y_vals,
    x_eval: float,
    x_evals: list[float] | None = None,
    ordenes: list[int] | None = None,
    func_exacta: str | None = None,
    decimales: int = 6,
) -> dict:
    """
    Calcula el polinomio interpolante de Newton mediante tabla de diferencias divididas
    (Algoritmos 5.3 y 5.4 de Nieves & Domínguez) y lo evalúa usando esquema anidado
    de Horner (Sec. 2.10). Soporta paso variable, múltiples x_p, múltiples órdenes
    y función exacta de referencia.
    """
    dec = int(decimales)
    valido, msg, x, y = _validar_puntos_interpolacion(x_vals, y_vals, min_puntos=2)
    if not valido:
        return {"exito": False, "mensaje": msg}

    try:
        x_eval_base = InterpolacionEngine._parsear_escalar(x_eval, "x_eval")
        if x_evals is not None and len(x_evals) > 0:
            puntos_eval = [InterpolacionEngine._parsear_escalar(v, "x_evals") for v in x_evals]
        else:
            puntos_eval = [x_eval_base]
    except ValueError as err:
        return {"exito": False, "mensaje": str(err)}

    n = len(x)
    n_max = n - 1
    if ordenes is not None and len(ordenes) > 0:
        ordenes_lista = sorted({int(g) for g in ordenes if 1 <= int(g) <= n_max})
        if not ordenes_lista:
            return {
                "exito": False,
                "mensaje": f"Los órdenes solicitados deben estar entre 1 y {n_max}.",
            }
    else:
        ordenes_lista = [n_max]

    try:
        tabla, coeficientes, resultado, pasos = _calcular_tabla_dd_y_horner(x, y, x_eval_base)
    except ValueError as err:
        return {"exito": False, "mensaje": str(err)}

    # Construcción simbólica con SymPy (forma Newton y forma canónica expandida)
    x_sym = sp.Symbol("x")
    poli_newton_expr = sp.Float(coeficientes[0], 10)
    termino_prod = sp.Integer(1)
    for j in range(1, n):
        termino_prod = termino_prod * (x_sym - sp.Float(float(x[j - 1]), 10))
        poli_newton_expr += sp.Float(coeficientes[j], 10) * termino_prod

    poli_expandido_raw = sp.expand(poli_newton_expr)
    poly_obj = sp.Poly(poli_expandido_raw, x_sym)
    poli_expandido_expr = sum(
        sp.Float(round(float(coef), 8), 8) * (x_sym ** deg)
        for (deg,), coef in poly_obj.terms()
        if abs(float(coef)) > 1e-12
    )
    if poli_expandido_expr == 0:
        poli_expandido_expr = sp.Float(0.0, 4)

    x_min, x_max = float(np.min(x)), float(np.max(x))
    es_extrapolacion = bool(x_eval_base < x_min or x_eval_base > x_max)

    # Parseo opcional de función exacta (soporta notación Python o LaTeX)
    f_expr = None
    error_parseo_exacta = None
    if func_exacta and str(func_exacta).strip():
        raw_fx = str(func_exacta).strip()
        try:
            f_expr = sp.sympify(raw_fx.replace("^", "**"), locals={"e": sp.E, "ln": sp.log})
        except Exception:
            try:
                from api.latex_parser import latex_a_sympy_info

                info_fx = latex_a_sympy_info(raw_fx)
                f_expr = info_fx["sympy_expr"]
            except Exception as err_fx:
                error_parseo_exacta = f"No se pudo interpretar func_exacta '{raw_fx}': {err_fx}"

    # Evaluación multi-punto x multi-orden (seleccionando nodos cercanos a cada x_p)
    resultados_puntos = []
    comparacion_ordenes = []
    analisis_errores_exactos = []

    for xp in puntos_eval:
        es_extrap_p = bool(xp < x_min or xp > x_max)
        estimaciones = {}
        valores_exactos_ord = {}

        for g in ordenes_lista:
            x_sub, y_sub, _ = InterpolacionEngine._seleccionar_nodos_lagrange(x, y, xp, g)
            _, _, val_g, _ = _calcular_tabla_dd_y_horner(x_sub, y_sub, xp)
            valores_exactos_ord[g] = val_g
            estimaciones[f"P_{g}"] = round(val_g, dec)

        orden_ref = ordenes_lista[-1]
        resultados_puntos.append(
            {
                "x_p": round(xp, dec),
                "tipo": "Extrapolación" if es_extrap_p else "Interpolación",
                "estimaciones": estimaciones,
                "valor_principal": round(valores_exactos_ord[orden_ref], dec),
            }
        )

        if len(ordenes_lista) >= 2:
            fila_comp = {"x_p": round(xp, dec)}
            for idx_o in range(len(ordenes_lista) - 1):
                g1 = ordenes_lista[idx_o]
                g2 = ordenes_lista[idx_o + 1]
                diff_ord = abs(valores_exactos_ord[g2] - valores_exactos_ord[g1])
                fila_comp[f"E_P{g2}-P{g1}"] = float(f"{diff_ord:.{dec}e}")
            comparacion_ordenes.append(fila_comp)

        if f_expr is not None:
            try:
                f_val = float(f_expr.evalf(subs={x_sym: xp}))
                fila_err = {"x_p": round(xp, dec), "f(x_p)_exacta": round(f_val, dec)}
                for g in ordenes_lista:
                    ea = abs(f_val - valores_exactos_ord[g])
                    er = (ea / abs(f_val)) if abs(f_val) > 1e-15 else float("nan")
                    fila_err[f"EA_P{g}"] = float(f"{ea:.{dec}e}")
                    fila_err[f"ER_P{g}"] = (
                        float(f"{er:.{dec}e}") if not math.isnan(er) else None
                    )
                    fila_err[f"EP_P{g}"] = (
                        round(er * 100.0, dec) if not math.isnan(er) else None
                    )
                analisis_errores_exactos.append(fila_err)
            except Exception as err_eval:
                analisis_errores_exactos.append({"x_p": round(xp, dec), "error": str(err_eval)})

    if error_parseo_exacta:
        analisis_errores_exactos.append({"error_parseo": error_parseo_exacta})

    # Reporte estándar de 5 bloques (Hito 4)
    lineas = [
        "=" * 68,
        f"MÉTODO: Diferencias Divididas de Newton (Orden(es): {ordenes_lista})",
        "=" * 68,
        "1. DATOS DE ENTRADA Y PARÁMETROS:",
        f"   - Total de nodos: n = {n} | Rango X: [{x_min:g}, {x_max:g}]",
        f"   - Vector X: {[round(float(v), dec) for v in x]}",
        f"   - Vector Y: {[round(float(v), dec) for v in y]}",
        f"   - Punto(s) a evaluar: {[round(float(v), dec) for v in puntos_eval]}",
        f"   - Orden(es) solicitado(s): {ordenes_lista}",
    ]
    if func_exacta and str(func_exacta).strip():
        lineas.append(f"   - Función exacta de referencia: f(x) = {str(func_exacta).strip()}")

    lineas.extend(
        [
            "",
            "2. TABLA DE CÁLCULOS INTERMEDIOS Y SUMATORIAS (DIFERENCIAS DIVIDIDAS):",
        ]
    )
    header = f"   {'i':>3} | {'x_i':>12} | {'f[x_i]':>14}"
    for k in range(1, n):
        header += f" | {k}ª DD{'':>8}"
    lineas.append(header)
    lineas.append("   " + "-" * (len(header) - 3))
    for i in range(n):
        fila = f"   {i:>3} | {float(x[i]):>12.{dec}f} | {float(y[i]):>14.{dec}f}"
        for k in range(1, n - i):
            fila += f" | {float(tabla[i, k]):>14.{dec}f}"
        for _ in range(n - i, n):
            fila += f" | {'—':>14}"
        lineas.append(fila)
    lineas.append(f"   Coeficientes diagonales b_k: {[round(c, dec) for c in coeficientes]}")
    lineas.append(
        f"   Sumatorias base: Σx_i = {float(np.sum(x)):.{dec}f} | Σy_i = {float(np.sum(y)):.{dec}f}"
    )

    lineas.extend(
        [
            "",
            "3. DESARROLLO PASO A PASO (FÓRMULAS Y SUSTITUCIÓN):",
            "   P_n(x) = b_0 + b_1(x - x_0) + b_2(x - x_0)(x - x_1) + ...",
        ]
    )
    for k, b_val in enumerate(coeficientes):
        lineas.append(f"   b_{k} = {b_val:.{dec}f}")

    for xp in puntos_eval:
        lineas.append(f"   >>> Evaluación en x_p = {xp:g}:")
        for g in ordenes_lista:
            x_sub, y_sub, _ = InterpolacionEngine._seleccionar_nodos_lagrange(x, y, xp, g)
            _, b_sub, val_g, _ = _calcular_tabla_dd_y_horner(x_sub, y_sub, xp)
            terminos = [f"{b_sub[0]:.{dec}f}"]
            prod = 1.0
            for k in range(1, g + 1):
                prod *= xp - float(x_sub[k - 1])
                terminos.append(f"{b_sub[k]:.{dec}f}·({prod:.{dec}f})")
            lineas.append(f"      P_{g}({xp:g}) = {' + '.join(terminos)} = {val_g:.{dec}f}")

    lineas.extend(
        [
            "",
            "4. ECUACIÓN / MODELO RESULTANTE:",
            f"   P_{n_max}(x) = {sp.latex(poli_expandido_expr)}",
            "",
            "5. RESULTADOS, ANÁLISIS DE ERRORES Y PROYECCIÓN:",
        ]
    )
    for rp in resultados_puntos:
        est = " | ".join(f"{k} = {v:.{dec}f}" for k, v in rp["estimaciones"].items())
        lineas.append(f"   - En x_p = {rp['x_p']:g} ({rp['tipo']}): {est}")

    if comparacion_ordenes:
        lineas.append("   - Comparación entre órdenes consecutivos:")
        for co in comparacion_ordenes:
            errs = " | ".join(
                f"{k} = {v:.{dec}e}" for k, v in co.items() if k != "x_p" and v is not None
            )
            lineas.append(f"      x_p = {co['x_p']:g}: {errs}")

    if analisis_errores_exactos and "error_parseo" not in analisis_errores_exactos[0]:
        lineas.append("   - Error vs función exacta f(x):")
        for ae in analisis_errores_exactos:
            detalles = " | ".join(
                f"{k} = {v}" for k, v in ae.items() if k != "x_p" and v is not None
            )
            lineas.append(f"      x_p = {ae['x_p']:g}: {detalles}")

    lineas.append(
        "   - Interpretación numérica: Las diferencias divididas construyen el mismo polinomio "
        "interpolador único de Newton sin exigir paso constante."
    )
    lineas.append(
        "   - Significado físico/aplicado (completar según enunciado): [Ej: El valor estimado en x_p representa ...]"
    )
    lineas.append("=" * 68)
    reporte_texto = "\n".join(lineas)

    return {
        "exito": True,
        "mensaje": "Cálculo completado exitosamente.",
        "metodo": "Diferencias Divididas de Newton (Pieza 5.4.C)",
        "x": x.tolist(),
        "y": y.tolist(),
        "x_eval": float(x_eval_base),
        "resultado": float(resultado),
        "grado": n_max,
        "tabla_diferencias": tabla.tolist(),
        "coeficientes_b": coeficientes,
        "pasos": pasos,
        "polinomio_newton_latex": sp.latex(poli_newton_expr),
        "polinomio_expandido_latex": sp.latex(poli_expandido_expr),
        "polinomio_geogebra": str(poli_expandido_expr).replace("**", "^"),
        "es_extrapolacion": es_extrapolacion,
        "rango_x": (x_min, x_max),
        "x_evals": [round(float(v), dec) for v in puntos_eval],
        "ordenes": ordenes_lista,
        "resultados_puntos": resultados_puntos,
        "comparacion_ordenes": comparacion_ordenes,
        "analisis_errores_exactos": analisis_errores_exactos,
        "reporte_texto": reporte_texto,
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
