import os
import json
import base64
import requests
import streamlit as st

# -----------------------------------------------------------------------------
# 1. Page Configuration
# -----------------------------------------------------------------------------
icon_path = "favicon-128.png" if os.path.exists("favicon-128.png") else ("favicon-48.png" if os.path.exists("favicon-48.png") else ("favicon-32.png" if os.path.exists("favicon-32.png") else "📊"))

st.set_page_config(
    page_title="Sales Dashboard · UKPDA & ILC",
    page_icon=icon_path,
    layout="wide",
    initial_sidebar_state="collapsed"
)

# -----------------------------------------------------------------------------
# 2. Complete Layout Reset — Fullscreen 100vw x 100vh with Zero Margins/Bars
# -----------------------------------------------------------------------------
st.markdown("""
<style>
    /* Hide all Streamlit default UI chrome */
    header[data-testid="stHeader"],
    [data-testid="stToolbar"],
    [data-testid="stDecoration"],
    [data-testid="stSidebar"],
    footer {
        display: none !important;
        height: 0 !important;
        visibility: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    
    html, body, [data-testid="stAppViewContainer"], .main, .block-container, [data-testid="stApp"] {
        padding: 0 !important;
        margin: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        overflow: hidden !important;
        background: #100B1B !important;
    }

    /* Make iframe fill the entire viewport edge-to-edge with no top bar */
    iframe {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        border: none !important;
        z-index: 999999 !important;
        display: block !important;
    }
</style>
""", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# 3. Secret Resolution & Server-Side Fast Caching
# -----------------------------------------------------------------------------
DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbzMNsgB9AjtNBXBmANcAMDIJn70M4zDwaYTdLRLpkwJ6dLfwLMwflsulDY1X2ux0JMo0A/exec"

def get_secret(key, default=""):
    try:
        if key in st.secrets:
            return st.secrets[key]
    except Exception:
        pass
    return os.environ.get(key, default)

SHEET_API_URL = get_secret("SHEET_API_URL", DEFAULT_API_URL)
SECURITY_TOKEN = get_secret("SECURITY_TOKEN", "")
AUTH_USERNAME = get_secret("AUTH_USERNAME", "admin")
AUTH_PASSWORD = get_secret("AUTH_PASSWORD", "admin")

# Server-side caching for 10 seconds (ensures rapid sync with Google Sheets)
@st.cache_data(ttl=10, show_spinner=False)
def fetch_cached_payload(api_url, token=""):
    try:
        params = {"nocache": "1"}
        if token:
            params["token"] = token
        resp = requests.get(api_url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict) and "sales" in data:
                return data
    except Exception:
        pass
    return None

# -----------------------------------------------------------------------------
# 4. Bundled HTML Generation with Pre-loaded Initial Data & Auth Config
# -----------------------------------------------------------------------------
def build_bundled_dashboard():
    if not os.path.exists("index.html"):
        return "<h3>index.html not found</h3>"

    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Inline CSS
    if os.path.exists("style.css"):
        with open("style.css", "r", encoding="utf-8") as f:
            css_content = f.read()
        html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css_content}\n</style>')

    # 2. Inline Branding & High-Resolution Favicons as Base64
    for fav_name in ["logo.png", "favicon.png", "favicon-16.png", "favicon-32.png", "favicon-48.png", "favicon-128.png"]:
        if os.path.exists(fav_name):
            with open(fav_name, "rb") as f:
                b64_data = base64.b64encode(f.read()).decode("utf-8")
            html = html.replace(f'href="{fav_name}"', f'href="data:image/png;base64,{b64_data}"')
            html = html.replace(f'src="{fav_name}"', f'src="data:image/png;base64,{b64_data}"')

    # 3. Fetch server-cached data to eliminate client cold starts
    cached_data = fetch_cached_payload(SHEET_API_URL, SECURITY_TOKEN)
    initial_data_json = json.dumps(cached_data) if cached_data else "null"

    injection_script = f"""
    <script>
        window.INITIAL_DATA = {initial_data_json};
        window.SHEET_API_URL = "{SHEET_API_URL}";
        window.AUTH_USERNAME = "{AUTH_USERNAME}";
        window.AUTH_PASSWORD = "{AUTH_PASSWORD}";
    </script>
    """

    # 4. Inline JavaScript with pre-loaded initial data & auth
    if os.path.exists("script.js"):
        with open("script.js", "r", encoding="utf-8") as f:
            js_content = f.read()
        html = html.replace('<script src="script.js"></script>', f'{injection_script}\n<script>\n{js_content}\n</script>')
    else:
        html = html.replace('</body>', f'{injection_script}\n</body>')

    return html

# -----------------------------------------------------------------------------
# 5. Render Fullscreen
# -----------------------------------------------------------------------------
dashboard_html = build_bundled_dashboard()
st.components.v1.html(dashboard_html, height=1000, scrolling=True)
