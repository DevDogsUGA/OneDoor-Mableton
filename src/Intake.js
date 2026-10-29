/**
 * The intake pipeline. Both the web form and the Google Form end up in
 * processReport_(), which:
 *   1. asks Gemini for category, language and an emergency flag,
 *   2. geocodes the address with the free Census geocoder,
 *   3. tags the council district,
 *   4. groups the report into an existing open issue or starts a new one,
 *   5. logs it in Requests, and
 *   6. drafts an acknowledgment that waits for staff approval.
 */

/**
 * input: { source, description, address, district, email, photo (Blob), sample }
 * Returns what the resident should see right away.
 */
function processReport_(input) {
  const description = String(input.description || '').trim();
  if (!description) throw new Error('Description is required.');

  const ai = classifyReport_(description, input.address, input.photo);
  const cat = categoryById_(ai.category_id);
  const geo = geocode_(input.address);
  const district = districtFor_(geo) || normalizeDistrict_(input.district);
  // An address the Census places outside the city is county business no matter the category.
  const owner = geo.inMableton === false ? 'County' : cat.owner;
  const photoUrl = input.photo ? savePhoto_(input.photo) : '';
  const trackingId = newId_('MBL');
  const now = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let issue;
  try {
    issue = groupIntoIssue_({ ai: ai, cat: cat, geo: geo, district: district, owner: owner, now: now, sample: !!input.sample });
    append_(SHEET.REQUESTS, {
      'Tracking ID': trackingId,
      'Received': now,
      'Source': input.source || 'Web',
      'Language': ai.language,
      'Description': description,
      'Address': input.address || '',
      'Lat': geo.lat || '',
      'Lng': geo.lng || '',
      'In Mableton': geo.inMableton === undefined ? 'Unknown' : (geo.inMableton ? 'Yes' : 'No'),
      'District': district,
      'Category': cat.en,
      'Category ID': cat.id,
      'Owner': owner,
      'Department': cat.dept,
      'Emergency': ai.emergency ? 'Yes' : 'No',
      'Issue ID': issue['Issue ID'],
      'Summary (EN)': ai.summary_en,
      'Photo': photoUrl,
      'Contact email': input.email || '',
      'Sample data': input.sample ? 'Yes' : 'No',
    });
  } finally {
    lock.releaseLock();
  }

  if (input.email) {
    queueReply_({
      reason: owner === 'County' ? 'county referral' : 'received',
      trackingId: trackingId,
      issueId: issue['Issue ID'],
      language: ai.language,
      to: input.email,
      category: ai.language === 'es' ? cat.es : cat.en,
      owner: owner,
      reportCount: issue['Report count'],
    });
  }

  return {
    trackingId: trackingId,
    issueId: issue['Issue ID'],
    categoryEn: cat.en,
    categoryEs: cat.es,
    owner: owner,
    department: cat.dept,
    district: district,
    emergency: ai.emergency,
    reportCount: issue['Report count'],
    status: issue['Status'],
    countyUrl: owner === 'County' ? COBB_REPORT_URL : '',
  };
}

/** Adds the report to a matching open issue, or creates a new issue. */
function groupIntoIssue_(r) {
  const issues = readAll_(SHEET.ISSUES);
  const candidates = issues
    .filter(i => i['Category ID'] === r.cat.id && OPEN_STATUSES.concat([STATUS.REFERRED]).indexOf(i['Status']) >= 0)
    .map(i => Object.assign(i, { _distance: distanceM_(r.geo, { lat: i['Lat'], lng: i['Lng'] }) }))
    .filter(i => i._distance <= DUPLICATE_RADIUS_M ||
      (!r.geo.lat && r.geo.block && i['Location (block)'] === r.geo.block))
    .sort((a, b) => a._distance - b._distance)
    .slice(0, 10);

  const matchId = r.sample ? (candidates[0] && candidates[0]['Issue ID']) || '' : matchDuplicate_(r.ai.summary_en, candidates);
  const match = candidates.find(c => c['Issue ID'] === matchId);
  if (match) {
    const count = Number(match['Report count'] || 0) + 1;
    update_(SHEET.ISSUES, match._row, { 'Report count': count, 'Last reported': r.now });
    match['Report count'] = count;
    return match;
  }

  const issue = {
    'Issue ID': newId_('ISS'),
    'Title (EN)': r.ai.title_en,
    'Title (ES)': r.ai.title_es,
    'Category': r.cat.en,
    'Category ID': r.cat.id,
    'Owner': r.owner,
    'Department': r.cat.dept,
    'District': r.district,
    'Location (block)': r.geo.block || '',
    'Lat': r.geo.lat ? round_(r.geo.lat, 4) : '',
    'Lng': r.geo.lng ? round_(r.geo.lng, 4) : '',
    'Map point': r.geo.lat ? round_(r.geo.lat, 4) + ',' + round_(r.geo.lng, 4) : '',
    'Report count': 1,
    'Status': r.owner === 'County' ? STATUS.REFERRED : STATUS.RECEIVED,
    'First reported': r.now,
    'Last reported': r.now,
    'Sample data': r.sample ? 'Yes' : 'No',
  };
  append_(SHEET.ISSUES, issue);
  return issue;
}

/**
 * Census geocoder: free, no key. Also tells us whether the point is inside
 * the City of Mableton's limits ("Incorporated Places" layer).
 */
function geocode_(address) {
  const out = { block: blockOf_(address) };
  if (!address) return out;
  let q = String(address);
  if (!/\bGA\b|georgia/i.test(q)) q += ', Mableton, GA';
  const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress' +
    '?benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json&address=' +
    encodeURIComponent(q);
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return out;
    const match = JSON.parse(res.getContentText()).result.addressMatches[0];
    if (!match) return out;
    out.lat = match.coordinates.y;
    out.lng = match.coordinates.x;
    out.block = blockOf_(match.matchedAddress) || out.block;
    const places = match.geographies && match.geographies['Incorporated Places'];
    if (places) out.inMableton = places.some(p => /mableton/i.test(p.NAME || p.BASENAME || ''));
  } catch (err) {
    console.warn('Geocoder failed: ' + err);
  }
  return out;
}

/**
 * "5240 FLOYD RD SW, MABLETON, GA, 30126" -> "5200 block of Floyd Rd SW".
 * Public views only ever show the block, never a house number.
 */
function blockOf_(address) {
  if (!address) return '';
  const first = String(address).split(',')[0].trim();
  const m = first.match(/^(\d+)\s+(.*)$/);
  const street = titleCase_(m ? m[2] : first);
  return m ? Math.floor(Number(m[1]) / 100) * 100 + ' block of ' + street : street;
}

function titleCase_(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())
    .replace(/\b(Sw|Se|Nw|Ne)\b/g, d => d.toUpperCase());
}

/**
 * Council district from a GeoJSON of district boundaries, if you've put one
 * in Drive and saved its file ID as Script Property DISTRICTS_GEOJSON_FILE_ID.
 * Without it, we use the district the resident picked (or leave it blank).
 */
function districtFor_(geo) {
  const fileId = prop_('DISTRICTS_GEOJSON_FILE_ID');
  if (!fileId || !geo.lat) return '';
  const gj = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());
  const key = prop_('DISTRICTS_PROPERTY') || 'DISTRICT';
  const pt = [geo.lng, geo.lat];
  for (const f of gj.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (polys.some(p => inRing_(pt, p[0]) && !p.slice(1).some(h => inRing_(pt, h)))) {
      return normalizeDistrict_(f.properties[key] || f.properties.District || f.properties.NAME);
    }
  }
  return '';
}

function inRing_(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function normalizeDistrict_(d) {
  const m = String(d || '').match(/[1-6]/);
  return m ? m[0] : '';
}

function distanceM_(a, b) {
  if (!a.lat || !b.lat) return Infinity;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function round_(n, places) {
  const f = Math.pow(10, places);
  return Math.round(Number(n) * f) / f;
}

/** Photos go to a private Drive folder; only staff see the link. */
function savePhoto_(blob) {
  const folder = DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID'));
  return folder.createFile(blob).getUrl();
}

/** Puts a drafted reply in the Replies tab. Nothing is sent until staff approve it. */
function queueReply_(c) {
  c.trackUrl = trackUrl_(c.trackingId);
  const draft = draftReply_(c);
  append_(SHEET.REPLIES, {
    'Reply ID': newId_('RPL'),
    'Created': new Date(),
    'Tracking ID': c.trackingId,
    'Issue ID': c.issueId,
    'Reason': c.reason,
    'Language': c.language,
    'To': c.to,
    'Subject': draft.subject,
    'Draft reply': draft.body,
    'Approved': false,
  });
}

function trackUrl_(trackingId) {
  const base = prop_('WEB_APP_URL') || ScriptApp.getService().getUrl() || '';
  return base ? base + '?page=track&id=' + trackingId : trackingId;
}

/** Installed by setup(): runs on every Google Form submission. */
function onFormSubmitHandler(e) {
  const answers = {};
  e.response.getItemResponses().forEach(r => { answers[r.getItem().getTitle()] = r.getResponse(); });
  const pick = prefix => {
    const k = Object.keys(answers).find(t => t.indexOf(prefix) === 0);
    return k ? answers[k] : '';
  };
  processReport_({
    source: 'Google Form',
    description: pick('Describe'),
    address: pick('Address'),
    district: pick('Council district'),
    email: pick('Email'),
  });
}
