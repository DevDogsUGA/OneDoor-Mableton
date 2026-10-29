/**
 * Your Apps Script code. Add more .gs files in src/ as it grows; they all share one global scope.
 * Guide: https://developers.google.com/apps-script/guides/v8-runtime
 */

// Model list: https://ai.google.dev/gemini-api/docs/models
const GEMINI_MODEL = 'gemini-3.8-flash';

// The Gemini API key lives in Project Settings → Script Properties, never in the code.
function geminiApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Add GEMINI_API_KEY in Project Settings → Script Properties.');
  return key;
}

// Run this from the editor to check that the key works.
function testGemini() {
  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': geminiApiKey_() },
      payload: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello in five words.' }] }] }),
    },
  );
  Logger.log(response.getContentText());
}
