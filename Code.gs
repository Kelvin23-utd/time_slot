// ============================================================
// Time Slot Booking — Google Apps Script Backend (v2)
// Deploy as Web App (Execute as: me, Access: Anyone)
//
// v2: slot ids are NOT hardcoded here any more. The page (index.html) owns
// the dates. When a booking arrives with slot ids the sheet has not seen,
// the matching header columns are added automatically. Every response
// carries "version": 2 so the page can tell this backend from the old one
// (v1 hardcoded its own dates and silently dropped anything else).
// ============================================================

var AVAILABILITY_SHEET = "Availability";
var CONFIG_SHEET = "Config";
var API_VERSION = 2;
var SLOT_RE = /^\d{4}-\d{2}-\d{2}_\d{2}$/;   // e.g. 2026-09-04_09
var MAX_SLOTS_PER_SAVE = 1000;

// --------------- Entry points ---------------

// GET /exec in a browser -> quick health check of the deployment.
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, version: API_VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    var result;
    switch (action) {
      case "login":
        result = handleLogin(body);
        break;
      case "getAvailability":
        result = handleGetAvailability(body);
        break;
      case "saveAvailability":
        result = handleSaveAvailability(body);
        break;
      case "getAll":
        result = handleGetAll(body);
        break;
      case "getAllPublic":
        result = handleGetAllPublic(body);
        break;
      default:
        result = { success: false, error: "Unknown action: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var errorResponse = { success: false, error: err.message || String(err) };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --------------- Password helpers ---------------

function getPassword(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === key.toLowerCase()) {
      return String(data[i][1]).trim();
    }
  }
  return null;
}

function verifyPassword(password, role) {
  var key = (role === "admin") ? "admin_password" : "user_password";
  var stored = getPassword(key);
  if (stored === null) return false;
  return String(password).trim() === stored;
}

// --------------- Sheet helpers ---------------

// Reads the whole sheet once: header row, all rows, and slotId -> 0-based column.
function readSheet(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length === 0) data = [["Name"]];
  var headers = data[0];
  var slotCol = {};
  for (var c = 1; c < headers.length; c++) {
    var h = String(headers[c]).trim();
    if (SLOT_RE.test(h)) slotCol[h] = c;
  }
  return { data: data, headers: headers, slotCol: slotCol };
}

// 0-based index of the row whose name matches (case-insensitive, trimmed), or -1.
function findRow(data, name) {
  var nameLower = String(name).trim().toLowerCase();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toLowerCase() === nameLower) return r;
  }
  return -1;
}

// { slotId: 0|1 } for one row. With onlyOnes, only the 1s are included.
function rowToSlots(row, slotCol, onlyOnes) {
  var slots = {};
  var ids = Object.keys(slotCol);
  for (var i = 0; i < ids.length; i++) {
    var v = (row && row[slotCol[ids[i]]] == 1) ? 1 : 0;
    if (v === 1 || !onlyOnes) slots[ids[i]] = v;
  }
  return slots;
}

function allBookings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  // The people list is still called "professors" (v1 name) so the page's API stays stable.
  if (!sheet) return { success: true, version: API_VERSION, slotIds: [], professors: [] };

  var s = readSheet(sheet);
  var people = [];
  for (var r = 1; r < s.data.length; r++) {
    var pName = String(s.data[r][0]).trim();
    if (!pName) continue;
    people.push({ name: pName, slots: rowToSlots(s.data[r], s.slotCol, false) });
  }
  return { success: true, version: API_VERSION, slotIds: Object.keys(s.slotCol).sort(), professors: people };
}

// --------------- Action handlers ---------------

function handleLogin(body) {
  var role = body.role || "user";
  var password = body.password || "";

  if (role !== "user" && role !== "admin") {
    return { success: false, error: "Invalid role." };
  }
  if (role === "admin" && !verifyPassword(password, role)) {
    return { success: false, error: "Incorrect password." };
  }
  return { success: true, version: API_VERSION, role: role };
}

// One person's picks (only the 1s). No password required.
function handleGetAvailability(body) {
  var name = (body.name || "").trim();
  if (!name) return { success: false, error: "Name is required." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) return { success: true, version: API_VERSION, slots: {} };

  var s = readSheet(sheet);
  var r = findRow(s.data, name);
  return { success: true, version: API_VERSION, slots: (r === -1) ? {} : rowToSlots(s.data[r], s.slotCol, true) };
}

// Store one person's picks. No password required. A person's booking is exactly
// what they last sent: every known slot column is written 1 or 0.
function handleSaveAvailability(body) {
  var name = (body.name || "").trim();
  if (!name) return { success: false, error: "Name is required." };

  var incoming = body.slots || {};
  var ids = [];
  for (var k in incoming) {
    if (incoming.hasOwnProperty(k) && SLOT_RE.test(String(k).trim())) ids.push(String(k).trim());
  }
  if (ids.length > MAX_SLOTS_PER_SAVE) return { success: false, error: "Too many slots." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    initSheet();
    sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  }
  var s = readSheet(sheet);

  // 1. Add header columns for slot ids the sheet has not seen yet.
  var missing = [];
  for (var i = 0; i < ids.length; i++) {
    if (s.slotCol[ids[i]] === undefined) missing.push(ids[i]);
  }
  if (missing.length > 0) {
    missing.sort();
    sheet.getRange(1, s.headers.length + 1, 1, missing.length).setValues([missing]);
    for (var m = 0; m < missing.length; m++) {
      s.slotCol[missing[m]] = s.headers.length;   // 0-based index in row arrays
      s.headers.push(missing[m]);
    }
  }

  // 2. Find this person's row, or append one.
  var r = findRow(s.data, name);
  var rowIndex = (r === -1) ? s.data.length + 1 : r + 1;   // 1-based sheet row
  var existing = (r === -1) ? [] : s.data[r];
  var storedName = (r === -1) ? name : String(existing[0]).trim();

  // 3. Write the whole row at once: slot columns get 0/1, anything else keeps its value.
  var row = [storedName];
  for (var c = 1; c < s.headers.length; c++) {
    var h = String(s.headers[c]).trim();
    if (SLOT_RE.test(h)) row.push(incoming[h] == 1 ? 1 : 0);
    else row.push(existing[c] !== undefined ? existing[c] : "");
  }
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  return { success: true, version: API_VERSION };
}

// Everyone's picks; admin password required.
function handleGetAll(body) {
  if (!verifyPassword(body.password, "admin")) {
    return { success: false, error: "Incorrect password." };
  }
  return allBookings();
}

// Everyone's picks; no password (guests can see who else picked a slot).
function handleGetAllPublic(body) {
  return allBookings();
}

// --------------- Manual setup helpers ---------------

/**
 * Run once from the Apps Script editor: creates the "Availability" sheet
 * with "Name" in A1 and freezes the header row / name column. Slot columns
 * are added automatically by the first booking. Safe to re-run.
 */
function initSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) sheet = ss.insertSheet(AVAILABILITY_SHEET);
  if (String(sheet.getRange(1, 1).getValue()).trim() === "") {
    sheet.getRange(1, 1).setValue("Name");
  }
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}

/**
 * Full reset: deletes ALL bookings (and old date columns) and re-creates the sheet.
 */
function resetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (sheet) ss.deleteSheet(sheet);
  initSheet();
}
