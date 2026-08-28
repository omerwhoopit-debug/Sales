import os
import json
import base64
import requests
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

# -----------------------------------------------------------------------------
# 1. Page Configuration & Custom Styling
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="Sales Dashboard · UKPDA & ILC",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for Streamlit interface
st.markdown("""
<style>
    /* Metric Card Styling */
    .metric-box {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(45, 212, 191, 0.08));
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 12px;
    }
    .metric-title {
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #A79BC4;
        font-weight: 700;
        margin-bottom: 6px;
    }
    .metric-val {
        font-size: 1.85rem;
        font-weight: 800;
        color: #F3EFFB;
        font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .metric-sub {
        font-size: 0.8rem;
        color: #2DD4BF;
        margin-top: 4px;
    }
    /* Hide Streamlit default footer */
    footer {visibility: hidden;}
</style>
""", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# 2. Configuration & Secret Resolution
# -----------------------------------------------------------------------------
DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbzMNsgB9AjtNBXBmANcAMDIJn70M4zDwaYTdLRLpkwJ6dLfwLMwflsulDY1X2ux0JMo0A/exec"

def get_config(key, default=""):
    try:
        if key in st.secrets:
            return st.secrets[key]
    except Exception:
        pass
    return os.environ.get(key, default)

SHEET_API_URL = get_config("SHEET_API_URL", DEFAULT_API_URL)
SECURITY_TOKEN = get_config("SECURITY_TOKEN", "")

# -----------------------------------------------------------------------------
# 3. High-Performance Data Fetcher (60s Cache)
# -----------------------------------------------------------------------------
@st.cache_data(ttl=60, show_spinner=False)
def fetch_live_data(api_url, token=""):
    params = {}
    if token:
        params["token"] = token
    
    try:
        response = requests.get(api_url, params=params, timeout=12)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and "sales" in data:
            return data
    except Exception as e:
        # If network error or invalid JSON, return structured error
        return {"error": str(e), "sales": [], "cpd": [], "phleb": []}

    return {"sales": [], "cpd": [], "phleb": []}

# -----------------------------------------------------------------------------
# 4. Data Processing & Normalization
# -----------------------------------------------------------------------------
def prepare_dataframes(raw_data):
    # Sales DataFrame
    sales_list = raw_data.get("sales", [])
    df_sales = pd.DataFrame(sales_list)
    if not df_sales.empty:
        df_sales["amount"] = pd.to_numeric(df_sales.get("amount", 0), errors="coerce").fillna(0)
        df_sales["date"] = pd.to_datetime(df_sales.get("date", ""), errors="coerce")
        df_sales["order"] = df_sales.get("order", "").astype(str)
        df_sales["name"] = df_sales.get("name", "").astype(str)
        df_sales["agent"] = df_sales.get("agent", "").astype(str).str.strip()
        df_sales["college"] = df_sales.get("college", "").astype(str).str.strip()
        df_sales["course"] = df_sales.get("course", "").astype(str).str.strip()
        df_sales["lead"] = df_sales.get("lead", "").astype(str).str.strip()
        df_sales["fp"] = df_sales.get("fp", False).astype(bool)
    else:
        df_sales = pd.DataFrame(columns=["sr", "date", "order", "name", "phone", "lead", "agent", "course", "college", "type", "fp", "amount"])

    # CPD DataFrame
    cpd_list = raw_data.get("cpd", [])
    df_cpd = pd.DataFrame(cpd_list)
    if not df_cpd.empty:
        df_cpd["count"] = pd.to_numeric(df_cpd.get("count", 0), errors="coerce").fillna(0)
        df_cpd["date"] = pd.to_datetime(df_cpd.get("date", ""), errors="coerce")
        df_cpd["college"] = df_cpd.get("college", "").astype(str).str.strip()
    else:
        df_cpd = pd.DataFrame(columns=["date", "college", "count"])

    # Phlebotomy DataFrame
    phleb_list = raw_data.get("phleb", [])
    df_phleb = pd.DataFrame(phleb_list)
    if not df_phleb.empty:
        df_phleb["total"] = pd.to_numeric(df_phleb.get("total", 0), errors="coerce").fillna(0)
        df_phleb["p1"] = pd.to_numeric(df_phleb.get("p1", 0), errors="coerce").fillna(0)
        df_phleb["p2"] = pd.to_numeric(df_phleb.get("p2", 0), errors="coerce").fillna(0)
        df_phleb["date"] = pd.to_datetime(df_phleb.get("date", ""), errors="coerce")
    else:
        df_phleb = pd.DataFrame(columns=["date", "p1", "p2", "total", "notes", "orders"])

    return df_sales, df_cpd, df_phleb

# -----------------------------------------------------------------------------
# 5. Sidebar Controls & Filtering
# -----------------------------------------------------------------------------
with st.sidebar:
    st.image("logo.png" if os.path.exists("logo.png") else "https://via.placeholder.com/150", width=64)
    st.title("Sales Dashboard")
    st.caption("UKPDA & ILC · Live Analytics")
    st.markdown("---")

    # Mode Selector
    view_mode = st.radio("Display View", ["Interactive Web App", "Streamlit Analytics", "Data API & Diagnostics"], index=0)
    
    st.markdown("---")
    st.subheader("⚙️ Data Sync")
    if st.button("🔄 Force Refresh Data"):
        st.cache_data.clear()
        st.rerun()

# -----------------------------------------------------------------------------
# 6. Fetch & Prepare Data
# -----------------------------------------------------------------------------
raw_payload = fetch_live_data(SHEET_API_URL, SECURITY_TOKEN)
df_sales, df_cpd, df_phleb = prepare_dataframes(raw_payload)

# -----------------------------------------------------------------------------
# 7. Render Views
# -----------------------------------------------------------------------------

# VIEW 1: Interactive Full Web SPA View
if view_mode == "Interactive Web App":
    st.caption("⚡ Live Interactive High-Fidelity Dashboard with Chart.js & Instant Filters")
    html_path = "index.html"
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        
        # Inject API URL dynamically into HTML/JS if needed
        st.components.v1.html(html_content, height=1400, scrolling=True)
    else:
        st.warning("index.html not found in root directory.")

# VIEW 2: Native Streamlit Analytics
elif view_mode == "Streamlit Analytics":
    st.title("📈 Executive Analytics & Performance")
    
    if df_sales.empty:
        st.info("No sales data loaded yet. Check your Google Sheet API connection in the Diagnostics tab.")
    else:
        # Date & Filter Bar
        col_f1, col_f2, col_f3, col_f4 = st.columns(4)
        
        # Colleges Filter
        colleges = ["All Colleges"] + sorted([c for c in df_sales["college"].unique() if c])
        selected_college = col_f1.selectbox("College", colleges)
        
        # Lead Source Filter
        leads = ["All Lead Sources"] + sorted([l for l in df_sales["lead"].unique() if l])
        selected_lead = col_f2.selectbox("Lead Source", leads)
        
        # Agent Filter
        agents = ["All Agents"] + sorted([a for a in df_sales["agent"].unique() if a])
        selected_agent = col_f3.selectbox("Sales Agent", agents)
        
        # Course Filter
        courses = ["All Courses"] + sorted([cr for cr in df_sales["course"].unique() if cr])
        selected_course = col_f4.selectbox("Course", courses)

        # Apply Filters
        filtered_sales = df_sales.copy()
        if selected_college != "All Colleges":
            filtered_sales = filtered_sales[filtered_sales["college"] == selected_college]
        if selected_lead != "All Lead Sources":
            filtered_sales = filtered_sales[filtered_sales["lead"] == selected_lead]
        if selected_agent != "All Agents":
            filtered_sales = filtered_sales[filtered_sales["agent"] == selected_agent]
        if selected_course != "All Courses":
            filtered_sales = filtered_sales[filtered_sales["course"] == selected_course]

        # Top KPI Metrics Row
        total_rev = filtered_sales["amount"].sum()
        total_orders = len(filtered_sales)
        fp_count = filtered_sales["fp"].sum()
        fp_rate = (fp_count / total_orders * 100) if total_orders > 0 else 0
        avg_order = (total_rev / total_orders) if total_orders > 0 else 0
        cpd_total = df_cpd["count"].sum() if not df_cpd.empty else 0
        phleb_total = df_phleb["total"].sum() if not df_phleb.empty else 0

        kpi1, kpi2, kpi3, kpi4, kpi5 = st.columns(5)
        kpi1.markdown(f'<div class="metric-box"><div class="metric-title">Total Revenue</div><div class="metric-val">£{total_rev:,.0f}</div><div class="metric-sub">{total_orders} Orders</div></div>', unsafe_allow_html=True)
        kpi2.markdown(f'<div class="metric-box"><div class="metric-title">Full Payment Rate</div><div class="metric-val">{fp_rate:.1f}%</div><div class="metric-sub">{fp_count} Paid in Full</div></div>', unsafe_allow_html=True)
        kpi3.markdown(f'<div class="metric-box"><div class="metric-title">Avg Order Value</div><div class="metric-val">£{avg_order:,.0f}</div><div class="metric-sub">Per Student</div></div>', unsafe_allow_html=True)
        kpi4.markdown(f'<div class="metric-box"><div class="metric-title">CPD Sales</div><div class="metric-val">{cpd_total:,.0f}</div><div class="metric-sub">Total Units</div></div>', unsafe_allow_html=True)
        kpi5.markdown(f'<div class="metric-box"><div class="metric-title">Phlebotomy</div><div class="metric-val">{phleb_total:,.0f}</div><div class="metric-sub">Total Enrolled</div></div>', unsafe_allow_html=True)

        st.markdown("---")

        # Charts Section
        tab_charts, tab_table, tab_cpd, tab_phleb = st.tabs(["📊 Performance Charts", "📋 Orders Table", "📚 CPD Breakdown", "💉 Phlebotomy"])

        with tab_charts:
            c1, c2 = st.columns([2, 1])
            with c1:
                # Daily Revenue Trend
                df_daily = filtered_sales.dropna(subset=["date"]).groupby(pd.Grouper(key="date", freq="D"))["amount"].sum().reset_index()
                fig_trend = px.line(df_daily, x="date", y="amount", title="Daily Revenue Trend (£)", template="plotly_dark", color_discrete_sequence=["#8B5CF6"])
                fig_trend.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
                st.plotly_chart(fig_trend, use_container_width=True)

            with c2:
                # Revenue by College
                df_col = filtered_sales.groupby("college")["amount"].sum().reset_index()
                fig_donut = px.pie(df_col, names="college", values="amount", title="Revenue by College", hole=0.55, template="plotly_dark", color_discrete_sequence=["#8B5CF6", "#2DD4BF", "#FB923C"])
                fig_donut.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
                st.plotly_chart(fig_donut, use_container_width=True)

            c3, c4 = st.columns(2)
            with c3:
                # Top Courses
                df_crs = filtered_sales.groupby("course")["amount"].sum().reset_index().sort_values("amount", ascending=False).head(10)
                fig_crs = px.bar(df_crs, x="amount", y="course", orientation="h", title="Top 10 Courses by Revenue (£)", template="plotly_dark", color_discrete_sequence=["#2DD4BF"])
                fig_crs.update_layout(yaxis=dict(autorange="reversed"), plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
                st.plotly_chart(fig_crs, use_container_width=True)

            with c4:
                # Lead Source Breakdown
                df_ld = filtered_sales.groupby("lead")["amount"].sum().reset_index().sort_values("amount", ascending=False)
                fig_ld = px.bar(df_ld, x="lead", y="amount", title="Revenue by Lead Source (£)", template="plotly_dark", color_discrete_sequence=["#F4C430"])
                fig_ld.update_layout(plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)")
                st.plotly_chart(fig_ld, use_container_width=True)

        with tab_table:
            st.subheader("Sales Transactions")
            st.dataframe(
                filtered_sales[["date", "order", "name", "agent", "college", "course", "lead", "type", "amount"]].sort_values("date", ascending=False),
                use_container_width=True
            )
            # Export CSV button
            csv = filtered_sales.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="📥 Download Filtered Orders CSV",
                data=csv,
                file_name=f"sales_data_export_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv",
            )

        with tab_cpd:
            st.subheader("CPD Sales Breakdown")
            st.dataframe(df_cpd, use_container_width=True)

        with tab_phleb:
            st.subheader("Phlebotomy Enrollments")
            st.dataframe(df_phleb, use_container_width=True)

# VIEW 3: API & Diagnostics
elif view_mode == "Data API & Diagnostics":
    st.title("🔧 Data API & Diagnostics")
    
    st.subheader("Active Configuration")
    st.write({
        "API Endpoint": SHEET_API_URL,
        "Token Protection Active": bool(SECURITY_TOKEN),
        "Total Sales Records Loaded": len(df_sales),
        "Total CPD Records": len(df_cpd),
        "Total Phlebotomy Records": len(df_phleb),
        "Last Cache Sync": raw_payload.get("generated_at", "Live")
    })

    if "error" in raw_payload:
        st.error(f"Error fetching data: {raw_payload['error']}")
    else:
        st.success("API connection healthy and data loaded successfully.")
    
    st.subheader("Raw JSON Response Preview")
    st.json({
        "status": raw_payload.get("status", "success"),
        "counts": raw_payload.get("counts", {}),
        "sample_sales": raw_payload.get("sales", [])[:3]
    })
