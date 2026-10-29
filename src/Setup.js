/**
 * Run setup() once from the Apps Script editor. It creates (or reuses):
 *   - the "OneDoor Mableton – Data" spreadsheet with all tabs,
 *   - the bilingual Google Form, linked to that spreadsheet,
 *   - a private Drive folder for photos,
 *   - the triggers (form submit, sheet edits, weekly digest).
 * It's safe to run again; it only creates what's missing.
 */
function setup() {
  let ss;
  if (prop_('SPREADSHEET_ID')) {
    ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
  } else {
    ss = SpreadsheetApp.create('OneDoor Mableton – Data');
    setProp_('SPREADSHEET_ID', ss.getId());
  }

  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]])
        .setFontWeight('bold').setBackground('#e8eef7');
      sh.setFrozenRows(1);
    }
  });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  addValidation_(ss);
  if (ss.getSheetByName(SHEET.BUDGET).getLastRow() < 2) seedBudget_();

  if (!prop_('PHOTO_FOLDER_ID')) {
    setProp_('PHOTO_FOLDER_ID', DriveApp.createFolder('OneDoor Mableton – Photos (private)').getId());
  }

  let form;
  if (prop_('FORM_ID')) {
    form = FormApp.openById(prop_('FORM_ID'));
  } else {
    form = createForm_();
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    setProp_('FORM_ID', form.getId());
  }

  installTriggers_(ss, form);

  console.log('Data sheet: ' + ss.getUrl());
  console.log('Form (share this): ' + form.getPublishedUrl());
  console.log('Next: Deploy > New deployment > Web app, then run saveWebAppUrl("<the /exec URL>").');
}

function addValidation_(ss) {
  const issues = ss.getSheetByName(SHEET.ISSUES);
  const statusCol = HEADERS.Issues.indexOf('Status') + 1;
  issues.getRange(2, statusCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.values(STATUS), true).build());
  const replies = ss.getSheetByName(SHEET.REPLIES);
  const approvedCol = HEADERS.Replies.indexOf('Approved') + 1;
  // Validation only (no cell values), so appends still land after the last real row.
  replies.getRange(2, approvedCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build());
  replies.setColumnWidth(HEADERS.Replies.indexOf('Draft reply') + 1, 420);
}

function createForm_() {
  const form = FormApp.create('OneDoor Mableton: Report a problem / Reporte un problema');
  form.setDescription(
    'Tell the City of Mableton about a problem in your neighborhood. You do not need an account.\n' +
    'Informe a la Ciudad de Mableton sobre un problema en su vecindario. No necesita una cuenta.\n\n' +
    'Emergency? Call 911. / ¿Emergencia? Llame al 911.\n\n' +
    'Prototype for the Georgia 311 Challenge. / Prototipo para el Georgia 311 Challenge.');
  form.setCollectEmail(false);
  form.setConfirmationMessage(
    'Thank you! If you left an email, we will send your tracking number after a staff member reviews your report.\n' +
    '¡Gracias! Si dejó su correo, le enviaremos su número de seguimiento cuando el personal revise su reporte.');
  form.addParagraphTextItem()
    .setTitle('Describe the problem / Describa el problema')
    .setHelpText('What is it and how long has it been there? / ¿Qué es y desde cuándo está ahí?')
    .setRequired(true);
  form.addTextItem()
    .setTitle('Address or nearest intersection / Dirección o intersección más cercana')
    .setRequired(true);
  form.addListItem()
    .setTitle('Council district (optional) / Distrito del concejo (opcional)')
    .setChoiceValues(DISTRICTS.map(d => 'District ' + d + ' / Distrito ' + d).concat(['Not sure / No sé']));
  form.addTextItem()
    .setTitle('Email for updates (optional) / Correo para recibir noticias (opcional)')
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  return form;
}

function installTriggers_(ss, form) {
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (existing.indexOf('onFormSubmitHandler') < 0) {
    ScriptApp.newTrigger('onFormSubmitHandler').forForm(form).onFormSubmit().create();
  }
  if (existing.indexOf('onSheetEdit') < 0) {
    ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  }
  if (existing.indexOf('buildWeeklyDigest') < 0) {
    ScriptApp.newTrigger('buildWeeklyDigest').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  }
}

/** After deploying the web app, run this once so emails link to it. */
function saveWebAppUrl(url) {
  setProp_('WEB_APP_URL', url);
}

/**
 * Department lines from the FY2027 budget presentation (mableton.gov/DocumentCenter/View/911).
 * The adopted budget (View/914): $57.7M total, $23.2M General Fund. Add the other
 * department lines from the PDF here or straight in the Budget tab.
 */
function seedBudget_() {
  const src911 = 'https://www.mableton.gov/DocumentCenter/View/911';
  appendMany_(SHEET.BUDGET, [
    { 'Department': 'Code Enforcement', 'FY2027 budget': 1217600, 'Type': 'General Fund', 'Source': src911 },
    { 'Department': 'Parks & Recreation', 'FY2027 budget': 1255300, 'Type': 'General Fund', 'Source': src911 },
    { 'Department': 'Public Works', 'FY2027 budget': 275000, 'Type': 'General Fund', 'Source': src911 },
    { 'Department': 'Comm Dev, Building & Code Enforcement software', 'FY2027 budget': 250000, 'Type': 'Capital', 'Source': src911 },
  ].map(r => Object.assign(r, { 'Note': 'From the FY2027 budget presentation; check against the adopted budget.' })));
}

