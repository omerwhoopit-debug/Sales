import os
import base64
import streamlit as st

# -----------------------------------------------------------------------------
# 1. Fullscreen Page Configuration
# -----------------------------------------------------------------------------
icon_path = "favicon-32.png" if os.path.exists("favicon-32.png") else ("logo.png" if os.path.exists("logo.png") else "📊")

st.set_page_config(
    page_title="Sales Dashboard · UKPDA & ILC",
    page_icon=icon_path,
    layout="wide",
    initial_sidebar_state="collapsed"
)

# -----------------------------------------------------------------------------
# 2. Complete CSS Reset — Remove all Streamlit UI wrappers & margins
# -----------------------------------------------------------------------------
st.markdown("""
<style>
    /* Remove default Streamlit header, footer, sidebar, and padding */
    header, footer, #MainMenu {
        visibility: hidden !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    [data-testid="stSidebar"] {
        display: none !important;
    }
    [data-testid="stHeader"] {
        display: none !important;
    }
    .main .block-container {
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100vw !important;
        width: 100vw !important;
    }
    .stApp {
        margin: 0 !important;
        padding: 0 !important;
        background: #0b0816 !important;
    }
    iframe {
        border: none !important;
        width: 100% !important;
        min-height: 100vh !important;
        display: block !important;
    }
</style>
""", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# 3. Dynamic Bundler — Inlines HTML, CSS, JavaScript, and Images for 100% Fidelity
# -----------------------------------------------------------------------------
def get_bundled_dashboard_html():
    if not os.path.exists("index.html"):
        return "<h3>index.html not found</h3>"

    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Inline style.css
    if os.path.exists("style.css"):
        with open("style.css", "r", encoding="utf-8") as f:
            css_content = f.read()
        html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css_content}\n</style>')

    # 2. Inline logo.png as Base64 Data URI
    if os.path.exists("logo.png"):
        with open("logo.png", "rb") as f:
            logo_b64 = base64.b64encode(f.read()).decode("utf-8")
        html = html.replace('src="logo.png"', f'src="data:image/png;base64,{logo_b64}"')

    # 3. Inline favicon.png & favicon-32.png
    if os.path.exists("favicon.png"):
        with open("favicon.png", "rb") as f:
            fav_b64 = base64.b64encode(f.read()).decode("utf-8")
        html = html.replace('href="favicon.png"', f'href="data:image/png;base64,{fav_b64}"')

    if os.path.exists("favicon-32.png"):
        with open("favicon-32.png", "rb") as f:
            fav32_b64 = base64.b64encode(f.read()).decode("utf-8")
        html = html.replace('href="favicon-32.png"', f'href="data:image/png;base64,{fav32_b64}"')

    # 4. Inline script.js
    if os.path.exists("script.js"):
        with open("script.js", "r", encoding="utf-8") as f:
            js_content = f.read()
        
        # Inject custom secrets SHEET_API_URL if configured in Streamlit secrets
        try:
            if "SHEET_API_URL" in st.secrets and st.secrets["SHEET_API_URL"]:
                custom_url = st.secrets["SHEET_API_URL"]
                js_content = js_content.replace(
                    'const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbzMNsgB9AjtNBXBmANcAMDIJn70M4zDwaYTdLRLpkwJ6dLfwLMwflsulDY1X2ux0JMo0A/exec";',
                    f'const SHEET_API_URL = "{custom_url}";'
                )
        except Exception:
            pass

        html = html.replace('<script src="script.js"></script>', f'<script>\n{js_content}\n</script>')

    return html

# -----------------------------------------------------------------------------
# 4. Render the Full Dashboard (Direct Pixel-Perfect Execution)
# -----------------------------------------------------------------------------
bundled_html = get_bundled_dashboard_html()
st.components.v1.html(bundled_html, height=3600, scrolling=True)
