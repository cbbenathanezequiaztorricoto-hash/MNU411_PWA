#api/schemas.py
from typing import Any, Literal
from pydantic import BaseModel, Field


class ParseLatexRequest(BaseModel):
    latex: str = Field(..., min_length=1, description="Expresión LaTeX desde MathLive")
    ans: float | None = Field(default=None, description="Valor en memoria Ans")


class ScalarCalcRequest(BaseModel):
    latex: str = Field(..., min_length=1)
    ans: float | None = None


# -----------------------------------------------------------------------------
# MÓDULO 1: ANÁLISIS DE ERRORES
# -----------------------------------------------------------------------------
class Modulo1ErroresRequest(BaseModel):
    tipo: Literal[
        "absoluto",
        "relativo",
        "porcentual",
        "redondeo",
        "taylor",
        "propagacion",
    ]
    x: float | None = None
    x_bar: float | None = None
    d: int | None = Field(default=4, ge=1, le=15)
    func_latex: str | None = None
    x0: float | None = 0.0
    x_eval: float | None = 0.5
    orden: int | None = Field(default=3, ge=1, le=20)
    valores: dict[str, float] | None = None
    errores: dict[str, float] | None = None


# -----------------------------------------------------------------------------
# MÓDULO 2: ECUACIONES NO LINEALES
# -----------------------------------------------------------------------------
class Modulo2NoLinealesRequest(BaseModel):
    metodo: Literal[
        "punto_fijo",
        "biseccion",
        "regula_falsi",
        "secante",
        "newton_1",
        "newton_2",
    ]
    func_latex: str = Field(..., min_length=1)
    a: float | None = None
    b: float | None = None
    x0: float | None = None
    x1: float | None = None
    tol: float = Field(default=0.001, gt=0)
    max_iter: int = Field(default=30, ge=1, le=500)


# -----------------------------------------------------------------------------
# MÓDULO 3: SISTEMAS DE ECUACIONES LINEALES
# -----------------------------------------------------------------------------
class Modulo3SistemasRequest(BaseModel):
    metodo: Literal["gauss", "gauss_jordan", "jacobi", "gauss_seidel"]
    A: list[list[float]]
    b: list[float]
    x0: list[float] | None = None
    tol: float = Field(default=1e-4, gt=0)
    max_iter: int = Field(default=30, ge=1, le=500)
    tipo_error: Literal["residuo", "distancia"] = "residuo"


# -----------------------------------------------------------------------------
# MÓDULO 5: INTERPOLACIÓN FUNCIONAL
# -----------------------------------------------------------------------------
class Modulo5InterpolacionRequest(BaseModel):
    metodo: Literal[
        "newton_adelante",
        "newton_atras",
        "lagrange",
        "diferencias_divididas",
        "lineal",
    ]
    x_vals: list[float] = Field(..., min_length=2)
    y_vals: list[float] = Field(..., min_length=2)
    x_eval: float


# -----------------------------------------------------------------------------
# MÓDULO 6: PROYECCIONES Y SERIES DE TIEMPO
# -----------------------------------------------------------------------------
class Modulo6ProyeccionesRequest(BaseModel):
    metodo: Literal[
        "lineal",
        "polinomial",
        "exponencial",
        "potencial",
        "logaritmica",
        "comparar",
        "series_tiempo",
    ]
    x_vals: list[float] = Field(..., min_length=2)
    y_vals: list[float] = Field(..., min_length=2)
    x_eval: float = 0.0
    grado: int = Field(default=2, ge=1, le=10)
    submetodo_ts: Literal["PMS", "PMP", "SES", "HOLT", "ESTACIONAL"] = "SES"
    ventana_k: int = Field(default=3, ge=1, le=30)
    pesos: list[float] | None = None
    alpha: float = Field(default=0.35, gt=0.0, le=1.0)
    beta: float = Field(default=0.15, ge=0.0, le=1.0)
    horizonte_h: int = Field(default=3, ge=1, le=120)
    periodo_estacional: int = Field(default=4, ge=2, le=24)


# -----------------------------------------------------------------------------
# MÓDULO 4: EXPORTACIÓN PDF ACADÉMICA
# -----------------------------------------------------------------------------
class PDFExportRequest(BaseModel):
    titulo_metodo: str
    entradas_dict: dict[str, Any]
    resultado_str: str
    iteraciones_list: list[dict[str, Any]] | None = None
    pasos_matriz_list: list[dict[str, Any]] | None = None
