// ============================================================
// QE Scheduling — Google Apps Script Backend
// Deploy as Web App (Execute as: me, Access: Anyone)
// ============================================================

// --------------- Constants ---------------

var AVAILABILITY_SHEET = "Availability";
var CONFIG_SHEET = "Config";

// All weekdays April 10–24, 2026
var DATES = [
  "2026-04-10", // Fri
  "2026-04-13", // Mon
  "2026-04-14", // Tue
  "2026-04-15", // Wed
  "2026-04-16", // Thu
  "2026-04-17", // Fri
  "2026-04-20", // Mon
  "2026-04-21", // Tue
  "2026-04-22", // Wed
  "2026-04-23", // Thu
  "2026-04-24"  // Fri
];

// Hours 9–16 (9:00 AM to 4:00–5:00 PM), 8 slots per day
var HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

// Build the full list of 88 slot IDs once
function getAllSlotIds() {
  var slots = [];
  for (var d = 0; d < DATES.length; d++) {
    for (var h = 0; h < HOURS.length; h++) {
      var hr = HOURS[h] < 10 ? "0" + HOURS[h] : "" + HOURS[h];
      slots.push(DATES[d] + "_" + hr);
    }
  }
  return slots; // length = 88
}

// --------------- Entry point ---------------

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

// --------------- Action handlers ---------------

function handleLogin(body) {
  var role = body.role || "user";
  var password = body.password || "";

  if (role !== "user" && role !== "admin") {
    return { success: false, error: "Invalid role." };
  }

  // Only admin requires password verification
  if (role === "admin") {
    if (!verifyPassword(password, role)) {
      return { success: false, error: "Incorrect password." };
    }
  }

  return { success: true, role: role };
}

function handleGetAvailability(body) {
  // No password required for professors
  var name = (body.name || "").trim();
  if (!name) {
    return { success: false, error: "Name is required." };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    return { success: true, slots: {} };
  }

  var allSlots = getAllSlotIds();
  var data = sheet.getDataRange().getValues();
  var headers = data[0]; // row 1

  // Build header-index map (slot ID -> column index)
  var slotCol = {};
  for (var c = 1; c < headers.length; c++) {
    slotCol[String(headers[c]).trim()] = c;
  }

  // Find professor row (case-insensitive, trimmed)
  var nameLower = name.toLowerCase();
  var rowData = null;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toLowerCase() === nameLower) {
      rowData = data[r];
      break;
    }
  }

  var slots = {};
  if (rowData) {
    for (var s = 0; s < allSlots.length; s++) {
      var col = slotCol[allSlots[s]];
      if (col !== undefined && rowData[col] == 1) {
        slots[allSlots[s]] = 1;
      }
    }
  }

  return { success: true, slots: slots };
}

function handleSaveAvailability(body) {
  // No password required for professors

  var name = (body.name || "").trim();
  if (!name) {
    return { success: false, error: "Name is required." };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    // Auto-create the sheet with headers
    initSheet();
    sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  }

  var allSlots = getAllSlotIds();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Build header-index map
  var slotCol = {};
  for (var c = 1; c < headers.length; c++) {
    slotCol[String(headers[c]).trim()] = c;
  }

  // Find existing professor row (case-insensitive)
  var nameLower = name.toLowerCase();
  var profRow = -1; // 0-based index in data[]
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toLowerCase() === nameLower) {
      profRow = r;
      break;
    }
  }

  // If not found, append a new row
  if (profRow === -1) {
    profRow = data.length; // next row (0-based in data, 1-based in sheet = profRow+1)
    sheet.getRange(profRow + 1, 1).setValue(name); // store original casing
  }

  // Write slot values
  var incoming = body.slots || {};
  for (var s = 0; s < allSlots.length; s++) {
    var sid = allSlots[s];
    var col = slotCol[sid];
    if (col !== undefined) {
      var val = (incoming[sid] == 1) ? 1 : 0;
      sheet.getRange(profRow + 1, col + 1).setValue(val);
    }
  }

  return { success: true };
}

function handleGetAll(body) {
  if (!verifyPassword(body.password, "admin")) {
    return { success: false, error: "Incorrect password." };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    return { success: true, professors: [] };
  }

  var allSlots = getAllSlotIds();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Build header-index map
  var slotCol = {};
  for (var c = 1; c < headers.length; c++) {
    slotCol[String(headers[c]).trim()] = c;
  }

  var professors = [];
  for (var r = 1; r < data.length; r++) {
    var pName = String(data[r][0]).trim();
    if (!pName) continue;

    var slots = {};
    for (var s = 0; s < allSlots.length; s++) {
      var sid = allSlots[s];
      var col = slotCol[sid];
      if (col !== undefined) {
        slots[sid] = (data[r][col] == 1) ? 1 : 0;
      }
    }
    professors.push({ name: pName, slots: slots });
  }

  return { success: true, professors: professors };
}

function handleGetAllPublic(body) {
  // No password required — professors can see each other's availability
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    return { success: true, professors: [] };
  }

  var allSlots = getAllSlotIds();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var slotCol = {};
  for (var c = 1; c < headers.length; c++) {
    slotCol[String(headers[c]).trim()] = c;
  }

  var professors = [];
  for (var r = 1; r < data.length; r++) {
    var pName = String(data[r][0]).trim();
    if (!pName) continue;

    var slots = {};
    for (var s = 0; s < allSlots.length; s++) {
      var sid = allSlots[s];
      var col = slotCol[sid];
      if (col !== undefined) {
        slots[sid] = (data[r][col] == 1) ? 1 : 0;
      }
    }
    professors.push({ name: pName, slots: slots });
  }

  return { success: true, professors: professors };
}

// --------------- Manual setup helper ---------------

/**
 * Run this function once from the Apps Script editor to create the
 * "Availability" sheet with the 88 time-slot headers (A1 = "Professor",
 * B1 onward = slot IDs).  Safe to re-run: it only writes headers into
 * row 1 and will not overwrite professor data in row 2+.
 */
/**
 * Run this to fully reset — deletes all professor data and re-creates headers.
 */
function resetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (sheet) ss.deleteSheet(sheet);
  initSheet();
}

function initSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AVAILABILITY_SHEET);
  }

  var allSlots = getAllSlotIds();
  var headerRow = ["Professor"].concat(allSlots);

  // Write the entire header row at once
  sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);

  // Freeze the header row and the name column for easier navigation
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}
