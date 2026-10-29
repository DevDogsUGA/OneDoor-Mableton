/**
 * Staff side. Staff work straight in the Google Sheet (and Looker Studio
 * reads the same sheet):
 *   - Issues tab: change Status. Timestamps fill in on their own, and when an
 *     issue is marked Fixed, a "fixed" reply is drafted for every resident who
 *     left an email.
 *   - Replies tab: read the draft, edit it if needed, tick Approved. Only then
 *     is the email sent. Nothing goes out without a person approving it.
 */

/** Installed by setup() as an on-edit trigger for the data spreadsheet. */
function onSheetEdit(e) {
  const sh = e.range.getSheet();
  const header = sh.getRange(1, e.range.getColumn()).getValue();
  const row = e.range.getRow();
  if (row < 2 || e.range.getNumRows() > 1) return;

  if (sh.getName() === SHEET.ISSUES && header === 'Status') {
    onIssueStatusChange_(row, String(e.value || ''));
  }
  if (sh.getName() === SHEET.REPLIES && header === 'Approved' && String(e.value).toUpperCase() === 'TRUE') {
    sendReply_(row, e.user ? e.user.getEmail() : '');
  }
}

function onIssueStatusChange_(row, status) {
  const stamp = {
    [STATUS.ASSIGNED]: 'Assigned at',
    [STATUS.IN_PROGRESS]: 'In progress at',
    [STATUS.FIXED]: 'Fixed at',
  }[status];
  if (stamp) update_(SHEET.ISSUES, row, { [stamp]: new Date() });

  if (status === STATUS.FIXED) {
    const issue = readAll_(SHEET.ISSUES).find(i => i._row === row);
    readAll_(SHEET.REQUESTS)
      .filter(r => r['Issue ID'] === issue['Issue ID'] && r['Contact email'])
      .forEach(r => queueReply_({
        reason: 'fixed',
        trackingId: r['Tracking ID'],
        issueId: issue['Issue ID'],
        language: r['Language'],
        to: r['Contact email'],
        category: r['Language'] === 'es' ? issue['Title (ES)'] : issue['Title (EN)'],
        publicNote: r['Language'] === 'es' ? issue['Public note (ES)'] : issue['Public note (EN)'],
      }));
  }
}

function sendReply_(row, approver) {
  const reply = readAll_(SHEET.REPLIES).find(r => r._row === row);
  if (!reply || reply['Sent at'] || !reply['To']) return;
  MailApp.sendEmail({
    to: reply['To'],
    subject: reply['Subject'],
    body: reply['Draft reply'],
    name: 'City of Mableton (OneDoor prototype)',
  });
  update_(SHEET.REPLIES, row, { 'Sent at': new Date(), 'Sent by': approver || 'staff' });
}

/**
 * Weekly district digest, in the spirit of Jigsaw's Sensemaking tools:
 * Gemini reads the week's report summaries per district and names the top
 * themes. setup() schedules it for Monday mornings; you can also run it by hand.
 */
function buildWeeklyDigest() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const recent = readAll_(SHEET.REQUESTS).filter(r => new Date(r['Received']) >= since);
  const weekOf = Utilities.formatDate(since, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const rows = [];

  DISTRICTS.concat(['']).forEach(d => {
    const items = recent.filter(r => String(r['District']) === d);
    if (!items.length) return;
    const lines = items.slice(0, 200).map(r => '- [' + r['Category'] + '] ' + r['Summary (EN)']).join('\n');
    const out = geminiJson_([
      'You help a small city government understand what residents are reporting.',
      'Below are this week\'s resident reports from ' + (d ? 'Council District ' + d : 'an unknown district') + ' in Mableton, GA.',
      'Name the top 3 themes (short phrases) and write a 2-sentence neutral summary for staff, in English and in Spanish.',
      'Mention counts where useful. Do not include any personal details.',
      '',
      lines,
    ].join('\n'), {
      type: 'OBJECT',
      properties: {
        themes: { type: 'ARRAY', items: { type: 'STRING' } },
        summary_en: { type: 'STRING' },
        summary_es: { type: 'STRING' },
      },
      required: ['themes', 'summary_en', 'summary_es'],
    }) || fallbackDigest_(items);
    rows.push({
      'Week of': weekOf,
      'District': d || 'Unknown',
      'Reports': items.length,
      'Top themes': out.themes.join('; '),
      'Summary (EN)': out.summary_en,
      'Summary (ES)': out.summary_es,
    });
  });
  appendMany_(SHEET.DIGEST, rows);
  return rows.length;
}

function fallbackDigest_(items) {
  const counts = {};
  items.forEach(r => { counts[r['Category']] = (counts[r['Category']] || 0) + 1; });
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  const text = top.map(t => t + ' (' + counts[t] + ')').join(', ');
  return { themes: top, summary_en: 'Most reported: ' + text + '.', summary_es: 'Lo más reportado: ' + text + '.' };
}
