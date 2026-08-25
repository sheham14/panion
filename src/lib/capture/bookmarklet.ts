/**
 * The capture bookmarklet.
 *
 * Runs in the user's own browser, on a page the user navigated to, and reads
 * only what that page already loaded. It fetches nothing and follows no links —
 * the human does the browsing, the code does the parsing. That distinction is
 * the whole basis for this being a legitimate path where an automated fetcher
 * is not (DATA-SOURCING.md §1.1).
 *
 * Deliberately dumb: it locates an array of product-ish objects and copies it
 * verbatim to the clipboard. All interpretation happens server-side in
 * `parse-capture.ts`, so a retailer changing their payload is a code fix rather
 * than a reinstall.
 *
 * When it finds nothing it copies a **diagnostic** instead — the shape of what
 * it did find — so a failed capture is debuggable from the clipboard rather
 * than requiring a screen-share.
 */

/**
 * Source of the bookmarklet, as a plain string.
 *
 * Not imported as a module: this has to survive being URI-encoded into an
 * `href`, so it must be self-contained ES5-ish with no build step, no imports
 * and no template literals that would complicate escaping.
 */
const BOOKMARKLET_SOURCE = `(function(){
  var MIN_GROUP = 4;
  var PRICE_KEYS = ['price','currentPrice','priceInfo','linePrice','offerPrice','amount'];
  var NAME_KEYS = ['name','title','productName','displayName'];

  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }

  function hasKey(o, keys){
    for (var i=0;i<keys.length;i++){ if (o[keys[i]] !== undefined && o[keys[i]] !== null) return true; }
    return false;
  }

  /* A product looks like something with both a name and a price. */
  function looksLikeProduct(o){
    return isObj(o) && hasKey(o, NAME_KEYS) && hasKey(o, PRICE_KEYS);
  }

  /*
   * Walk the page's data looking for the LARGEST array of product-like
   * objects. Largest, not first: search pages carry small carousels of
   * "sponsored" and "recently viewed" items alongside the real results, and
   * the real results are always the biggest group.
   */
  var best = null;
  var seen = new Set();
  function walk(node, depth){
    if (!node || depth > 12) return;
    if (Array.isArray(node)) {
      var hits = 0;
      for (var i=0;i<node.length;i++){ if (looksLikeProduct(node[i])) hits++; }
      if (hits >= MIN_GROUP && (!best || hits > best.hits)) {
        best = { hits: hits, items: node.filter(looksLikeProduct) };
      }
      for (var j=0;j<node.length;j++) walk(node[j], depth+1);
      return;
    }
    if (isObj(node)) {
      if (seen.has(node)) return;
      seen.add(node);
      for (var k in node) {
        try { walk(node[k], depth+1); } catch(e){}
      }
    }
  }

  var roots = [];
  if (window.__NEXT_DATA__) roots.push(window.__NEXT_DATA__);
  if (window.__PRELOADED_STATE__) roots.push(window.__PRELOADED_STATE__);
  if (window.__APOLLO_STATE__) roots.push(window.__APOLLO_STATE__);
  if (window.__WML_REDUX_INITIAL_STATE__) roots.push(window.__WML_REDUX_INITIAL_STATE__);
  /* Embedded JSON blobs (incl. ld+json ItemList) are page content too. */
  var tags = document.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]');
  for (var t=0;t<tags.length;t++){
    if (tags[t].id === '__NEXT_DATA__') continue;
    try { var parsed = JSON.parse(tags[t].textContent); if (parsed && typeof parsed === 'object') roots.push(parsed); } catch(e){}
  }
  /* Next.js App Router streams into self.__next_f rather than __NEXT_DATA__. */
  if (self.__next_f && self.__next_f.length) {
    try {
      var joined = self.__next_f.map(function(c){ return (c && c[1]) || ''; }).join('');
      var start = joined.indexOf('{');
      if (start > -1) roots.push(JSON.parse(joined.slice(start)));
    } catch(e){}
  }

  for (var r=0;r<roots.length;r++) walk(roots[r], 0);

  /*
   * DOM tier. Walmart.ca fetches search results client-side (persisted
   * GraphQL queries), so they never appear in __NEXT_DATA__ or any script
   * tag — the rendered tiles are the only place they exist. Copy each
   * tile's raw text verbatim; parse-capture.ts owns the interpretation.
   */
  var domItems = [];
  if (!best || !best.items.length) {
    var tiles = document.querySelectorAll('[data-item-id]');
    for (var d=0; d<tiles.length; d++){
      var tile = tiles[d];
      var titleEl = tile.querySelector('[data-automation-id="product-title"]');
      var priceEl = tile.querySelector('[data-automation-id="product-price"]');
      if (!titleEl || !priceEl) continue;
      var linkEl = tile.querySelector('a[href*="/ip/"]') || tile.querySelector('a[href]');
      var imgEl = tile.querySelector('img');
      domItems.push({
        name: (titleEl.textContent || '').trim(),
        priceText: (priceEl.textContent || '').trim().slice(0,200),
        itemId: tile.getAttribute('data-item-id'),
        link: linkEl ? linkEl.href : null,
        image: imgEl ? (imgEl.currentSrc || imgEl.src || null) : null
      });
    }
  }

  var host = location.hostname.replace(/^www\\./,'');
  var source = host.indexOf('walmart') > -1 ? 'walmart'
             : host.indexOf('voila') > -1 ? 'voila' : 'generic';

  var payload;
  if (best && best.items.length) {
    payload = { source: source, url: location.href, capturedAt: new Date().toISOString(), items: best.items };
  } else if (domItems.length) {
    payload = { source: source, url: location.href, capturedAt: new Date().toISOString(), capturedFrom: 'dom', items: domItems };
  } else {
    /* Nothing found — copy the shape so the extractor can be fixed. */
    var shape = {};
    for (var rr=0; rr<roots.length; rr++){
      try { shape['root'+rr] = Object.keys(roots[rr]).slice(0,40); } catch(e){}
    }
    /*
     * Survey every array in the data: path, length, and the keys of its
     * first element. The top-level keys alone proved too shallow to fix an
     * extractor from — this makes the failed capture name the exact path
     * where the products actually live.
     */
    var arrays = [];
    var seen2 = new Set();
    function survey(node, path, depth){
      if (!node || depth > 12) return;
      if (Array.isArray(node)) {
        var entry = { path: path, length: node.length };
        if (isObj(node[0])) entry.keys = Object.keys(node[0]).slice(0,30);
        if (node.length) arrays.push(entry);
        var lim = node.length < 3 ? node.length : 3;
        for (var i=0;i<lim;i++) survey(node[i], path + '.' + i, depth+1);
        return;
      }
      if (isObj(node)) {
        if (seen2.has(node)) return;
        seen2.add(node);
        for (var k in node) { try { survey(node[k], path + '.' + k, depth+1); } catch(e){} }
      }
    }
    for (var sv=0; sv<roots.length; sv++) survey(roots[sv], 'root'+sv, 0);
    arrays.sort(function(a,b){ return b.length - a.length; });
    payload = { source: source, url: location.href, capturedAt: new Date().toISOString(),
                diagnostic: { roots: roots.length, keys: shape, arrays: arrays.slice(0,25), totalArrays: arrays.length,
                              dom: { tiles: document.querySelectorAll('[data-item-id]').length,
                                     titles: document.querySelectorAll('[data-automation-id="product-title"]').length,
                                     prices: document.querySelectorAll('[data-automation-id="product-price"]').length },
                              hasNextData: !!window.__NEXT_DATA__, hasAppRouter: !!self.__next_f } };
  }

  var text = JSON.stringify(payload);
  function toast(msg, ok){
    var d = document.createElement('div');
    d.textContent = msg;
    d.setAttribute('style','position:fixed;z-index:2147483647;top:16px;right:16px;padding:12px 18px;'
      + 'border-radius:10px;font:600 14px system-ui,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3);'
      + 'background:' + (ok ? '#0a7a62' : '#b91c1c'));
    document.body.appendChild(d);
    setTimeout(function(){ d.remove(); }, 4000);
  }

  function done(){
    if (payload.items) toast('Captured ' + payload.items.length + ' products - paste into Panion', true);
    else toast('No products found - diagnostic copied instead', false);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function(){
      window.prompt('Copy this into Panion:', text);
    });
  } else {
    window.prompt('Copy this into Panion:', text);
  }
})();`;

/** The `javascript:` URL to hang off a draggable link. */
export function bookmarkletHref(): string {
  const collapsed = BOOKMARKLET_SOURCE.replace(/\n\s*/g, " ").trim();
  return `javascript:${encodeURIComponent(collapsed)}`;
}

export { BOOKMARKLET_SOURCE };
