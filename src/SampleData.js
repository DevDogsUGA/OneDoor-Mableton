/**
 * Demo data. Every row is marked "Sample data = Yes" and the public page
 * labels it, so nobody mistakes it for real residents' reports.
 * Run seedSampleData() once from the editor; clearSampleData() removes it.
 * It writes straight to the sheets (no Gemini calls) to save free-tier quota.
 */

// Streets in and around Mableton. Points and districts are approximate, for the demo only.
const SAMPLE_STREETS = [
  { street: 'Floyd Rd SW', lat: 33.8190, lng: -84.5830, district: '3' },
  { street: 'Veterans Memorial Hwy SW', lat: 33.8160, lng: -84.5650, district: '4' },
  { street: 'Mableton Pkwy SE', lat: 33.8055, lng: -84.5390, district: '5' },
  { street: 'Pebblebrook Rd SW', lat: 33.8030, lng: -84.6020, district: '2' },
  { street: 'Factory Shoals Rd SW', lat: 33.7890, lng: -84.6110, district: '1' },
  { street: 'Church St SW', lat: 33.8205, lng: -84.5790, district: '3' },
  { street: 'Clay Rd SW', lat: 33.8320, lng: -84.6010, district: '2' },
  { street: 'Hicks Rd SW', lat: 33.8250, lng: -84.6150, district: '1' },
  { street: 'Bankhead Hwy', lat: 33.7930, lng: -84.5480, district: '6' },
  { street: 'Old Powder Springs Rd SW', lat: 33.8350, lng: -84.5900, district: '4' },
];

const SAMPLE_TEXT = {
  illegal_dumping: ['Someone dumped old mattresses and tires by the road.', 'Tiraron colchones y llantas al lado de la calle.'],
  overgrown_lot: ['The empty lot has grass over three feet tall and snakes.', 'El lote vacío tiene el pasto muy alto.'],
  junk_vehicle: ['A car with no tags has been parked on the lawn for months.', 'Hay un carro sin placas abandonado hace meses.'],
  trash_on_property: ['Trash bags piled up behind the house, attracting rats.', 'Bolsas de basura acumuladas detrás de la casa.'],
  unsafe_structure: ['Vacant house with a caved-in roof, kids go inside.', 'Casa vacía con el techo caído.'],
  housing_conditions: ['My apartment has mold and the landlord will not fix it.', 'Mi apartamento tiene moho y el dueño no lo arregla.'],
  missed_pickup: ['Our trash was not picked up this week.', 'No recogieron la basura esta semana.'],
  illegal_signs: ['Lots of "we buy houses" signs stuck in the median.', 'Muchos letreros pegados en la mediana.'],
  park_maintenance: ['Broken swing and overflowing trash cans at the park.', 'Columpio roto y basureros llenos en el parque.'],
  road_pothole: ['Huge pothole in the right lane.', 'Un bache enorme en el carril derecho.'],
  stormwater: ['Storm drain is clogged and the street floods.', 'El desagüe está tapado y se inunda la calle.'],
};

function seedSampleData() {
  // How often each category shows up, roughly matching what council members describe.
  const weights = { illegal_dumping: 9, overgrown_lot: 6, junk_vehicle: 5, trash_on_property: 4, unsafe_structure: 2,
    housing_conditions: 2, missed_pickup: 4, illegal_signs: 2, park_maintenance: 2, road_pothole: 4, stormwater: 2 };
  const pool = [];
  Object.keys(weights).forEach(k => { for (let i = 0; i < weights[k]; i++) pool.push(k); });

  const statuses = [STATUS.RECEIVED, STATUS.ASSIGNED, STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.IN_PROGRESS, STATUS.FIXED];
  const now = Date.now(), day = 24 * 3600 * 1000;
  const issues = [], requests = [];

  for (let n = 0; n < 34; n++) {
    const cat = categoryById_(pool[Math.floor(Math.random() * pool.length)]);
    const s = SAMPLE_STREETS[Math.floor(Math.random() * SAMPLE_STREETS.length)];
    const lat = s.lat + (Math.random() - 0.5) * 0.01, lng = s.lng + (Math.random() - 0.5) * 0.01;
    const houseBlock = (Math.floor(Math.random() * 60) + 10) * 100;
    // A few issues get many reports; most get one or two.
    const count = Math.max(1, Math.round(Math.pow(Math.random(), 3) * 14));
    const first = new Date(now - (5 + Math.random() * 50) * day);
    const status = cat.owner === 'County' ? STATUS.REFERRED : statuses[Math.floor(Math.random() * statuses.length)];
    const step = i => new Date(first.getTime() + i * (1 + Math.random() * 3) * day);
    const issueId = newId_('ISS');
    const est = cat.owner === 'City' ? Math.round((200 + Math.random() * 3800) / 50) * 50 : '';
    const spentFactor = { [STATUS.IN_PROGRESS]: 0.4, [STATUS.FIXED]: 1 }[status] || 0;

    issues.push({
      'Issue ID': issueId,
      'Title (EN)': cat.en + ' on ' + s.street,
      'Title (ES)': cat.es + ' en ' + s.street,
      'Category': cat.en,
      'Category ID': cat.id,
      'Owner': cat.owner,
      'Department': cat.dept,
      'District': s.district,
      'Location (block)': houseBlock + ' block of ' + s.street,
      'Lat': round_(lat, 4),
      'Lng': round_(lng, 4),
      'Map point': round_(lat, 4) + ',' + round_(lng, 4),
      'Report count': count,
      'Status': status,
      'First reported': first,
      'Last reported': step(count),
      'Assigned at': [STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.FIXED].indexOf(status) >= 0 ? step(1) : '',
      'In progress at': [STATUS.IN_PROGRESS, STATUS.FIXED].indexOf(status) >= 0 ? step(2) : '',
      'Fixed at': status === STATUS.FIXED ? step(4) : '',
      'Est. cost (staff)': est,
      'Spent (staff)': est ? Math.round(est * spentFactor) : '',
      'Public note (EN)': status === STATUS.FIXED ? 'Crew cleared the site and the owner was notified.' : '',
      'Public note (ES)': status === STATUS.FIXED ? 'El equipo limpió el lugar y se notificó al dueño.' : '',
      'Sample data': 'Yes',
    });

    for (let r = 0; r < count; r++) {
      const es = Math.random() < 0.25;
      const text = (SAMPLE_TEXT[cat.id] || [cat.en, cat.es])[es ? 1 : 0];
      requests.push({
        'Tracking ID': newId_('MBL'),
        'Received': step(r),
        'Source': Math.random() < 0.7 ? 'Web' : 'Google Form',
        'Language': es ? 'es' : 'en',
        'Description': '[SAMPLE] ' + text,
        'Address': houseBlock + ' block of ' + s.street,
        'Lat': round_(lat, 4),
        'Lng': round_(lng, 4),
        'In Mableton': 'Yes',
        'District': s.district,
        'Category': cat.en,
        'Category ID': cat.id,
        'Owner': cat.owner,
        'Department': cat.dept,
        'Emergency': 'No',
        'Issue ID': issueId,
        'Summary (EN)': SAMPLE_TEXT[cat.id] ? SAMPLE_TEXT[cat.id][0] : cat.en,
        'Sample data': 'Yes',
      });
    }
  }
  appendMany_(SHEET.ISSUES, issues);
  appendMany_(SHEET.REQUESTS, requests);
  CacheService.getScriptCache().remove('public');
  console.log('Added ' + issues.length + ' sample issues and ' + requests.length + ' sample reports.');
  console.log('Try tracking ID: ' + requests[0]['Tracking ID']);
}

function clearSampleData() {
  [SHEET.REQUESTS, SHEET.ISSUES].forEach(name => {
    const sh = sheet_(name);
    readAll_(name).filter(r => r['Sample data'] === 'Yes').map(r => r._row)
      .sort((a, b) => b - a).forEach(row => sh.deleteRow(row));
  });
  CacheService.getScriptCache().remove('public');
}
