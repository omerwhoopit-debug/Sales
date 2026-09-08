/**
 * ============================================================================
 * UKPDA & ILC SALES DASHBOARD — USER DATABASE (users.js)
 * ============================================================================
 * This code file stores the authorized team accounts, roles, credentials, and
 * profile metadata for the Sales Dashboard.
 *
 * Roles available:
 *   - "admin": Full Read & Write access (User Management, Agent Controls, Data Sync)
 *   - "user":  Read-Only access (View KPIs, Charts, Reports, Instalments)
 * ============================================================================
 */

var UKPDA_USERS_DATABASE = [
  {
    id: "usr_admin",
    username: "admin",
    name: "System Administrator",
    email: "admin@ukpda.com",
    password: "admin",
    role: "admin",
    photo: "",
    createdAt: "2026-09-01"
  },
  {
    id: "usr_user",
    username: "user",
    name: "Standard User",
    email: "user@ukpda.com",
    password: "user123",
    role: "user",
    photo: "",
    createdAt: "2026-09-01"
  }
];

// Browser & Node/CommonJS export compatibility
if (typeof window !== "undefined") {
  window.UKPDA_USERS_DATABASE = UKPDA_USERS_DATABASE;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = UKPDA_USERS_DATABASE;
}
