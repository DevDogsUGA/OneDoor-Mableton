/**
 * OneDoor Mableton: shared settings.
 *
 * Categories, owners, sheet names and links live here so the team can tweak
 * them in one place. GEMINI_MODEL stays in Code.gs.
 */

const SHEET = {
  REQUESTS: 'Requests',
  ISSUES: 'Issues',
  REPLIES: 'Replies',
  BUDGET: 'Budget',
  DIGEST: 'Digest',
};

const STATUS = {
  RECEIVED: 'Received',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  FIXED: 'Fixed',
  REFERRED: 'Referred to Cobb County',
};

// Issues in these statuses can still absorb new duplicate reports.
const OPEN_STATUSES = [STATUS.RECEIVED, STATUS.ASSIGNED, STATUS.IN_PROGRESS];

const DISTRICTS = ['1', '2', '3', '4', '5', '6'];

// Where county-owned problems get sent. Check this link before Demo Day.
const COBB_REPORT_URL = 'https://www.cobbcounty.gov';

// Reports within this distance (meters) of an open issue in the same
// category are candidates for "same problem".
const DUPLICATE_RADIUS_M = 250;

/**
 * Based on the city's "Common Code Enforcement Issues" page
 * (mableton.gov/1418), plus the county services residents often mix up.
 * City issues enter the staff queue. County issues are logged so staff can
 * see demand, and the resident is pointed to Cobb County.
 */
const CATEGORIES = [
  { id: 'overgrown_lot', en: 'Tall grass or overgrown lot', es: 'Pasto alto o lote descuidado', owner: 'City', dept: 'Code Enforcement' },
  { id: 'illegal_dumping', en: 'Illegal dumping', es: 'Basura tirada ilegalmente', owner: 'City', dept: 'Code Enforcement' },
  { id: 'junk_vehicle', en: 'Junk or abandoned vehicle', es: 'Vehículo abandonado o chatarra', owner: 'City', dept: 'Code Enforcement' },
  { id: 'trash_on_property', en: 'Trash or debris on a property', es: 'Basura o escombros en una propiedad', owner: 'City', dept: 'Code Enforcement' },
  { id: 'unsafe_structure', en: 'Unsafe or rundown building', es: 'Edificio inseguro o deteriorado', owner: 'City', dept: 'Code Enforcement' },
  { id: 'housing_conditions', en: 'Rental housing conditions', es: 'Condiciones de vivienda de alquiler', owner: 'City', dept: 'Code Enforcement' },
  { id: 'illegal_signs', en: 'Signs in the right of way', es: 'Letreros en la vía pública', owner: 'City', dept: 'Code Enforcement' },
  { id: 'missed_pickup', en: 'Missed trash or recycling pickup', es: 'No recogieron la basura o el reciclaje', owner: 'City', dept: 'Sanitation' },
  { id: 'business_license', en: 'Business without a license', es: 'Negocio sin licencia', owner: 'City', dept: 'Business Licensing' },
  { id: 'park_maintenance', en: 'Park maintenance', es: 'Mantenimiento de parques', owner: 'City', dept: 'Parks & Recreation' },
  { id: 'other_city', en: 'Other city issue', es: 'Otro problema de la ciudad', owner: 'City', dept: 'Code Enforcement' },
  { id: 'road_pothole', en: 'Pothole or road damage', es: 'Bache o daño en la calle', owner: 'County', dept: 'Cobb DOT' },
  { id: 'traffic_signal', en: 'Traffic signal, sign or streetlight', es: 'Semáforo, señal o alumbrado', owner: 'County', dept: 'Cobb DOT' },
  { id: 'stormwater', en: 'Flooding or storm drain', es: 'Inundación o desagüe pluvial', owner: 'County', dept: 'Cobb Stormwater' },
  { id: 'water_sewer', en: 'Water or sewer', es: 'Agua o alcantarillado', owner: 'County', dept: 'Cobb County Water System' },
  { id: 'animal', en: 'Animal control', es: 'Control de animales', owner: 'County', dept: 'Cobb Animal Services' },
  { id: 'police', en: 'Police (non-emergency)', es: 'Policía (no emergencia)', owner: 'County', dept: 'Cobb Police' },
];

function categoryById_(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES.find(c => c.id === 'other_city');
}

/** Script Properties: you add GEMINI_API_KEY; setup() fills in the rest. */
function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function geminiModel_() {
  // GEMINI_MODEL is declared in Code.gs; fall back if someone removes it.
  return typeof GEMINI_MODEL !== 'undefined' ? GEMINI_MODEL : 'gemini-3.5-flash';
}
