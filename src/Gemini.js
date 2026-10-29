/**
 * Gemini calls for triage, duplicate matching, reply drafts and digests.
 *
 * Every call asks for JSON with a schema, retries when the free tier is
 * busy, and returns null on failure so callers can fall back to rules.
 * The demo should never break because Gemini is having a bad minute.
 */

function geminiJson_(prompt, schema, imageBlob) {
  const key = prop_('GEMINI_API_KEY');
  if (!key) {
    console.warn('GEMINI_API_KEY is not set; using fallback rules.');
    return null;
  }
  const parts = [{ text: prompt }];
  if (imageBlob) {
    parts.push({
      inline_data: {
        mime_type: imageBlob.getContentType(),
        data: Utilities.base64Encode(imageBlob.getBytes()),
      },
    });
  }
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    geminiModel_() + ':generateContent';
  const body = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code === 200) {
        const data = JSON.parse(res.getContentText());
        const text = data.candidates[0].content.parts.map(p => p.text || '').join('');
        return JSON.parse(text);
      }
      console.warn('Gemini HTTP ' + code + ': ' + res.getContentText().slice(0, 300));
      if (code !== 429 && code < 500) return null;
    } catch (err) {
      console.warn('Gemini call failed: ' + err);
    }
    Utilities.sleep(1000);
  }
  return null;
}

/** Category, language, emergency flag and short titles for one report. */
function classifyReport_(description, address, imageBlob) {
  const list = CATEGORIES.map(c => '- ' + c.id + ': ' + c.en + ' (' + c.owner + ')').join('\n');
  const prompt = [
    'You triage resident reports for the City of Mableton, Georgia.',
    'The city handles code enforcement, sanitation, business licensing and parks.',
    'Cobb County handles roads, traffic signals, stormwater, water and sewer, animal control and police.',
    'Pick the single best category id from this list:',
    list,
    'Set emergency to true only if someone may be in danger right now (fire, gas leak, crime in progress, injury).',
    'Write title_en and title_es as short, neutral issue titles (max 8 words) with no names, phone numbers or house numbers.',
    'Write summary_en as one plain sentence. Never include personal details.',
    'If a photo is attached, use it to help choose the category.',
    '',
    'Report: """' + description + '"""',
    'Location: """' + (address || 'not given') + '"""',
  ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: {
      category_id: { type: 'STRING', enum: CATEGORIES.map(c => c.id) },
      language: { type: 'STRING', enum: ['en', 'es', 'other'] },
      emergency: { type: 'BOOLEAN' },
      title_en: { type: 'STRING' },
      title_es: { type: 'STRING' },
      summary_en: { type: 'STRING' },
    },
    required: ['category_id', 'language', 'emergency', 'title_en', 'title_es', 'summary_en'],
  };
  return geminiJson_(prompt, schema, imageBlob) || classifyByKeywords_(description);
}

/** Rule-based backup so intake still works with no key or a busy model. */
function classifyByKeywords_(text) {
  const t = String(text).toLowerCase();
  const rules = [
    ['illegal_dumping', /dump|tir(ó|o|aron)|colch|mattress|tires|llantas/],
    ['overgrown_lot', /grass|overgrown|weeds|pasto|hierba|maleza/],
    ['junk_vehicle', /abandoned|junk car|vehicle|car |carro|vehículo|chatarra/],
    ['road_pothole', /pothole|bache|road damage|calle rota/],
    ['traffic_signal', /traffic light|signal|streetlight|semáforo|alumbrado/],
    ['stormwater', /flood|drain|inund|desagüe/],
    ['water_sewer', /water main|sewer|leak|agua|alcantarill/],
    ['missed_pickup', /pickup|pick up|recycl|recog|bin|bote/],
    ['animal', /dog|animal|perro|gato/],
    ['unsafe_structure', /unsafe|collapse|abandoned house|roof|edificio/],
    ['illegal_signs', /sign|letrero/],
    ['park_maintenance', /park|parque/],
    ['trash_on_property', /trash|garbage|debris|basura/],
  ];
  const hit = rules.find(r => r[1].test(t));
  const cat = categoryById_(hit ? hit[0] : 'other_city');
  const spanish = /[ñáéíóú¿¡]|\b(el|la|los|las|hay|en|calle|por favor)\b/.test(t);
  return {
    category_id: cat.id,
    language: spanish ? 'es' : 'en',
    emergency: /fire|gas leak|fuego|incendio|gun|arma/.test(t),
    title_en: cat.en,
    title_es: cat.es,
    summary_en: String(text).slice(0, 160),
  };
}

/** Returns the id of the open issue this report duplicates, or ''. */
function matchDuplicate_(summary, candidates) {
  if (!candidates.length) return '';
  const prompt = [
    'A resident in Mableton, GA filed a new report. Decide whether it describes the SAME physical',
    'problem as one of the existing open issues (same place, same thing). Similar problems at',
    'different places are NOT the same. Answer with the matching issue_id, or an empty string.',
    '',
    'New report: ' + summary,
    'Existing issues:',
    candidates.map(c => '- ' + c['Issue ID'] + ': ' + c['Title (EN)'] + ' at ' + c['Location (block)'] +
      ' (' + Math.round(c._distance) + ' m away)').join('\n'),
  ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: { issue_id: { type: 'STRING' } },
    required: ['issue_id'],
  };
  const out = geminiJson_(prompt, schema);
  if (out && candidates.some(c => c['Issue ID'] === out.issue_id)) return out.issue_id;
  if (out) return '';
  // No Gemini: treat very close reports in the same category as the same issue.
  const nearest = candidates[0];
  return nearest._distance < 60 ? nearest['Issue ID'] : '';
}

/** A reply in the resident's language. Staff must approve it before it is sent. */
function draftReply_(context) {
  const prompt = [
    'Draft a short, warm, plain-language email from the City of Mableton to a resident.',
    'Write it in ' + (context.language === 'es' ? 'Spanish' : 'English') + '.',
    'Do not promise dates or outcomes that are not stated below. Sign it "City of Mableton".',
    'Keep it under 120 words. Return only the subject and body.',
    '',
    'Facts:',
    JSON.stringify(context, null, 2),
  ].join('\n');
  const schema = {
    type: 'OBJECT',
    properties: { subject: { type: 'STRING' }, body: { type: 'STRING' } },
    required: ['subject', 'body'],
  };
  return geminiJson_(prompt, schema) || templateReply_(context);
}

function templateReply_(c) {
  const es = c.language === 'es';
  if (c.reason === 'fixed') {
    return {
      subject: es ? 'Su reporte ' + c.trackingId + ' fue resuelto' : 'Your report ' + c.trackingId + ' is fixed',
      body: es
        ? 'Gracias por su reporte (' + c.category + '). El problema fue marcado como resuelto. ' + (c.publicNote || '') + '\n\nCiudad de Mableton'
        : 'Thank you for your report (' + c.category + '). The issue has been marked fixed. ' + (c.publicNote || '') + '\n\nCity of Mableton',
    };
  }
  if (c.owner === 'County') {
    return {
      subject: es ? 'Su reporte ' + c.trackingId + ' es del Condado de Cobb' : 'Your report ' + c.trackingId + ' is handled by Cobb County',
      body: es
        ? 'Gracias. Este tipo de problema (' + c.category + ') lo atiende el Condado de Cobb. Repórtelo aquí: ' + COBB_REPORT_URL + '\n\nCiudad de Mableton'
        : 'Thank you. This kind of problem (' + c.category + ') is handled by Cobb County. You can report it here: ' + COBB_REPORT_URL + '\n\nCity of Mableton',
    };
  }
  return {
    subject: es ? 'Recibimos su reporte ' + c.trackingId : 'We received your report ' + c.trackingId,
    body: es
      ? 'Gracias por reportar: ' + c.category + '. Su número de seguimiento es ' + c.trackingId + '. ' +
        (c.reportCount > 1 ? 'Otros ' + (c.reportCount - 1) + ' residentes reportaron lo mismo. ' : '') +
        'Puede ver el avance en ' + c.trackUrl + '\n\nCiudad de Mableton'
      : 'Thanks for reporting: ' + c.category + '. Your tracking number is ' + c.trackingId + '. ' +
        (c.reportCount > 1 ? (c.reportCount - 1) + ' other residents reported the same problem. ' : '') +
        'You can follow progress at ' + c.trackUrl + '\n\nCity of Mableton',
  };
}
