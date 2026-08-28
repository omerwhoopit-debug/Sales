# 📊 Sales Dashboard · UKPDA & ILC

A high-performance, secure, and real-time Sales Dashboard built for **UKPDA & ILC**, seamlessly synchronizing data from Google Sheets into both a full-featured interactive web application and an executive Streamlit analytics suite.

---

## 🚀 Quick Setup & Deployment Guide

### Step 1: Deploy the Google Sheet API
1. Open your [Google Sheet](https://docs.google.com/spreadsheets/d/1cwcPGApGD591-snDSS5QOUnUDjMDnwzFQ2ze7tjEzVk/edit).
2. Go to **Extensions** > **Apps Script**.
3. Copy the entire contents of [`google_apps_script.js`](./google_apps_script.js) and paste it into the script editor (replacing any existing code).
4. Click **Deploy** > **New deployment**:
   - **Type**: Web app
   - **Description**: `Sales Dashboard Production API v2`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Click **Deploy**, authorize permissions, and copy the Web App URL (ends in `/exec`).

---

### Step 2: Push Project to GitHub

Open PowerShell or Terminal in this directory (`C:\Users\WMS-IT-LAP-157\Desktop\sales Dashboard`):

```bash
# 1. Initialize git repository
git init

# 2. Add files (.gitignore automatically protects sensitive keys)
git add .

# 3. Commit files
git commit -m "Initial commit: Production Sales Dashboard"

# 4. Link your GitHub repository (replace with your repo URL)
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sales-dashboard.git
git push -u origin main
```

---

### Step 3: Deploy on Streamlit Cloud (Fast & Free)

1. Go to [share.streamlit.io](https://share.streamlit.io) and log in with your GitHub account.
2. Click **"New app"**.
3. Select your repository: `sales-dashboard`, Branch: `main`, Main file path: `app.py`.
4. Click **"Advanced settings..."** > **Secrets** and paste:

```toml
# ==============================================================================
# STREAMLIT CLOUD SECRETS CONFIGURATION
# ==============================================================================

SHEET_API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
SECURITY_TOKEN = ""
GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1cwcPGApGD591-snDSS5QOUnUDjMDnwzFQ2ze7tjEzVk/edit"
```

5. Click **Deploy!** Your app will be live with an active HTTPS URL in under 2 minutes.

---

## 🔒 Security & Architecture Features

- ⚡ **Sub-100ms Responses**: Apps Script `CacheService` + Streamlit `@st.cache_data(ttl=60)` ensures rapid rendering without hitting Google Sheet rate limits.
- 🛡️ **Zero Credential Leaks**: `.gitignore` strictly blocks all `*.json`, service account keys, and `.streamlit/secrets.toml`.
- 📅 **Robust Date Normalization**: Automatically handles locale format differences (`DD/MM/YYYY` vs `MM/DD/YYYY`) and string representations without day/month corruption.
- 📱 **Dual View Modes**:
  - **Interactive Web App**: Custom Chart.js single-page application with responsive filters and dark/light themes.
  - **Streamlit Analytics**: Instant KPI metrics, Plotly visualizations, filtered views, and one-click CSV data export.
