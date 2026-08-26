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
  var TOKEN = __TOKEN__;
  var ENDPOINT = __ENDPOINT__;
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
   * GraphQL queries) and Voilà (Ocado platform, "fop" = front of pack)
   * exposes only product URLs in its ld+json — for both, the rendered
   * tiles are the only place products exist. Copy each tile's raw text
   * verbatim; parse-capture.ts owns the interpretation.
   */
  /*
   * Voilà's data-test hooks (seen live 2026-08-25): the wrapper value is
   * suffixed with the product UUID ("fop-wrapper:11dc9b2a-..."), so tile
   * matching is by prefix and the UUID doubles as the item id. The unit
   * price span nests INSIDE the size element and must not pollute either
   * the size or be mistaken for the price.
   */
  var DOM_CONFIGS = [
    { tile: '[data-item-id]', title: '[data-automation-id="product-title"]',
      price: '[data-automation-id="product-price"]', idAttr: 'data-item-id' },
    { tile: '[data-test^="fop-wrapper"]', title: '[data-test^="fop-title"]',
      price: '[data-test^="fop-price"]:not([data-test="fop-price-per-unit"])',
      size: '[data-test="fop-size"]', perUnit: '[data-test="fop-price-per-unit"]',
      idFromDataTest: true }
  ];
  var domItems = [];
  if (!best || !best.items.length) {
    for (var c=0; c<DOM_CONFIGS.length && !domItems.length; c++){
      var cfg = DOM_CONFIGS[c];
      var tiles = document.querySelectorAll(cfg.tile);
      for (var d=0; d<tiles.length; d++){
        var tile = tiles[d];
        var titleEl = tile.querySelector(cfg.title);
        var priceEl = tile.querySelector(cfg.price);
        /* No named price hook — fall back to any price-shaped leaf that is
           not the per-unit price. */
        if (!priceEl && cfg.perUnit) {
          var cand = tile.getElementsByTagName('*');
          for (var pc=0; pc<cand.length; pc++){
            var ct = cand[pc].textContent || '';
            if (cand[pc].childElementCount === 0 && ct.length < 30 &&
                /\\$\\s?\\d{1,4}\\.\\d{2}/.test(ct) && ct.indexOf('per') === -1 &&
                !cand[pc].closest(cfg.perUnit)) { priceEl = cand[pc]; break; }
          }
        }
        var linkEl = tile.querySelector('a[href*="/ip/"]') || tile.querySelector('a[href]');
        /* The tile's link text is a serviceable name when no title hook exists. */
        var name = titleEl ? (titleEl.textContent || '').trim()
                 : linkEl ? (linkEl.textContent || '').trim() : '';
        if (!name || name.length < 2 || !priceEl) continue;
        var sizeTxt = null;
        if (cfg.size) {
          var sizeEl = tile.querySelector(cfg.size);
          if (sizeEl) {
            sizeTxt = (sizeEl.textContent || '').trim();
            var perEl = cfg.perUnit ? sizeEl.querySelector(cfg.perUnit) : null;
            if (perEl) sizeTxt = sizeTxt.replace((perEl.textContent || '').trim(), ' ').trim();
            sizeTxt = sizeTxt.slice(0,60) || null;
          }
        }
        var itemId = cfg.idAttr ? tile.getAttribute(cfg.idAttr)
                   : cfg.idFromDataTest ? ((tile.getAttribute('data-test') || '').split(':')[1] || null)
                   : null;
        var imgEl = tile.querySelector('img');
        domItems.push({
          name: name,
          priceText: (priceEl.textContent || '').trim().slice(0,200),
          size: sizeTxt,
          itemId: itemId,
          link: linkEl ? linkEl.href : null,
          image: imgEl ? (imgEl.currentSrc || imgEl.src || null) : null
        });
      }
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
    /*
     * When no selector config matched, sample the ancestor chains of the
     * first few price-looking leaf elements. Each chain names the tags and
     * data-* hooks around a real on-screen price, which is exactly the
     * selector information needed to add the site to DOM_CONFIGS.
     */
    var tileCounts = [];
    for (var tc=0; tc<DOM_CONFIGS.length; tc++){
      tileCounts.push(document.querySelectorAll(DOM_CONFIGS[tc].tile).length);
    }
    var samples = [];
    var priceRe = /\\$\\s?\\d{1,4}\\.\\d{2}/;
    var leaves = document.body.getElementsByTagName('*');
    for (var pl=0; pl<leaves.length && samples.length<3; pl++){
      var leaf = leaves[pl];
      var txt = leaf.textContent || '';
      if (leaf.childElementCount !== 0 || txt.length > 40 || !priceRe.test(txt)) continue;
      var chain = [];
      var n = leaf;
      for (var up=0; up<8 && n && n !== document.body; up++){
        var sig = n.tagName.toLowerCase();
        var hook = n.getAttribute('data-test') || n.getAttribute('data-testid') || n.getAttribute('data-automation-id');
        if (hook) sig += '[' + hook + ']';
        else if (typeof n.className === 'string' && n.className) sig += '.' + n.className.split(' ').slice(0,2).join('.');
        chain.push(sig.slice(0,70));
        n = n.parentElement;
      }
      samples.push({ text: txt.trim().slice(0,40), ancestors: chain });
      pl += 20; /* skip ahead so the samples come from different tiles */
    }
    payload = { source: source, url: location.href, capturedAt: new Date().toISOString(),
                diagnostic: { roots: roots.length, keys: shape, arrays: arrays.slice(0,25), totalArrays: arrays.length,
                              dom: { tileCounts: tileCounts, priceLeafSamples: samples },
                              hasNextData: !!window.__NEXT_DATA__, hasAppRouter: !!self.__next_f } };
  }

  var text = JSON.stringify(payload);
  /*
   * Styles are assigned through the CSSOM, one property at a time, rather than
   * as a style attribute. A retailer serving style-src without 'unsafe-inline'
   * has the attribute stripped, which leaves the toast in the DOM but
   * unstyled - static, unpositioned, and far below the fold, so it reads as
   * "the bookmarklet did nothing". CSSOM assignment is not subject to that
   * restriction. An alert is the last resort so a capture can never complete
   * with no feedback at all.
   */
  function toast(msg, ok){
    try {
      var d = document.createElement('div');
      d.textContent = msg;
      var s = d.style;
      s.setProperty('position','fixed'); s.setProperty('z-index','2147483647');
      s.setProperty('top','16px'); s.setProperty('right','16px');
      s.setProperty('padding','14px 20px'); s.setProperty('border-radius','10px');
      s.setProperty('font','600 15px system-ui,-apple-system,sans-serif');
      s.setProperty('color','#ffffff'); s.setProperty('max-width','420px');
      s.setProperty('box-shadow','0 4px 20px rgba(0,0,0,.35)');
      s.setProperty('background', ok ? '#0a7a62' : '#b91c1c');
      (document.body || document.documentElement).appendChild(d);
      setTimeout(function(){ try { d.remove(); } catch(e){} }, 6000);
    } catch(e) {
      alert(msg);
    }
  }

  /* Clipboard is the fallback path, used when no token was baked in or the
     POST could not be delivered (Panion not running, laptop offline). */
  function copyInstead(reason){
    function done(){
      if (payload.items) toast((reason ? reason + ' - ' : '') + 'Copied ' + payload.items.length + ' products, paste into Panion', !reason);
      else toast('No products found - diagnostic copied instead', false);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function(){
        window.prompt('Copy this into Panion:', text);
      });
    } else {
      window.prompt('Copy this into Panion:', text);
    }
  }

  /*
   * With a token, post straight into the review queue — no copying, no tab
   * switching. This never writes a price: the queue is drained by a signed-in
   * human on /admin/import, because with no barcode every match is
   * name-and-size and that decision belongs to a person.
   */
  if (TOKEN && ENDPOINT && window.fetch) {
    /*
     * Content-Type is text/plain deliberately, to keep this a CORS **simple
     * request** and avoid a preflight. The body is still JSON and the endpoint
     * reads it with req.text() + JSON.parse, so the header is decorative — but
     * a preflight is not: panion.dev 307-redirects to www.panion.dev, and a
     * preflight that meets a redirect is a hard error by spec, with no way for
     * the page to follow it. That is what made auto-submit fail silently on
     * production while working locally. A simple POST follows the redirect
     * normally.
     */
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ token: TOKEN, capture: payload }),
      mode: 'cors',
      credentials: 'omit',
      keepalive: true
    }).then(function(r){
      return r.json().then(function(b){ return { ok: r.ok, body: b }; },
                           function(){ return { ok: r.ok, body: {} }; });
    }).then(function(res){
      if (!res.ok) { copyInstead((res.body && res.body.error) || 'Panion rejected it'); return; }
      if (res.body.diagnostic) { toast('No products found - diagnostic queued for review', false); return; }
      toast('Queued ' + res.body.items + ' products (' + res.body.pending + ' waiting review)', true);
    }, function(){
      copyInstead('Could not reach Panion');
    });
  } else {
    copyInstead(null);
  }
})();`;

/**
 * The `javascript:` URL to hang off a draggable link.
 *
 * With a token and an origin the bookmarklet posts captures straight into the
 * review queue; without them it falls back to the clipboard, which is also what
 * happens at runtime if Panion cannot be reached.
 *
 * The token is embedded in the bookmark's URL. That is a real secret sitting in
 * the user's bookmarks bar, which is why it is narrowly scoped: it can only
 * enqueue a capture for review, never read data and never write a price. It is
 * revoked by generating another.
 */
export function bookmarkletHref(opts?: {
  token?: string | null;
  origin?: string | null;
}): string {
  const token = opts?.token ?? null;
  const endpoint = opts?.origin ? `${opts.origin}/api/capture/submit` : null;

  const collapsed = BOOKMARKLET_SOURCE.replace(/\n\s*/g, " ")
    .replace("__TOKEN__", JSON.stringify(token))
    .replace("__ENDPOINT__", JSON.stringify(endpoint))
    .trim();

  return `javascript:${encodeURIComponent(collapsed)}`;
}

export { BOOKMARKLET_SOURCE };
