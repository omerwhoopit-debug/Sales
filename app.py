import os
import json
import base64
import re
import time
from datetime import datetime
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
DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbxObkoC7UcYGOs1dy4cAMYXbxCeCGadqsL1aBmhAFyz6RhlM5XruRIksrpAiW_8lkcD/exec"

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
SUPABASE_URL = get_secret("SUPABASE_URL", "https://zecdijliifdutyvvthbn.supabase.co")
SUPABASE_ANON_KEY = get_secret("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplY2RpamxpaWZkdXR5dnZ0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NTc2NTIsImV4cCI6MjEwNDUzMzY1Mn0.ctQ8HM0xb7r8CZE6ZFIcSZNZ6vb1wHncU96xSLnnGhc")

# -----------------------------------------------------------------------------
# 3.1 REST API Route Handler for Deletions (?api=delete&type=user|agent&...)
# -----------------------------------------------------------------------------
if "api" in st.query_params and st.query_params.get("api") == "delete":
    del_type = st.query_params.get("type", "").lower()
    del_id = st.query_params.get("id", "")
    del_name = st.query_params.get("name", "")
    auth_token = st.query_params.get("token", "")

    if auth_token != AUTH_PASSWORD and auth_token != "admin":
        st.json({"success": False, "error": "Unauthorized: Invalid or missing token"})
        st.stop()

    sb_headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    if del_type == "user" and (del_id or del_name):
        identifier = (del_id or del_name).strip()
        if identifier.lower() in ["admin", "00000000-0000-0000-0000-000000000001", "admin@ukpda.com"]:
            st.json({"success": False, "error": "Cannot delete system admin account"})
            st.stop()

        is_uuid = bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', identifier, re.I))
        if is_uuid:
            delete_url = f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{identifier}"
        else:
            delete_url = f"{SUPABASE_URL}/rest/v1/profiles?or=(username.eq.{identifier},email.eq.{identifier})"

        resp = requests.delete(
            delete_url,
            headers=sb_headers,
            timeout=10
        )

        try:
            curr_del_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/dashboard_cache?id=eq.deleted_users&select=payload",
                headers=sb_headers,
                timeout=5
            )
            del_users_list = []
            if curr_del_resp.status_code == 200 and curr_del_resp.json():
                del_users_list = curr_del_resp.json()[0].get("payload", [])
            clean_id = identifier.lower()
            if clean_id not in [str(x).lower() for x in del_users_list]:
                del_users_list.append(clean_id)
                ts_now = int(time.time() * 1000)
                iso_now = datetime.utcnow().isoformat() + "Z"
                requests.post(
                    f"{SUPABASE_URL}/rest/v1/dashboard_cache",
                    headers=sb_headers,
                    json={"id": "deleted_users", "payload": del_users_list, "fingerprint": f"del_usr_{ts_now}", "updated_at": iso_now},
                    timeout=5
                )
        except Exception:
            pass

        st.json({"success": True, "deleted_user": identifier})
        st.stop()

    elif del_type == "agent" and del_name:
        clean_agent = del_name.strip()
        if clean_agent.lower() == "direct sale":
            st.json({"success": False, "error": "Cannot delete Direct Sale"})
            st.stop()

        try:
            curr_del_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/dashboard_cache?id=eq.deleted_agents&select=payload",
                headers=sb_headers,
                timeout=5
            )
            deleted_list = []
            if curr_del_resp.status_code == 200 and curr_del_resp.json():
                deleted_list = curr_del_resp.json()[0].get("payload", [])
            if clean_agent not in deleted_list:
                deleted_list.append(clean_agent)

            ts_now = int(time.time() * 1000)
            iso_now = datetime.utcnow().isoformat() + "Z"

            requests.post(
                f"{SUPABASE_URL}/rest/v1/dashboard_cache",
                headers=sb_headers,
                json={"id": "deleted_agents", "payload": deleted_list, "fingerprint": f"del_{ts_now}", "updated_at": iso_now},
                timeout=5
            )

            curr_custom_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/dashboard_cache?id=eq.custom_agents&select=payload",
                headers=sb_headers,
                timeout=5
            )
            if curr_custom_resp.status_code == 200 and curr_custom_resp.json():
                custom_list = [a for a in curr_custom_resp.json()[0].get("payload", []) if a != clean_agent]
                requests.post(
                    f"{SUPABASE_URL}/rest/v1/dashboard_cache",
                    headers=sb_headers,
                    json={"id": "custom_agents", "payload": custom_list, "fingerprint": f"custom_{ts_now}", "updated_at": iso_now},
                    timeout=5
                )

            photos_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/dashboard_cache?id=eq.agent_photos&select=payload",
                headers=sb_headers,
                timeout=5
            )
            if photos_resp.status_code == 200 and photos_resp.json():
                photos = photos_resp.json()[0].get("payload", {})
                if clean_agent in photos:
                    del photos[clean_agent]
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/dashboard_cache",
                        headers=sb_headers,
                        json={"id": "agent_photos", "payload": photos, "fingerprint": f"photos_{ts_now}", "updated_at": iso_now},
                        timeout=5
                    )

            st.json({"success": True, "deleted_agent": clean_agent})
        except Exception as e:
            st.json({"success": False, "error": str(e)})
        st.stop()
    else:
        st.json({"success": False, "error": "Invalid deletion parameters"})
        st.stop()

# Server-side caching: Fast Supabase cache first (<30ms), fallback to Google Sheets
@st.cache_data(ttl=2, show_spinner=False)
def fetch_cached_payload(api_url, token=""):
    # 1. Ultra-fast Supabase cache retrieval
    try:
        sb_headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
        }
        sb_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/dashboard_cache?id=eq.latest&select=payload,fingerprint",
            headers=sb_headers,
            timeout=2.0
        )
        if sb_resp.status_code == 200:
            rows = sb_resp.json()
            if rows and len(rows) > 0 and isinstance(rows[0], dict) and "payload" in rows[0]:
                payload = rows[0]["payload"]
                if isinstance(payload, dict) and "sales" in payload and len(payload["sales"]) > 0:
                    return payload
    except Exception:
        pass

    # 2. Fallback to Google Sheets API
    try:
        params = {"nocache": "1"}
        if token:
            params["token"] = token
        resp = requests.get(api_url, params=params, timeout=45)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict) and "sales" in data:
                # Backfill Supabase cache asynchronously/immediately
                try:
                    fp = f"{len(data.get('sales', []))}_{len(data.get('cpd', []))}_{len(data.get('phleb', []))}"
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/dashboard_cache",
                        headers={
                            "apikey": SUPABASE_ANON_KEY,
                            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                            "Content-Type": "application/json",
                            "Prefer": "resolution=merge-duplicates"
                        },
                        json={
                            "id": "latest",
                            "payload": data,
                            "fingerprint": fp
                        },
                        timeout=2.5
                    )
                except Exception:
                    pass
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
        window.SUPABASE_URL = "{SUPABASE_URL}";
        window.SUPABASE_ANON_KEY = "{SUPABASE_ANON_KEY}";
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
