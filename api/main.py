#api/main.py
import math
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from api.latex_parser import (
    LatexParseError,
    evaluar_escalar_latex,
    latex_a_sympy_info,
)
from api.schemas import (
    Modulo1ErroresRequest,
    Modulo2NoLinealesRequest,
    Modulo3SistemasRequest,
    Modulo5InterpolacionRequest,
    Modulo6ProyeccionesRequest,
    PDFExportRequest,
    ParseLatexRequest,
    ScalarCalcRequest,
)
from engine.errores import ErroresEngine
from engine.interpolacion import (
    InterpolacionEngine,
    interpolacion_diferencias_divididas,
    interpolacion_lineal,
)
from engine.no_lineales import NoLinealesEngine
from engine.pdf_generator import PDFReportEngine
from engine.proyecciones import (
    comparar_modelos_proyeccion,
    pronostico_series_tiempo,
    regresion_exponencial,
    regresion_lineal_simple,
    regresion_logaritmica,
    regresion_polinomial,
    regresion_potencial,
)
from engine.sistemas_lineales import SistemasLinealesEngine

app = FastAPI(
    title="MNU411 API — Calculadora Científica de Métodos Numéricos",
    description="Puente REST entre la interfaz PWA LaTeX y el motor matemático MNU411.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sanitizar_json(obj: Any) -> Any:
    """Convierte tipos NumPy y valores NaN/Inf a tipos nativos seguros para JSON."""
    if isinstance(obj, dict):
        return {str(k): _sanitizar_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitizar_json(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return _sanitizar_json(obj.tolist())
    if isinstance(obj, (np.floating, float)):
        val = float(obj)
        return None if (math.isnan(val) or math.isinf(val)) else val
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    return obj


# =============================================================================
# UTILIDADES DE TRADUCCIÓN LATEX Y CALCULADORA ESTÁNDAR
# =============================================================================
@app.get("/api/health")
def health_check():
    return {"status": "ok", "sistema": "MNU411 v2.0"}


@app.post("/api/parse-latex")
def api_parse_latex(req: ParseLatexRequest):
    try:
        info = latex_a_sympy_info(req.latex, ans_val=req.ans)
        return {
            "exito": True,
            "sympy_str": info["sympy_str"],
            "geogebra_str": info["geogebra_str"],
            "latex_normalizado": info["latex_normalizado"],
            "variables": info["variables"],
        }
    except LatexParseError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/calc/scalar")
def api_calc_scalar(req: ScalarCalcRequest):
    try:
        res = evaluar_escalar_latex(req.latex, ans_val=req.ans)
        return {"exito": True, **res}
    except LatexParseError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# MÓDULO 1: ANÁLISIS DE ERRORES
# =============================================================================
@app.post("/api/m1/errores")
def api_modulo_1(req: Modulo1ErroresRequest):
    try:
        if req.tipo == "absoluto":
            if req.x is None or req.x_bar is None:
                raise ValueError("Se requieren 'x' y 'x_bar'.")
            val = ErroresEngine.error_absoluto(req.x, req.x_bar)
            return {"exito": True, "tipo": req.tipo, "resultado": val}

        if req.tipo == "relativo":
            if req.x is None or req.x_bar is None:
                raise ValueError("Se requieren 'x' y 'x_bar'.")
            val = ErroresEngine.error_relativo(req.x, req.x_bar)
            return {"exito": True, "tipo": req.tipo, "resultado": val}

        if req.tipo == "porcentual":
            if req.x is None or req.x_bar is None:
                raise ValueError("Se requieren 'x' y 'x_bar'.")
            val = ErroresEngine.error_porcentual(req.x, req.x_bar)
            return {"exito": True, "tipo": req.tipo, "resultado": val}

        if req.tipo == "redondeo":
            cota = ErroresEngine.cota_redondeo(req.d or 4)
            resp = {"exito": True, "tipo": req.tipo, "cota_teorica": cota}
            if req.x is not None and req.x_bar is not None:
                ea = ErroresEngine.error_absoluto(req.x, req.x_bar)
                resp["error_absoluto"] = ea
                resp["cumple_cota"] = ea <= cota
            return resp

        if req.tipo == "taylor":
            if not req.func_latex:
                raise ValueError("Debe ingresar la función f(x) en pantalla.")
            info = latex_a_sympy_info(req.func_latex)
            res = ErroresEngine.error_truncamiento_taylor(
                info["sympy_str"], req.x0 or 0.0, req.x_eval or 0.5, req.orden or 3
            )
            return _sanitizar_json(
                {
                    "exito": True,
                    "tipo": req.tipo,
                    "sympy_str": info["sympy_str"],
                    "geogebra_str": info["geogebra_str"],
                    "polinomio_latex": res["polinomio_latex"],
                    "val_real": res["val_real"],
                    "val_aprox": res["val_aprox"],
                    "error_truncamiento": res["error_truncamiento"],
                    "cota_teorica": res["cota_teorica"],
                    "cumple_cota": res["cumple_cota"],
                }
            )

        if req.tipo == "propagacion":
            if not req.func_latex:
                raise ValueError("Debe ingresar la función multivariable en pantalla.")
            info = latex_a_sympy_info(req.func_latex)
            valores = req.valores or {}
            errores = req.errores or {}
            faltantes = [v for v in info["variables"] if v not in valores or v not in errores]
            if faltantes:
                return {
                    "exito": False,
                    "requiere_variables": True,
                    "variables": info["variables"],
                    "mensaje": f"Ingrese valor y error para: {', '.join(faltantes)}",
                }
            res = ErroresEngine.propagacion_error(info["sympy_str"], valores, errores)
            detalles_limpios = [
                {
                    "variable": d["variable"],
                    "derivada_latex": d["derivada_latex"],
                    "valor_evaluado": d["valor_evaluado"],
                    "error_variable": d["error_variable"],
                    "aporte_error": d["aporte_error"],
                }
                for d in res["detalles"]
            ]
            return _sanitizar_json(
                {
                    "exito": True,
                    "tipo": req.tipo,
                    "variables": info["variables"],
                    "valor_nominal": res["valor_nominal"],
                    "error_total": res["error_total"],
                    "detalles": detalles_limpios,
                    "resultado_intervalo": res["resultado_intervalo"],
                }
            )

    except (LatexParseError, ValueError, ZeroDivisionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en Módulo 1: {e}")


# =============================================================================
# MÓDULO 2: ECUACIONES NO LINEALES
# =============================================================================
@app.post("/api/m2/no-lineales")
def api_modulo_2(req: Modulo2NoLinealesRequest):
    try:
        info = latex_a_sympy_info(req.func_latex)
        func_str = info["sympy_str"]

        if req.metodo == "punto_fijo":
            if req.x0 is None:
                raise ValueError("Se requiere el valor inicial x₀.")
            res = NoLinealesEngine.punto_fijo(func_str, req.x0, req.tol, req.max_iter)
        elif req.metodo == "biseccion":
            if req.a is None or req.b is None:
                raise ValueError("Se requieren los extremos a y b.")
            res = NoLinealesEngine.biseccion(func_str, req.a, req.b, req.tol, req.max_iter)
        elif req.metodo == "regula_falsi":
            if req.a is None or req.b is None:
                raise ValueError("Se requieren los extremos a y b.")
            res = NoLinealesEngine.regula_falsi(func_str, req.a, req.b, req.tol, req.max_iter)
        elif req.metodo == "secante":
            if req.x0 is None or req.x1 is None:
                raise ValueError("Se requieren los dos puntos iniciales x₀ y x₁.")
            res = NoLinealesEngine.secante(func_str, req.x0, req.x1, req.tol, req.max_iter)
        elif req.metodo == "newton_1":
            if req.x0 is None:
                raise ValueError("Se requiere el valor inicial x₀.")
            res = NoLinealesEngine.newton_raphson_1(func_str, req.x0, req.tol, req.max_iter)
        else:
            if req.x0 is None:
                raise ValueError("Se requiere el valor inicial x₀.")
            res = NoLinealesEngine.newton_raphson_2(func_str, req.x0, req.tol, req.max_iter)

        res["exito"] = True
        res["sympy_str"] = func_str
        res["geogebra_str"] = info["geogebra_str"]
        return _sanitizar_json(res)

    except (LatexParseError, ValueError, ZeroDivisionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en Módulo 2: {e}")


# =============================================================================
# MÓDULO 3: SISTEMAS DE ECUACIONES LINEALES
# =============================================================================
@app.post("/api/m3/sistemas")
def api_modulo_3(req: Modulo3SistemasRequest):
    try:
        if req.metodo == "gauss":
            res = SistemasLinealesEngine.eliminacion_gaussiana(req.A, req.b)
        elif req.metodo == "gauss_jordan":
            res = SistemasLinealesEngine.gauss_jordan(req.A, req.b)
        elif req.metodo == "jacobi":
            res = SistemasLinealesEngine.jacobi(
                req.A, req.b, req.x0, req.tol, req.max_iter, req.tipo_error
            )
        else:
            res = SistemasLinealesEngine.gauss_seidel(
                req.A, req.b, req.x0, req.tol, req.max_iter, req.tipo_error
            )

        res["exito"] = True
        return _sanitizar_json(res)

    except (ValueError, ZeroDivisionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en Módulo 3: {e}")


# =============================================================================
# MÓDULO 5: INTERPOLACIÓN FUNCIONAL
# =============================================================================
@app.post("/api/m5/interpolacion")
def api_modulo_5(req: Modulo5InterpolacionRequest):
    try:
        if req.metodo in ("newton_adelante", "newton_atras", "lagrange"):
            puntos_eval = req.x_evals if (req.x_evals and len(req.x_evals) > 0) else req.x_eval
            if req.metodo == "newton_adelante":
                res = InterpolacionEngine.newton_adelante(
                    req.x_vals,
                    req.y_vals,
                    req.x_eval,
                    x_evals=req.x_evals,
                    ordenes=req.ordenes,
                    func_exacta=req.func_exacta,
                    factor_conversion=req.factor_conversion,
                    decimales=req.decimales,
                )
            elif req.metodo == "newton_atras":
                res = InterpolacionEngine.newton_atras(
                    req.x_vals,
                    req.y_vals,
                    req.x_eval,
                    x_evals=req.x_evals,
                    ordenes=req.ordenes,
                    func_exacta=req.func_exacta,
                    factor_conversion=req.factor_conversion,
                    decimales=req.decimales,
                )
            else:
                res = InterpolacionEngine.lagrange(
                    req.x_vals,
                    req.y_vals,
                    puntos_eval,
                    ordenes=req.ordenes,
                    func_exacta=req.func_exacta,
                    decimales=req.decimales,
                )

            res["exito"] = True
            res["resultado"] = res["solucion"]
            if not res.get("polinomio_geogebra"):
                res_poli = interpolacion_diferencias_divididas(req.x_vals, req.y_vals, req.x_eval)
                res["polinomio_geogebra"] = (
                    res_poli["polinomio_geogebra"] if res_poli.get("exito") else None
                )
                res["polinomio_expandido_latex"] = (
                    res_poli["polinomio_expandido_latex"] if res_poli.get("exito") else None
                )
            return _sanitizar_json(res)

        if req.metodo == "diferencias_divididas":
            res = interpolacion_diferencias_divididas(
                req.x_vals,
                req.y_vals,
                req.x_eval,
                x_evals=req.x_evals,
                ordenes=req.ordenes,
                func_exacta=req.func_exacta,
                decimales=req.decimales,
            )
        else:
            res = interpolacion_lineal(req.x_vals, req.y_vals, req.x_eval)

        if not res.get("exito"):
            raise ValueError(res.get("mensaje", "Error en interpolación."))
        return _sanitizar_json(res)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en Módulo 5: {e}")


# =============================================================================
# MÓDULO 6: PROYECCIONES Y SERIES DE TIEMPO
# =============================================================================
@app.post("/api/m6/proyecciones")
def api_modulo_6(req: Modulo6ProyeccionesRequest):
    try:
        if req.metodo == "lineal":
            res = regresion_lineal_simple(req.x_vals, req.y_vals, req.x_eval)
        elif req.metodo == "polinomial":
            res = regresion_polinomial(req.x_vals, req.y_vals, req.grado, req.x_eval)
        elif req.metodo == "exponencial":
            res = regresion_exponencial(req.x_vals, req.y_vals, req.x_eval)
        elif req.metodo == "potencial":
            res = regresion_potencial(req.x_vals, req.y_vals, req.x_eval)
        elif req.metodo == "logaritmica":
            res = regresion_logaritmica(req.x_vals, req.y_vals, req.x_eval)
        elif req.metodo == "comparar":
            res = comparar_modelos_proyeccion(req.x_vals, req.y_vals, req.x_eval, req.grado)
        else:
            res = pronostico_series_tiempo(
                y_vals=req.y_vals,
                submetodo=req.submetodo_ts,
                ventana_k=req.ventana_k,
                pesos=req.pesos,
                alpha=req.alpha,
                beta=req.beta,
                horizonte_h=req.horizonte_h,
                periodo_estacional=req.periodo_estacional,
                t_vals=req.x_vals,
            )

        if not res.get("exito"):
            raise ValueError(res.get("mensaje", "Error en proyección."))
        return _sanitizar_json(res)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno en Módulo 6: {e}")


# =============================================================================
# MÓDULO 4: EXPORTACIÓN PDF ACADÉMICA
# =============================================================================
@app.post("/api/m4/pdf")
def api_generar_pdf(req: PDFExportRequest):
    try:
        pdf_bytes = PDFReportEngine.generar_reporte_pdf(
            titulo_metodo=req.titulo_metodo,
            entradas_dict=req.entradas_dict,
            resultado_str=req.resultado_str,
            iteraciones_list=req.iteraciones_list,
            pasos_matriz_list=req.pasos_matriz_list,
        )
        nombre_archivo = f"Reporte_{req.titulo_metodo[:24].replace(' ', '_')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar PDF: {e}")


# Montar el frontend PWA en la raíz si el directorio ya existe (Pieza 2)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
