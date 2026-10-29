/**
 * Small helpers that treat each sheet tab as a table of objects keyed by the
 * header row. Column order can change in the sheet without breaking code.
 */

const HEADERS = {
  Requests: [
    'Tracking ID', 'Received', 'Source', 'Language', 'Description', 'Address',
    'Lat', 'Lng', 'In Mableton', 'District', 'Category', 'Category ID',
    'Owner', 'Department', 'Emergency', 'Issue ID', 'Summary (EN)', 'Photo',
    'Contact email', 'Sample data',
  ],
  Issues: [
    'Issue ID', 'Title (EN)', 'Title (ES)', 'Category', 'Category ID', 'Owner',
    'Department', 'District', 'Location (block)', 'Lat', 'Lng', 'Map point',
    'Report count', 'Status', 'First reported', 'Last reported',
    'Assigned at', 'In progress at', 'Fixed at', 'Est. cost (staff)',
    'Spent (staff)', 'Public note (EN)', 'Public note (ES)', 'Sample data',
  ],
  Replies: [
    'Reply ID', 'Created', 'Tracking ID', 'Issue ID', 'Reason', 'Language',
    'To', 'Subject', 'Draft reply', 'Approved', 'Sent at', 'Sent by',
  ],
  Budget: [
    'Department', 'FY2027 budget', 'Type', 'Source', 'Note',
  ],
  Digest: [
    'Week of', 'District', 'Reports', 'Top themes', 'Summary (EN)', 'Summary (ES)',
  ],
};

function spreadsheet_() {
  const id = prop_('SPREADSHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  return spreadsheet_().getSheetByName(name);
}

/** All rows as objects. Each object also carries _row (1-based sheet row). */
function readAll_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
}

function append_(name, obj) {
  appendMany_(name, [obj]);
}

function appendMany_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = objs.map(o => headers.map(h => (o[h] === undefined ? '' : o[h])));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

/** Write only the given fields of one row. */
function update_(name, rowNumber, fields) {
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(fields).forEach(k => {
    const col = headers.indexOf(k);
    if (col >= 0) sh.getRange(rowNumber, col + 1).setValue(fields[k]);
  });
}

function findBy_(name, header, value) {
  return readAll_(name).find(r => String(r[header]) === String(value));
}

/** Short IDs without look-alike characters (no 0/O, 1/I/L). */
function newId_(prefix) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return prefix + '-' + s;
}
