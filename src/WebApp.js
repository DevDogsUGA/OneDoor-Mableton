/**
 * The public web app: report a problem, see open issues and spending, and
 * look up your own request. Deploy as a web app ("Anyone" can access).
 *
 * Public responses never include names, emails, descriptions or house
 * numbers: only category, district, block, counts, status and staff notes.
 */

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.page = (e && e.parameter.page) || 'report';
  t.trackId = (e && e.parameter.id) || '';
  return t.evaluate()
    .setTitle('OneDoor Mableton')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Called from the page with google.script.run. */
function submitReport(form) {
  let photo = null;
  if (form.photo && form.photo.data) {
    if (!/^image\//.test(form.photo.type)) throw new Error('Photo must be an image.');
    const bytes = Utilities.base64Decode(form.photo.data);
    if (bytes.length > 5 * 1024 * 1024) throw new Error('Photo must be under 5 MB.');
    photo = Utilities.newBlob(bytes, form.photo.type, form.photo.name || 'photo');
  }
  const result = processReport_({
    source: 'Web',
    description: String(form.description || '').slice(0, 4000),
    address: String(form.address || '').slice(0, 300),
    district: form.district,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email || '') ? form.email : '',
    photo: photo,
  });
  CacheService.getScriptCache().remove('public');
  return result;
}

function getPublicData() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('public');
  if (hit) return JSON.parse(hit);

  const iso = d => (d instanceof Date ? d.toISOString() : '');
  const issues = readAll_(SHEET.ISSUES).map(i => {
    const cat = categoryById_(i['Category ID']);
    return {
      id: i['Issue ID'],
      titleEn: i['Title (EN)'],
      titleEs: i['Title (ES)'],
      categoryEn: cat.en,
      categoryEs: cat.es,
      owner: i['Owner'],
      department: i['Department'],
      district: String(i['District'] || ''),
      block: i['Location (block)'],
      // ~100 m precision on the public map.
      lat: i['Lat'] ? round_(i['Lat'], 3) : null,
      lng: i['Lng'] ? round_(i['Lng'], 3) : null,
      count: Number(i['Report count'] || 0),
      status: i['Status'],
      firstReported: iso(i['First reported']),
      lastReported: iso(i['Last reported']),
      assignedAt: iso(i['Assigned at']),
      inProgressAt: iso(i['In progress at']),
      fixedAt: iso(i['Fixed at']),
      estCost: Number(i['Est. cost (staff)'] || 0),
      spent: Number(i['Spent (staff)'] || 0),
      noteEn: i['Public note (EN)'],
      noteEs: i['Public note (ES)'],
      sample: i['Sample data'] === 'Yes',
    };
  }).sort((a, b) => b.count - a.count);

  const budget = readAll_(SHEET.BUDGET).map(b => ({
    department: b['Department'],
    budget: Number(b['FY2027 budget'] || 0),
    type: b['Type'],
    source: b['Source'],
  }));

  const data = { issues: issues, budget: budget, updated: new Date().toISOString() };
  try { cache.put('public', JSON.stringify(data), 60); } catch (err) { /* too big to cache; fine */ }
  return data;
}

function lookupRequest(trackingId) {
  const id = String(trackingId || '').trim().toUpperCase();
  const req = findBy_(SHEET.REQUESTS, 'Tracking ID', id);
  if (!req) return null;
  const issue = getPublicData().issues.find(i => i.id === req['Issue ID']) || {};
  const cat = categoryById_(req['Category ID']);
  return {
    trackingId: id,
    received: req['Received'] instanceof Date ? req['Received'].toISOString() : '',
    categoryEn: cat.en,
    categoryEs: cat.es,
    owner: req['Owner'],
    department: req['Department'],
    district: String(req['District'] || ''),
    countyUrl: req['Owner'] === 'County' ? COBB_REPORT_URL : '',
    issue: issue,
  };
}

/**
 * Voice notes. Google's frame blocks live microphone access, so the page lets residents record
 * with their phone's recorder (a file input) and Gemini turns the recording into text.
 * The audio is not stored. Only the transcript goes into the report.
 */
function transcribeVoice(audio) {
  if (!audio || !audio.data) throw new Error('No recording received.');
  const fixType = { 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/x-wav': 'audio/wav', 'audio/mpeg3': 'audio/mpeg', 'audio/3gpp': 'audio/3gpp' };
  let type = String(audio.type || '').toLowerCase();
  if (!type) {
    const ext = String(audio.name || '').split('.').pop().toLowerCase();
    type = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac', '3gp': 'audio/3gpp' }[ext] || '';
  }
  type = fixType[type] || type;
  if (!/^(audio|video)\//.test(type)) throw new Error('Please choose an audio recording.');
  const bytes = Utilities.base64Decode(audio.data);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('That recording is too long. Keep it under about 2 minutes.');
  const out = geminiJson_([
    'Transcribe this voice note from a Mableton, Georgia resident who is reporting a neighborhood problem.',
    'Write exactly what they said, in the language they spoke (English or Spanish). Do not translate or add anything.',
    'If you cannot hear any speech, return an empty string.',
  ].join('\n'), {
    type: 'OBJECT',
    properties: { text: { type: 'STRING' } },
    required: ['text'],
  }, Utilities.newBlob(bytes, type, audio.name || 'voice'));
  const text = out && String(out.text || '').trim();
  if (!text) throw new Error('We could not hear any words. Try again, or type your report.');
  return { text: text.slice(0, 4000) };
}
