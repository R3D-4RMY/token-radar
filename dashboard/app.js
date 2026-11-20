// Token Radar dashboard: board, filters, sort, detail view, live-token view.
// Reads window.RADAR (written by main.ts as data.js). No network, no fetch.
// Hash routes: #detail=<slug> opens a protocol, #filter=category:<name> filters.
(function () {
  var D = window.RADAR;
  var rows = D.rows;
  var live = D.live;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '<span class="flat">—</span>';
    var c = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    return '<span class="' + c + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageFmt(d) { return d === null || d === undefined ? '—' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }

  $('asof').textContent = D.as_of;
  var top = rows[0];
  $('stats').innerHTML =
    stat(rows.length, 'pre-token rows ranked') +
    stat(D.watchlist_size, 'watchlist covered') +
    stat(D.early_size, 'early rows below the $50M floor') +
    stat(money(top ? top.implied_value_usd : 0), 'top implied value') +
    stat(D.live_size, 'live tokens set aside');
  function stat(v, l) { return '<div class="stat"><b>' + esc(String(v)) + '</b><span>' + esc(l) + '</span></div>'; }

  $('model').innerHTML = '<b>Model radar-2 — implied value = TVL × category multiple × growth × maturity.</b> ' +
    'The category multiple is the median market-cap / TVL of the live-token protocols in the same category inside this snapshot ' +
    '(snapshot-wide median ' + D.global_multiple.toFixed(3) + ' where a category has fewer than 3 live tokens), clamped to 0.05–2.50. ' +
    'Growth uses the 7-day TVL change clamped to −50…+100% at weight 0.6; maturity rises with days since listing (unknown age counts as 365 days). ' +
    'No protocol name is ever special-cased — the same function scores every row.';

  // Filter options.
  var cats = [...new Set(rows.map(function (r) { return r.category || 'No category'; }))].sort();
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o); });
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o); });

  var view = 'board';
  function setView(v) {
    view = v;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === v); });
    $('board').hidden = v !== 'board';
    $('live').hidden = v !== 'live';
    $('controls').style.display = v === 'board' ? '' : 'none';
    $('count').textContent = v === 'live'
      ? live.length + ' protocols whose token already trades — shown at their recorded market cap, never ranked against the pre-token board.'
      : '';
    if (v === 'board') renderBoard();
    else renderLive();
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { setView(t.dataset.view); }); });

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value, ch = $('chain').value, w = $('watch').checked;
    var list = rows.filter(function (r) {
      if (w && !r.watchlist) return false;
      if (cat && (r.category || 'No category') !== cat) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var s = $('sort').value;
    if (s === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (s === 'growth') list.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (s === 'age') list.sort(function (a, b) { return (b.age_days || 0) - (a.age_days || 0); });
    else list.sort(function (a, b) { return a.rank - b.rank; });
    return list;
  }

  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span> <span class="sl">' + esc(r.slug) + '</span>' +
      (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '') + '</td>' +
      '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + ageFmt(r.age_days) + '</td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
  }

  function renderBoard() {
    var list = filtered();
    $('rows').innerHTML = list.slice(0, 100).map(rowHtml).join('') ||
      '<tr><td colspan="8">No protocols match this filter.</td></tr>';
    $('count').textContent = list.length + ' of ' + rows.length + ' pre-token protocols' +
      (list.length > 100 ? ' — showing the first 100, narrow the filter to see more.' : '.') +
      ' Click a row for its model breakdown and farm plan.';
    document.querySelectorAll('#rows tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.dataset.slug, true); });
    });
  }

  function renderLive() {
    $('liverows').innerHTML = live.map(function (r) {
      return '<tr><td><span class="nm">' + esc(r.name) + '</span> <span class="sl">' + esc(r.slug) + '</span> <span class="badge live">TRADES</span></td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_tvl === null ? '—' : r.mcap_tvl.toFixed(3)) + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
  }

  function openDetail(slug, push) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var mult = r.category_multiple, base = r.base_value_usd;
    var g = r.change_7d === null ? 0 : Math.min(100, Math.max(-50, r.change_7d));
    $('detail').hidden = false;
    $('detail').innerHTML =
      '<h2>#' + r.rank + ' <span>' + esc(r.name) + '</span> <span class="badge pre">PRE-TOKEN</span>' +
      (r.watchlist ? '<span class="badge wl">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">' + esc(r.category || 'No category') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      ' · listed ' + esc(r.listed_at || 'date unknown') + ' · TVL ' + money(r.tvl_usd) +
      ' · records no token in the snapshot.</p>' +
      '<div class="grid">' +
      '<div class="cell"><b>' + money(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div class="cell"><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="cell"><b>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b><span>7-day TVL change</span></div>' +
      '<div class="cell"><b>' + ageFmt(r.age_days) + '</b><span>running with no token</span></div>' +
      '</div>' +
      '<h3>How the implied value is built</h3>' +
      '<table class="calc"><tr><th>Step</th><th>Figure</th><th>Value</th></tr>' +
      '<tr><td>TVL × category multiple (' + esc(r.category || 'no category') + ' median mcap/TVL ' + mult.toFixed(3) + ')</td><td>' + money(r.tvl_usd) + ' × ' + mult.toFixed(3) + '</td><td>' + money(base) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + g.toFixed(1) + '% clamped, weight 0.6)</td><td>1 + ' + (g / 100 * 0.6).toFixed(3) + '</td><td>× ' + r.growth_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + (r.age_days === null ? 'age unknown, counted as 365 days' : r.age_days + ' days listed') + ')</td><td>0.70 + age share</td><td>× ' + r.maturity_multiplier.toFixed(4) + '</td></tr>' +
      '<tr><td>Implied value</td><td>base × growth × maturity</td><td>' + money(r.implied_value_usd) + '</td></tr></table>' +
      '<h3>Farm plan — what to do, what it costs, how long it takes</h3>' +
      '<ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">The snapshot records no token for this protocol; that is DefiLlama\u2019s record, not proof it has none. Implied value is the radar\u2019s own claim, not a prediction of a launch.</p>';
    if (push) history.replaceState(null, '', '#detail=' + slug);
    $('detail').scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  ['q', 'cat', 'chain', 'sort', 'watch'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });
  document.querySelectorAll('#board thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.k;
      $('sort').value = k === 'rank' || k === 'implied' ? 'implied' : k === 'tvl' ? 'tvl' : k === 'growth' ? 'growth' : k === 'age' ? 'age' : 'implied';
      renderBoard();
    });
  });

  // Hash routes for deep links and screenshots.
  function applyHash() {
    var h = location.hash.slice(1);
    var m = h.match(/^detail=(.+)$/);
    if (m) { openDetail(decodeURIComponent(m[1]), false); return; }
    var f = h.match(/^filter=category:(.+)$/);
    if (f) { $('cat').value = decodeURIComponent(f[1]); renderBoard(); }
  }
  renderBoard();
  applyHash();
  window.addEventListener('hashchange', applyHash);
})();
