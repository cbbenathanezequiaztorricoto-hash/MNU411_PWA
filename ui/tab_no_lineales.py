import json
import os
import pandas as pd
import streamlit as st
from engine.no_lineales import NoLinealesEngine
from engine.pdf_generator import PDFReportEngine


def _render_geogebra_raiz(
    func_str: str,
    raiz: float | None,
    es_punto_fijo: bool = False,
    x_ref: float = 0.0,
):
    """Renderiza GeoGebra con dimensiones enteras calculadas dinámicamente (sin pantalla blanca)."""
    expr_ggb = func_str.replace("**", "^")
    centro_x = raiz if raiz is not None else x_ref

    comandos = [
        f"f(x) = {expr_ggb}",
        "SetColor(f, 0, 102, 204)",
        "SetLineThickness(f, 4)",
    ]

    if es_punto_fijo:
        comandos.extend([
            "id(x) = x",
            "SetColor(id, 100, 116, 139)",
            "SetLineStyle(id, 1)",
        ])
        if raiz is not None:
            comandos.extend([
                f"Raiz = ({raiz}, {raiz})",
                "SetColor(Raiz, 220, 38, 38)",
                "SetPointSize(Raiz, 6)",
                "ShowLabel(Raiz, true)",
            ])
    elif raiz is not None:
        comandos.extend([
            f"Raiz = ({raiz}, 0)",
            "SetColor(Raiz, 220, 38, 38)",
            "SetPointSize(Raiz, 6)",
            "ShowLabel(Raiz, true)",
        ])

    comandos.append(f"SetCoordSystem({centro_x - 5}, {centro_x + 5}, -5, 5)")
    comandos_json = json.dumps(comandos)

    html_ggb = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8" />
        <script src="https://www.geogebra.org/apps/deployggb.js"></script>
    </head>
    <body style="margin:0; padding:0; background:#ffffff;">
        <div id="ggb-nl" style="width:100%; height:440px; border:1px solid #e2e8f0; border-radius:8px;"></div>
        <script>
            function initGGB() {{
                var el = document.getElementById('ggb-nl');
                if (!el || typeof GGBApplet === 'undefined') {{
                    setTimeout(initGGB, 150);
                    return;
                }}
                var ancho = el.offsetWidth || window.innerWidth || 680;
                var params = {{
                    "appName": "graphing",
                    "width": ancho,
                    "height": 440,
                    "showToolBar": true,
                    "showAlgebraInput": true,
                    "showMenuBar": false,
                    "enableRightClick": true,
                    "language": "es",
                    "appletOnLoad": function(api) {{
                        var cmds = {comandos_json};
                        cmds.forEach(function(cmd) {{
                            api.evalCommand(cmd);
                        }});
                    }}
                }};
                var applet = new GGBApplet(params, true);
                applet.inject('ggb-nl');
            }}
            initGGB();
        </script>
    </body>
    </html>
    """
    st.iframe(html_ggb, height=460)


def render_tab_no_lineales():
    st.subheader("Módulo 2: Ecuaciones No Lineales")

    gif_map = {
        "Método de Bisección": "media/biseccion.gif",
        "Método de Regula Falsi (Posición Falsa)": "media/falsi.gif",
        "Método de la Secante": "media/secante.gif",
        "Newton-Raphson (1er Orden)": "media/newton.gif",
        "Newton-Raphson (2do Orden)": "media/newton.gif",
        "Método de Punto Fijo": "media/metodo26.gif",
    }

    # --- BLOQUE SUPERIOR COMPACTO: ENTRADAS (SIN SCROLL) ---
    col_met, col_eq = st.columns([1.1, 1.4])
    with col_met:
        metodo = st.selectbox(
            "Método Numérico:",
            list(gif_map.keys()),
            key="sb_metodo_no_lineales",
        )
    with col_eq:
        es_pf = metodo == "Método de Punto Fijo"
        etiqueta_fn = "Función de iteración g(x):" if es_pf else "Función f(x) = 0:"
        val_default = "(x**2 - exp(x)) / 5" if es_pf else "x**3 - x - 2"
        func_str = st.text_input(etiqueta_fn, value=val_default, key="fn_nl_input")

    # Parámetros numéricos en una sola fila horizontal
    c1, c2, c3, c4 = st.columns(4)
    val_a, val_b, x0, x_prev, x_curr = 1.0, 2.0, 0.0, 0.0, 1.0

    if metodo in ["Método de Bisección", "Método de Regula Falsi (Posición Falsa)"]:
        val_a = c1.number_input("Extremo a (x₀):", value=1.0, format="%.4f", key="nl_a")
        val_b = c2.number_input("Extremo b (x₁):", value=2.0, format="%.4f", key="nl_b")
    elif metodo == "Método de la Secante":
        x_prev = c1.number_input("Punto x_{n-1}:", value=0.0, format="%.4f", key="nl_sp")
        x_curr = c2.number_input("Punto x_n:", value=1.0, format="%.4f", key="nl_sc")
    else:
        x0 = c1.number_input("Valor inicial x₀:", value=0.0, format="%.4f", key="nl_x0")
        c2.markdown("**Fórmula:**")
        if es_pf:
            c2.latex(r"x_{i+1}=g(x_i)")
        elif "1er" in metodo:
            c2.latex(r"x_{i+1}=x_i-\frac{f}{f'}")
        else:
            c2.latex(r"x_{i+1}=x_i-\frac{ff'}{(f')^2-ff''}")

    tol = c3.number_input(
        "Tolerancia (E):", value=0.001, format="%.5f", step=0.0001, key="nl_tol"
    )
    max_iter = c4.number_input(
        "Máx. Iteraciones:", min_value=1, max_value=100, value=30, step=1, key="nl_max"
    )

    btn_calcular = st.button(
        "Calcular Raíz", type="primary", width="stretch", key="btn_calc_nl"
    )

    if btn_calcular:
        try:
            if es_pf:
                res = NoLinealesEngine.punto_fijo(func_str, x0, tol, int(max_iter))
            elif metodo == "Método de Bisección":
                res = NoLinealesEngine.biseccion(func_str, val_a, val_b, tol, int(max_iter))
            elif metodo == "Método de Regula Falsi (Posición Falsa)":
                res = NoLinealesEngine.regula_falsi(func_str, val_a, val_b, tol, int(max_iter))
            elif metodo == "Método de la Secante":
                res = NoLinealesEngine.secante(func_str, x_prev, x_curr, tol, int(max_iter))
            elif metodo == "Newton-Raphson (1er Orden)":
                res = NoLinealesEngine.newton_raphson_1(func_str, x0, tol, int(max_iter))
            else:
                res = NoLinealesEngine.newton_raphson_2(func_str, x0, tol, int(max_iter))

            st.session_state["nl_ultimo_res"] = res
            st.session_state["nl_ultima_fn"] = func_str
            st.session_state["nl_ultimo_xref"] = val_a if "Bisección" in metodo or "Falsa" in metodo else x0
        except Exception as e:
            st.error(f"Error en el cálculo: {e}")
            return

    # --- BLOQUE DE RESULTADOS INMEDIATOS (VISIBLE SIN SCROLL) ---
    res = st.session_state.get("nl_ultimo_res")
    if res:
        st.divider()
        r_col1, r_col2, r_col3 = st.columns([1.2, 1, 1])
        iters = res.get("iteraciones", [])
        err_final = iters[-1]["Error"] if iters else 0.0

        with r_col1:
            if res["convergio"] and res["raiz"] is not None:
                st.metric("Raíz Aproximada (x*)", f"{res['raiz']:.6f}")
            else:
                st.warning("No convergió en el límite de iteraciones.")
        with r_col2:
            st.metric("Iteraciones / Error Final", f"{len(iters)} it. | {err_final:.2e}")
        with r_col3:
            pdf_bytes = PDFReportEngine.generar_reporte_pdf(
                titulo_metodo=res["metodo"],
                entradas_dict={
                    "Función": st.session_state.get("nl_ultima_fn", func_str),
                    "Tolerancia": tol,
                },
                resultado_str=f"Raíz = {res['raiz']}",
                iteraciones_list=iters,
            )
            st.download_button(
                label="📄 Descargar PDF",
                data=pdf_bytes,
                file_name=f"Reporte_{res['metodo'].replace(' ', '_')}.pdf",
                mime="application/pdf",
                width="stretch",
                key="btn_pdf_nl_compact",
            )

    # --- BLOQUE SECUNDARIO EN SUB-PESTAÑAS (EVITA APILAR SCROLL EN MÓVIL Y PC) ---
    sub_tabla, sub_ggb, sub_gif = st.tabs(
        ["📋 Tabla de Iteraciones", "📈 Laboratorio GeoGebra", "🎞️ Animación Conceptual"]
    )

    with sub_tabla:
        if res and res.get("iteraciones"):
            df_iter = pd.DataFrame(res["iteraciones"])
            df_iter.columns = df_iter.columns.astype(str)
            st.dataframe(df_iter, width="stretch")
        else:
            st.info("Presiona **Calcular Raíz** para generar la tabla de iteraciones.")

    with sub_ggb:
        fn_plot = st.session_state.get("nl_ultima_fn", func_str)
        raiz_plot = res["raiz"] if (res and res.get("convergio")) else None
        xref_plot = st.session_state.get("nl_ultimo_xref", x0)
        _render_geogebra_raiz(fn_plot, raiz_plot, es_punto_fijo=es_pf, x_ref=xref_plot)

    with sub_gif:
        gif_path = gif_map.get(metodo)
        if gif_path and os.path.exists(gif_path):
            st.image(
                gif_path,
                caption=f"Comportamiento geométrico: {metodo} (Créditos: @juliomulero)",
                width="content",
            )
        else:
            st.info("Animación conceptual no disponible para este método.")
