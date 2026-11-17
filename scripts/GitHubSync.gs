/**
 * POKÉMON SINGLES — GITHUB SYNC
 * Paste into a NEW GitHubSync.gs file in the existing standalone gallery
 * Apps Script project. Depends on getWishlistData() and logEvent_() in Code.gs.
 * Token lives in Project Settings > Script Properties (GITHUB_SYNC_TOKEN).
 * No tokens, spreadsheet credentials or private data belong in GitHub.
 */
const GALLERY_GITHUB = Object.freeze({
  OWNER: 'khorrzhvhrex',
  REPO: 'pokemonsingleswishlist',
  BRANCH: 'main',
  FILE: 'cards.json',
  TOKEN_PROPERTY: 'GITHUB_SYNC_TOKEN'
});

function syncWishlistToGitHub() {
  const start = Date.now();
  const token = PropertiesService.getScriptProperties()
    .getProperty(GALLERY_GITHUB.TOKEN_PROPERTY);
  if (!token) throw new Error('Missing Script Property GITHUB_SYNC_TOKEN');

  // Existing reader strictly filters acquisition status and current bids.
  const data = getWishlistData();
  const url = 'https://api.github.com/repos/' + GALLERY_GITHUB.OWNER + '/' +
    GALLERY_GITHUB.REPO + '/contents/' + GALLERY_GITHUB.FILE;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Pokemon-Singles-Wishlist-Sync'
  };
  const previousResponse = UrlFetchApp.fetch(url + '?ref=' + GALLERY_GITHUB.BRANCH, {
    method: 'get', headers, muteHttpExceptions: true
  });
  let sha = null;
  let previous = null;
  if (previousResponse.getResponseCode() === 200) {
    const file = JSON.parse(previousResponse.getContentText());
    sha = file.sha;
    const text = Utilities.newBlob(
      Utilities.base64Decode(file.content.replace(/\s/g, ''))
    ).getDataAsString('UTF-8');
    previous = JSON.parse(text);
  } else if (previousResponse.getResponseCode() !== 404) {
    logEvent_('ERROR', 'github_read_failed', {status: previousResponse.getResponseCode()});
    throw new Error('GitHub read HTTP ' + previousResponse.getResponseCode());
  }

  // Avoid 96 redundant commits daily if the card data has not changed.
  if (previous && JSON.stringify(previous.cards) === JSON.stringify(data.cards)) {
    logEvent_('INFO', 'github_sync_unchanged', {
      cards: data.cards.length, durationMs: Date.now() - start
    });
    return;
  }
  const publicSnapshot = {
    cards: data.cards,
    total: data.cards.length,
    updatedAt: data.updatedAt,
    publishedAt: new Date().toISOString(),
    version: data.version
  };
  const payload = {
    message: 'Sync public Pokémon wishlist (' + data.cards.length + ' cards)',
    branch: GALLERY_GITHUB.BRANCH,
    content: Utilities.base64Encode(
      Utilities.newBlob(JSON.stringify(publicSnapshot, null, 2) + '\n').getBytes()
    )
  };
  if (sha) payload.sha = sha;
  const result = UrlFetchApp.fetch(url, {
    method: 'put', headers,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (![200, 201].includes(result.getResponseCode())) {
    logEvent_('ERROR', 'github_publish_failed', {status: result.getResponseCode()});
    throw new Error('GitHub publish HTTP ' + result.getResponseCode());
  }
  logEvent_('INFO', 'github_sync_published', {
    cards: data.cards.length, durationMs: Date.now() - start
  });
}

/** Run once after the first successful manual sync. */
function installWishlistSyncTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncWishlistToGitHub')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncWishlistToGitHub').timeBased().everyMinutes(15).create();
  logEvent_('INFO', 'github_sync_trigger_installed', {intervalMinutes: 15});
}
