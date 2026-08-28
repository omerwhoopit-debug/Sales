/**
 * ============================================================================
 * SALES DASHBOARD — PRODUCTION LIVE DATA API (Google Apps Script)
 * ============================================================================
 * Instructions:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1cwcPGApGD591-snDSS5QOUnUDjMDnwzFQ2ze7tjEzVk
 * 2. In the menu, click: Extensions > Apps Script
 * 3. Delete any existing code and paste this ENTIRE file.
 * 4. (Optional) Set SECURITY_TOKEN below if you want to restrict API access.
 * 5. Click "Deploy" > "New deployment"
 *    - Select type: "Web app"
 *    - Description: "Sales Dashboard Production API v2"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (or anyone with link)
 * 6. Click "Deploy", Authorize access, and copy the resulting Web App URL ending in /exec.
 * 7. Add this URL to your Streamlit secrets or script.js.
 * ============================================================================
 */

// OPTIONAL: Set a secret token to protect your data from public scraping.
// If set, requests must include ?token=YOUR_TOKEN (e.g. ?token=ukpda_secure_2026)
// Leave empty ("") to disable token verification.
var SECURITY_TOKEN = ""; 

// Cache duration in seconds (e.g., 900 = 15 minutes)
var CACHE_TTL_SECONDS = 900;

function doGet(e) {
  try {
    // 1. Security token verification (if configured)
    if (SECURITY_TOKEN !== "") {
      var reqToken = (e && e.parameter && e.parameter.token) || "";
      if (reqToken !== SECURITY_TOKEN) {
        return createResponse({ error: "Unauthorized: Invalid or missing token" }, 401, e);
      }
    }

    // 2. Check CacheService unless nocache parameter is passed
    var noCache = e && e.parameter && (e.parameter.nocache === "1" || e.parameter.nocache === "true");
    var cache = CacheService.getScriptCache();
    var cacheKey = "SALES_DASHBOARD_PAYLOAD_V2";

    if (!noCache) {
      var cachedJson = getChunkedCache(cache, cacheKey);
      if (cachedJson) {
        return createRawResponse(cachedJson, e);
      }
    }

    // 3. Parse Google Sheet tabs
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();

    // Matches tab names like "Jul-2026", "July-2026", "Aug-2026", "August-2026"
    var monthPattern = /^([A-Za-z]+)-(\d{4})$/;
    var monthOrder = {
      jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3,
      may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7,
      sep:8, sept:8, september:8, oct:9, october:9, nov:10, november:10, dec:11, december:11
    };

    // Cutoff: July 2026 onward (Month index 6 = July)
    var startCutoff = new Date(2026, 6, 1);

    var allRows = [];
    var cpdRows = [];
    var phlebRows = [];
    var srCounter = 1;

    // Helper: Find column index by matchers
    function findCol(header, matchers) {
      for (var c = 0; c < header.length; c++) {
        for (var m = 0; m < matchers.length; m++) {
          if (header[c] === matchers[m]) return c;
        }
      }
      for (var c2 = 0; c2 < header.length; c2++) {
        for (var m2 = 0; m2 < matchers.length; m2++) {
          if (header[c2].indexOf(matchers[m2]) !== -1) return c2;
        }
      }
      return -1;
    }

    // Robust Date Normalizer (Handles locale swaps, date objects, and strings without breaking day > 12)
    function parseRowDate(dateVal, knownMonthIdx, knownYear) {
      if (!dateVal) return "";
      
      // Case 1: Date object from Google Sheets
      if (Object.prototype.toString.call(dateVal) === "[object Date]") {
        var d = dateVal.getDate();
        var m = dateVal.getMonth(); // 0-indexed
        var y = dateVal.getFullYear();
        
        var finalDay = d;
        var finalMonth = m;
        var finalYear = (y >= 2020) ? y : knownYear;

        // If sheet locale swapped day/month for days <= 12:
        if (m !== knownMonthIdx && (d - 1) === knownMonthIdx && m + 1 <= 31) {
          finalMonth = knownMonthIdx;
          finalDay = m + 1;
        } else if (m === knownMonthIdx) {
          finalDay = d;
          finalMonth = m;
        }

        return finalYear + "-" + String(finalMonth + 1).padStart(2, "0") + "-" + String(finalDay).padStart(2, "0");
      }

      // Case 2: String representation
      var str = String(dateVal).trim();
      if (!str) return "";

      // Check ISO format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

      // Check DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
      var parts = str.split(/[\/\-\.]/);
      if (parts.length === 3) {
        var p0 = parseInt(parts[0], 10);
        var p1 = parseInt(parts[1], 10);
        var p2 = parseInt(parts[2], 10);
        var yr = (p2 >= 2020) ? p2 : knownYear;

        if (p0 > 12) {
          // p0 must be Day, p1 is Month
          return yr + "-" + String(p1).padStart(2, "0") + "-" + String(p0).padStart(2, "0");
        } else if (p1 > 12) {
          // p1 must be Day, p0 is Month
          return yr + "-" + String(p0).padStart(2, "0") + "-" + String(p1).padStart(2, "0");
        } else {
          // Disambiguate using known tab month
          if (p1 - 1 === knownMonthIdx) {
            return yr + "-" + String(p1).padStart(2, "0") + "-" + String(p0).padStart(2, "0");
          } else if (p0 - 1 === knownMonthIdx) {
            return yr + "-" + String(p0).padStart(2, "0") + "-" + String(p1).padStart(2, "0");
          }
          return yr + "-" + String(p1).padStart(2, "0") + "-" + String(p0).padStart(2, "0");
        }
      }

      // Fallback: Extract day number
      var numMatch = str.match(/\d+/);
      if (numMatch) {
        var dayNum = parseInt(numMatch[0], 10);
        if (dayNum >= 1 && dayNum <= 31) {
          return knownYear + "-" + String(knownMonthIdx + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
        }
      }

      return str;
    }

    // Process all matching tabs
    sheets.forEach(function (sheet) {
      var tabName = sheet.getName().trim();
      var match = tabName.match(monthPattern);
      if (!match) return;

      var monKey = match[1].toLowerCase();
      var year = parseInt(match[2], 10);
      if (!(monKey in monthOrder)) return;

      var tabMonthIdx = monthOrder[monKey];
      var tabDate = new Date(year, tabMonthIdx, 1);
      if (tabDate < startCutoff) return;

      var data = sheet.getDataRange().getValues();
      if (!data || data.length < 2) return;

      var fullHeader = data[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
      var header11 = fullHeader.slice(0, 11);

      // Main Sales Table
      var col = {
        date:    findCol(header11, ["date"]),
        order:   findCol(header11, ["order no", "order"]),
        name:    findCol(header11, ["name"]),
        phone:   findCol(header11, ["phone"]),
        lead:    findCol(header11, ["lead/inquiries", "lead"]),
        agent:   findCol(header11, ["agent name", "agent"]),
        course:  findCol(header11, ["course name", "course"]),
        type:    findCol(header11, ["full fee/ installments", "full fee/installments", "full fee", "installments", "type"]),
        college: findCol(header11, ["college name", "college"]),
        amount:  findCol(header11, ["amount"])
      };

      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var slice = row.slice(0, 11);
        var hasContent = slice.some(function (v) { return v !== "" && v !== null && v !== undefined; });
        if (!hasContent) continue;

        var rawDate = col.date >= 0 ? row[col.date] : "";
        var dateStr = parseRowDate(rawDate, tabMonthIdx, year);
        var typeVal = col.type >= 0 ? String(row[col.type] || "").trim() : "";
        var amt = col.amount >= 0 ? (Number(row[col.amount]) || 0) : 0;

        allRows.push({
          sr: srCounter++,
          date: dateStr,
          order: col.order >= 0 ? String(row[col.order] || "").trim() : "",
          name: col.name >= 0 ? String(row[col.name] || "").trim() : "",
          phone: col.phone >= 0 ? String(row[col.phone] || "").trim() : "",
          lead: col.lead >= 0 ? String(row[col.lead] || "").trim() : "",
          agent: col.agent >= 0 ? String(row[col.agent] || "").trim() : "",
          course: col.course >= 0 ? String(row[col.course] || "").trim() : "",
          college: col.college >= 0 ? String(row[col.college] || "").trim() : "",
          type: typeVal,
          fp: /full/i.test(typeVal),
          amount: amt
        });
      }

      // CPD Side Table
      var cpdSalesIdx = -1;
      for (var ci = 11; ci < fullHeader.length; ci++) {
        if (fullHeader[ci].indexOf("cpd sales") !== -1) { cpdSalesIdx = ci; break; }
      }
      if (cpdSalesIdx >= 0) {
        var cpdDateIdx = cpdSalesIdx - 1;
        var cpdCollegeIdx = cpdSalesIdx + 1;
        for (var r1 = 1; r1 < data.length; r1++) {
          var row1 = data[r1];
          var cpdDateVal = row1[cpdDateIdx];
          var cpdCount = row1[cpdSalesIdx];
          var cpdCollege = row1[cpdCollegeIdx];
          if (!cpdDateVal && (cpdCount === "" || cpdCount === null || cpdCount === undefined)) continue;
          cpdRows.push({
            date: parseRowDate(cpdDateVal, tabMonthIdx, year),
            college: String(cpdCollege || "").trim(),
            count: Number(cpdCount) || 0
          });
        }
      }

      // Phlebotomy Side Table
      var phlebSalesIdx = -1;
      for (var pi = 11; pi < fullHeader.length; pi++) {
        if (fullHeader[pi].indexOf("phlebotomy sales") !== -1 || fullHeader[pi].indexOf("phelebotomy sales") !== -1) {
          phlebSalesIdx = pi; break;
        }
      }
      if (phlebSalesIdx >= 0) {
        var phlebOrderIdx = phlebSalesIdx - 1;
        var phlebDateIdx = phlebSalesIdx - 2;
        for (var r2 = 1; r2 < data.length; r2++) {
          var row2 = data[r2];
          var pDateVal = row2[phlebDateIdx];
          var pText = String(row2[phlebSalesIdx] || "");
          var pOrderText = String(row2[phlebOrderIdx] || "");
          if (!pDateVal && !pText.trim()) continue;

          var p1Match = pText.match(/p\s*1\s*(\d+)/i);
          var p2Match = pText.match(/p\s*2\s*(\d+)/i);
          var p1 = p1Match ? parseInt(p1Match[1], 10) : 0;
          var p2 = p2Match ? parseInt(p2Match[1], 10) : 0;
          var note = pText.replace(/p\s*1\s*\d+/i, "").replace(/p\s*2\s*\d+/i, "").replace(/[()]/g, "").trim();

          phlebRows.push({
            date: parseRowDate(pDateVal, tabMonthIdx, year),
            p1: p1,
            p2: p2,
            orders: pOrderText.split(/\s+/).filter(Boolean),
            notes: note ? [note] : [],
            total: p1 + p2,
            revenue: 0
          });
        }
      }
    });

    var payload = {
      status: "success",
      generated_at: new Date().toISOString(),
      counts: { sales: allRows.length, cpd: cpdRows.length, phleb: phlebRows.length },
      sales: allRows,
      cpd: cpdRows,
      phleb: phlebRows
    };

    var jsonStr = JSON.stringify(payload);

    // Save to CacheService
    putChunkedCache(cache, cacheKey, jsonStr, CACHE_TTL_SECONDS);

    return createRawResponse(jsonStr, e);

  } catch (error) {
    return createResponse({ status: "error", message: error.toString() }, 500, e);
  }
}

// Helpers for Chunked CacheService (>100KB support)
function putChunkedCache(cache, key, value, ttlSeconds) {
  try {
    var chunkSize = 90000;
    var numChunks = Math.ceil(value.length / chunkSize);
    cache.put(key + "_count", String(numChunks), ttlSeconds);
    for (var i = 0; i < numChunks; i++) {
      cache.put(key + "_" + i, value.substring(i * chunkSize, (i + 1) * chunkSize), ttlSeconds);
    }
  } catch (err) {
    // If cache fails, continue gracefully
  }
}

function getChunkedCache(cache, key) {
  try {
    var countStr = cache.get(key + "_count");
    if (!countStr) return null;
    var count = parseInt(countStr, 10);
    var chunks = [];
    for (var i = 0; i < count; i++) {
      var chunk = cache.get(key + "_" + i);
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  } catch (err) {
    return null;
  }
}

// Format JSON / JSONP response
function createRawResponse(jsonString, e) {
  var callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + jsonString + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

function createResponse(data, statusCode, e) {
  return createRawResponse(JSON.stringify(data), e);
}
