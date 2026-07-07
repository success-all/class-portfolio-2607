var SHEET_NAME = 'Visitors';
var COLUMNS = [
  'timestamp', 'sessionId', 'page', 'referrer',
  'userAgent', 'deviceType', 'browser', 'screenResolution', 'viewportSize', 'language', 'timezone',
  'galleryFilterClicks', 'projectClickSequence', 'sectionDwellMs', 'mouseHeatmapGrid', 'pageDurationMs',
  'formStepStatus', 'formCompleted',
  'consentGiven', 'leadName', 'leadEmail', 'leadProjectType', 'leadDescription',
  'clickCoordinates'
];

function doPost(e) {
  try {
    var row = JSON.parse(e.postData.contents);
    var expectedToken = PropertiesService.getScriptProperties().getProperty('INGEST_TOKEN');
    if (!expectedToken || row.token !== expectedToken) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = getVisitorsSheet_();
    sheet.appendRow(COLUMNS.map(function (key) {
      return row[key] !== undefined ? row[key] : '';
    }));
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getVisitorsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
  }
  return sheet;
}
