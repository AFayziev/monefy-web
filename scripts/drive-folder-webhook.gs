/**
 * Polls a Drive folder (top level only) and POSTs newly created files to a webhook.
 * Run checkChanges() on a time-driven trigger.
 *
 * Script Properties: FOLDER (id or URL), WEBHOOK_URL, API_KEY (sent as X-API-Key).
 * The first run only records a starting point (nothing is sent).
 */

var LAST_SEEN = 'LAST_SEEN'; // ISO time of the last successful check

function checkChanges() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var cfg = getConfig_(props);
    var folder = DriveApp.getFolderById(cfg.folderId);
    var lastSeen = props.getProperty(LAST_SEEN);

    if (!lastSeen) {
      props.setProperty(LAST_SEEN, new Date().toISOString());
      return;
    }

    // DriveApp uses Drive API v2, which has no searchable createdDate. A new file's
    // modifiedDate is >= its creation time, so search by modifiedDate and keep the
    // files whose creation falls in (lastSeen, runStart].
    var runStart = new Date();
    var since = new Date(lastSeen);
    var query = "modifiedDate > '" + lastSeen + "' and trashed = false";
    Logger.log('folderId=%s query=%s', cfg.folderId, query);

    var files = [];
    var it = folder.searchFiles(query);
    while (it.hasNext()) {
      var f = it.next();
      var created = f.getDateCreated();
      if (created > since && created <= runStart) files.push(describe_(f));
    }
    Logger.log('found %s new file(s)', files.length);
    files.forEach(function (f) {
      Logger.log('new file: %s | created %s | %s bytes', f.name, f.createdAt, f.size);
    });

    if (files.length) {
      files.sort(function (a, b) {
        return a.createdAt < b.createdAt ? -1 : 1;
      });
      send_(cfg, {
        folderId: cfg.folderId,
        folderName: folder.getName(),
        detectedAt: runStart.toISOString(),
        count: files.length,
        files: files,
      });
    }
    // Advance only after a successful run; send failures throw and retry next run.
    props.setProperty(LAST_SEEN, runStart.toISOString());
  } finally {
    lock.releaseLock();
  }
}

function describe_(f) {
  var owner = f.getOwner();
  return {
    id: f.getId(),
    name: f.getName(),
    mimeType: f.getMimeType(),
    url: f.getUrl(),
    size: f.getSize(),
    createdAt: f.getDateCreated().toISOString(),
    owner: owner ? owner.getEmail() : null,
  };
}

function send_(cfg, payload) {
  var res = UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'X-API-Key': cfg.apiKey },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300)
    throw new Error('Webhook returned ' + code + ': ' + res.getContentText().slice(0, 300));
}

function getConfig_(p) {
  var folder = p.getProperty('FOLDER'),
    url = p.getProperty('WEBHOOK_URL'),
    apiKey = p.getProperty('API_KEY');
  if (!folder || !url || !apiKey)
    throw new Error('Set FOLDER, WEBHOOK_URL and API_KEY script properties');
  var m = folder.match(/[-\w]{25,}/); // raw ID or .../folders/<id> URL
  return { folderId: m ? m[0] : folder, url: url, apiKey: apiKey };
}
