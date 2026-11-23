/* Breakout Radar — renders window.BREAKOUT_RADAR with no network.
   Rows arrive compact: [rank, slug, name, category, chains, tvl, chg7d,
   listed_at, age_days, implied, score, tier, catMultiple, breakoutMult,
   maturityMult]. The farm plan is generated here from the same fields the
   model in lib/breakout.ts uses, so the page and board.json agree. */
(function () {
  'use strict';
  var D = window.BREAKOUT_RADAR;
  if (!D) { document.getElementById('view').innerHTML = '<p class="empty">No radar data loaded.</p>'; return; }

  function row(a) {
    return { rank: a[0], slug: a[1], name: a[2], category: a[3], chains: a[4], tvl: a[5],
      chg: a[6], listed: a[7], age: a[8], value: a[9], score: a[10], tier: a[11],
      mult: a[12], bmult: a[13], mmult: a[14] };
  }
  var ROWS = D.rows.map(row);
  var BY_SLUG = {};
  ROWS.forEach(function (r) { BY_SLUG[r.slug] = r; });
  var WATCH = {};
  (D.watchlist_slugs || []).forEach(function (s) { WATCH[s] = true; });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function usd(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }

  /* --- the farm plan, same rules as lib/breakout.ts farmSteps --- */
  function chainOf(r) { return r.chains && r.chains.length ? r.chains[0] : 'its main chain'; }
  function capitalFor(r) {
    if (r.tvl >= 5e9) return 250;
    if (r.tvl >= 1e9) return 150;
    if (r.tvl >= 1e8) return 100;
    return 50;
  }
  function holdFor(r) {
    if (r.tier === 'BREAKOUT') return 21;
    if (r.tier === 'HEATING') return 30;
    if (r.age == null) return 30;
    if (r.age < 180) return 60;
    if (r.age < 365) return 45;
    return 30;
  }
  function actionFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase(), n = r.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return 'Lend $' + capital + ' of USDC on ' + n + ' (' + chain + ') and leave the loan open so the position counts.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0)
      return 'Add $' + capital + ' of liquidity to ' + n + '\'s deepest pool on ' + chain + ' and keep the LP tokens.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return 'Deposit $' + capital + ' into a ' + n + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('bridge') >= 0)
      return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + n + ', then use the funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0)
      return 'Stake $' + capital + ' through ' + n + ' on ' + chain + ' and keep the staking receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0)
      return 'Post $' + capital + ' of USDC as margin on ' + n + ' (' + chain + ') and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0)
      return 'Fund ' + n + ' with $' + capital + ' and take one position in an open market.';
    if (c.indexOf('stable') >= 0)
      return 'Mint or deposit $' + capital + ' through ' + n + '\'s stablecoin on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0)
      return 'Mint $' + capital + ' of ' + n + '\'s yield-bearing asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0)
      return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('risk') >= 0)
      return 'Deposit $' + capital + ' into a ' + n + ' curated vault on ' + chain + ' and hold the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function planFor(r) {
    var chain = chainOf(r), capital = capitalFor(r), hold = holdFor(r);
    var urgency = r.tier === 'BREAKOUT' ? 'TVL is breaking out this week, so enter now while the farm is still cheap to join.'
      : r.tier === 'HEATING' ? 'TVL is heating up this week, so enter this week rather than next.'
      : r.tier === 'COOLING' ? 'TVL cooled this week, so enter small and add only if the move turns.'
      : 'Enter at your own pace; nothing in this week\'s move sets a deadline.';
    return [
      { text: 'Open a fresh wallet holding only the funds you plan to farm, and keep its seed phrase offline. ' + urgency,
        cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(r, capital, chain),
        cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week — a deposit, a borrow, a swap or a vote — while the breakout holds.',
        cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity lands in more than one snapshot.',
        cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.',
        cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    ];
  }

  /* --- masthead + ticker --- */
  var counts = {};
  ROWS.forEach(function (r) { counts[r.tier] = (counts[r.tier] || 0) + 1; });
  document.getElementById('mast-meta').innerHTML =
    '<span class="chip">Snapshot <b>' + esc(D.as_of) + '</b></span>' +
    '<span class="chip">Watchlist <b>' + D.watchlist_size + '</b></span>' +
    '<span class="chip">Board <b>' + D.board_size + ' rows</b></span>' +
    '<span class="chip">Model <b>' + esc(D.model_version) + '</b></span>' +
    '<span class="chip">BREAKOUT <b>' + (counts.BREAKOUT || 0) + '</b></span>';

  var hot = ROWS.filter(function (r) { return r.chg != null; })
    .sort(function (a, b) { return b.chg - a.chg; }).slice(0, 5);
  document.getElementById('ticker').innerHTML = '<span class="label">BREAKING OUT NOW</span>' +
    hot.map(function (r) {
      return '<a class="tick" href="#detail/' + esc(r.slug) + '">' + esc(r.name) +
        ' <span class="pct">' + pct(r.chg) + '</span></a>';
    }).join('');

  /* --- controls --- */
  var catSel = document.getElementById('cat'), chainSel = document.getElementById('chain');
  var cats = {}, chains = {};
  ROWS.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    (r.chains || []).forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.textContent = c; catSel.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.textContent = c; chainSel.appendChild(o);
  });

  /* --- board --- */
  var view = document.getElementById('view');
  var countEl = document.getElementById('count');
  var qEl = document.getElementById('q'), tierEl = document.getElementById('tier'),
      sortEl = document.getElementById('sort'), watchEl = document.getElementById('watch');

  function chgCell(r) {
    if (r.chg == null) return '<span class="chg">n/a</span>';
    var w = Math.min(100, Math.abs(r.chg) / 1.5);
    var cls = r.chg >= 0 ? '' : 'neg';
    var bar = '<span class="chgbar"><i class="' + cls + '" style="width:' + Math.max(4, w) + '%"></i></span>';
    return bar + '<span class="chg ' + (r.chg >= 0 ? 'pos' : 'neg') + '">' + pct(r.chg) + '</span>';
  }
  function filtered() {
    var q = qEl.value.trim().toLowerCase();
    var list = ROWS.filter(function (r) {
      if (tierEl.value && r.tier !== tierEl.value) return false;
      if (catSel.value && r.category !== catSel.value) return false;
      if (chainSel.value && !(r.chains || []).indexOf(chainSel.value) >= 0) return false;
      if (watchEl.checked && !WATCH[r.slug]) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var s = sortEl.value;
    list.sort(function (a, b) {
      if (s === 'tvl') return b.tvl - a.tvl;
      if (s === 'chg') return (b.chg == null ? -1e9 : b.chg) - (a.chg == null ? -1e9 : a.chg);
      if (s === 'score') return b.score - a.score;
      if (s === 'age') return (b.age == null ? -1 : b.age) - (a.age == null ? -1 : a.age);
      return a.rank - b.rank;
    });
    return list;
  }
  function renderBoard() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + ROWS.length + ' rows' +
      (tierEl.value ? ' · tier ' + tierEl.value : '') +
      (watchEl.checked ? ' · watchlist only' : '');
    if (!list.length) { view.innerHTML = '<p class="empty">Nothing matches those filters.</p>'; return; }
    var html = '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th>' +
      '<th class="hide-sm">Chains</th><th class="num">TVL</th><th>7-day</th>' +
      '<th>Breakout</th><th class="num hide-sm">Age</th><th class="num">Implied value</th></tr></thead><tbody>';
    list.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '"' + (r.rank <= 3 ? ' class="top3"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' +
          (WATCH[r.slug] ? '<span class="wdot" title="On the watchlist"></span>' : '') +
          '<br><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains hide-sm">' + esc((r.chains || []).slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + usd(r.tvl) + '</td>' +
        '<td>' + chgCell(r) + '</td>' +
        '<td><span class="tier ' + r.tier + '">' + r.tier + '</span><span class="score">' + r.score + '</span></td>' +
        '<td class="num age hide-sm">' + ageText(r.age) + '</td>' +
        '<td class="num value">' + usd(r.value) + '</td></tr>';
    });
    view.innerHTML = html + '</tbody></table>';
    view.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#detail/' + tr.getAttribute('data-slug'); });
    });
  }

  /* --- detail --- */
  function renderDetail(slug) {
    var r = BY_SLUG[slug];
    if (!r) { renderBoard(); return; }
    var steps = planFor(r);
    var catInfo = null;
    (D.categories || []).forEach(function (c) { if (c.category === r.category) catInfo = c; });
    var base = r.tvl * r.mult;
    var why = r.tier === 'BREAKOUT'
      ? '<b>' + esc(r.name) + ' ranks #' + r.rank + ' because its TVL is breaking out now.</b> '
        + 'A ' + pct(r.chg) + ' week on ' + usd(r.tvl) + ' of TVL lifts the breakout multiplier to '
        + r.bmult.toFixed(2) + '×, and the ' + esc(r.category || 'uncategorized')
        + ' category pays a ' + r.mult.toFixed(2) + '× multiple on TVL.'
      : '<b>' + esc(r.name) + ' ranks #' + r.rank + ' on size and staying power.</b> '
        + 'Its ' + usd(r.tvl) + ' of TVL at the ' + esc(r.category || 'uncategorized')
        + ' category multiple of ' + r.mult.toFixed(2) + '×, a ' + pct(r.chg)
        + ' week and ' + ageText(r.age) + ' of age with no token recorded set its implied value.';
    view.innerHTML =
      '<a class="back" href="#board">← Back to the board</a>' +
      '<div class="detail-head"><h2>' + esc(r.name) + '</h2>' +
        '<span class="slug">' + esc(r.slug) + '</span>' +
        '<span class="tier ' + r.tier + '">' + r.tier + '</span><span class="score">score ' + r.score + '</span>' +
        (WATCH[r.slug] ? '<span class="chip">On the watchlist</span>' : '') + '</div>' +
      '<div class="stats">' +
        '<div class="stat"><div class="k">TVL</div><div class="v">' + usd(r.tvl) + '</div><div class="s">' + esc((r.chains || []).join(', ') || '—') + '</div></div>' +
        '<div class="stat"><div class="k">7-day change</div><div class="v">' + pct(r.chg) + '</div><div class="s">volume breakout signal</div></div>' +
        '<div class="stat"><div class="k">Age, no token</div><div class="v">' + ageText(r.age) + '</div><div class="s">tracked since ' + esc(r.listed || 'unknown') + '</div></div>' +
        '<div class="stat"><div class="k">Implied value</div><div class="v">' + usd(r.value) + '</div><div class="s">rank #' + r.rank + ' of ' + ROWS.length + '</div></div>' +
      '</div>' +
      '<div class="waterfall">' +
        '<div class="wf"><div class="k">TVL × category multiple</div><div class="v">' + usd(base) + '</div><div class="s">' + usd(r.tvl) + ' × ' + r.mult.toFixed(2) + '× (' + (catInfo ? catInfo.peers + ' peers' : 'market median') + ')</div></div>' +
        '<div class="wf op">×</div>' +
        '<div class="wf"><div class="k">Breakout</div><div class="v">' + r.bmult.toFixed(2) + '×</div><div class="s">' + pct(r.chg) + ' in 7 days</div></div>' +
        '<div class="wf op">×</div>' +
        '<div class="wf"><div class="k">Maturity</div><div class="v">' + r.mmult.toFixed(2) + '×</div><div class="s">' + ageText(r.age) + ' with no token</div></div>' +
        '<div class="wf op">=</div>' +
        '<div class="wf result"><div class="k">Implied value</div><div class="v">' + usd(r.value) + '</div><div class="s">what a launch would be worth</div></div>' +
      '</div>' +
      '<p class="why">' + why + ' The record says it records no token — never that it has none.</p>' +
      '<div class="steps"><h3>Farm plan — five steps</h3>' +
        steps.map(function (s, i) {
          return '<div class="step"><span class="n">' + (i + 1) + '</span><p>' + esc(s.text) +
            '<span class="cost">Cost: <b>' + esc(s.cost) + '</b> · Time: <b>' + esc(s.time) + '</b></span></p></div>';
        }).join('') + '</div>';
    countEl.textContent = 'Detail · ' + r.name + ' · rank #' + r.rank + ' · ' + r.tier;
    window.scrollTo(0, 0);
  }

  /* --- live comparables --- */
  var liveHtml = '<h2>What the market pays — live-token comparables</h2>' +
    '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th>' +
    '<th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>';
  (D.live || []).forEach(function (l) {
    liveHtml += '<tr><td>' + esc(l[1]) + '</td><td>' + esc(l[2] || '—') + '</td>' +
      '<td class="num">' + usd(l[4]) + '</td><td class="num">' + usd(l[5]) + '</td>' +
      '<td class="num">' + (l[7] == null ? '—' : l[7].toFixed(2) + '×') + '</td></tr>';
  });
  document.getElementById('live').innerHTML = liveHtml + '</tbody></table>' +
    '<p class="note">These protocols already trade, so the board shows the market\u2019s own value for them, ' +
    'never a model\u2019s. Their mcap / TVL ratios are the comparables the category multiples come from ' +
    '(market median ' + D.global_multiple.toFixed(2) + '×).</p>';

  /* --- method --- */
  var catLines = (D.categories || []).slice(0, 8).map(function (c) {
    return esc(c.category) + ' ' + c.multiple.toFixed(2) + '× (' + c.peers + ' peers)';
  }).join(' · ');
  document.getElementById('method').innerHTML = '<h2>How the radar works</h2>' +
    '<p><b>Implied value</b> = TVL × category multiple × breakout × maturity. ' +
    'The category multiple is the median market-cap / TVL of the tokenized peers in the protocol\u2019s own ' +
    'category; the breakout is <code>1 + 0.9 × tanh(clamp(7-day change, −50%, +150%) / 40)</code>, so a hot week ' +
    'lifts value and a cold week cuts it, but no single week can run away with the board; maturity is ' +
    '<code>0.7 + 0.3 × min(age, 3y) / 3y</code>. No protocol name is ever special-cased.</p>' +
    '<p><b>Breakout tiers</b> come from the seven-day move alone: BREAKOUT is a score of 80 or more, ' +
    'HEATING 65+, STEADY 40+, COOLING below 40, UNRATED when no move is reported. ' +
    'Category multiples in this snapshot: ' + catLines + '.</p>' +
    '<p><b>Coverage.</b> The board ranks all ' + D.watchlist_size + ' protocols on the snapshot\u2019s watchlist ' +
    '(TVL at or above ' + usd(D.floor_usd) + ', no token recorded, not a wrapped, staked or bridged product) plus ' +
    D.early_size + ' pre-token protocols below the floor, chosen by implied value under this model. ' +
    'A dot marks watchlist rows. Live-token protocols are listed separately as comparables.</p>' +
    '<p><b>Reading the record.</b> The snapshot is DefiLlama\u2019s public protocol data as of ' + esc(D.as_of) + '. ' +
    'A protocol is shown as one that records no token, never as one that has none: a record can miss a token. ' +
    'Implied value is this entry\u2019s own claim, not a prediction that a token is issued or when.</p>';

  /* --- routing + events --- */
  function route() {
    var h = location.hash || '#board';
    if (h.indexOf('#detail/') === 0) { renderDetail(decodeURIComponent(h.slice(8))); return; }
    if (h.indexOf('#tier/') === 0) {
      var t = decodeURIComponent(h.slice(6)).toUpperCase();
      if (['BREAKOUT', 'HEATING', 'STEADY', 'COOLING', 'UNRATED'].indexOf(t) >= 0) tierEl.value = t;
      renderBoard(); return;
    }
    renderBoard();
  }
  [qEl, tierEl, catSel, chainSel, sortEl, watchEl].forEach(function (el) {
    el.addEventListener('input', renderBoard);
    el.addEventListener('change', renderBoard);
  });
  window.addEventListener('hashchange', route);
  route();
})();
