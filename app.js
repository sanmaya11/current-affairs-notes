/* Current-affairs study app: daily notes, previous-year questions (PYQs), practice,
   flashcards and saved items. Works from disk (data loaded with <script> tags) and on the
   published site (encrypted data, decrypted in the browser after the password). */
(function () {
  "use strict";

  /* ================================================================ data + storage */
  var SITE = !!window.NOTES_SITE;
  var M = [], DAYS = {}, PYQ = null, SUBJ = null, KEY = null, META = {}, booted = false;
  window.NOTES_LOAD = function (date, data) { DAYS[date] = data; };
  window.NOTES_PYQ_LOAD = function (data) { PYQ = data; };
  window.NOTES_SUBJECTS_LOAD = function (data) { SUBJ = data; };

  var PAPERS = [
    ["GS1", "History, Geography, Society", "--gs1"], ["GS2", "Polity, Governance, IR", "--gs2"],
    ["GS3", "Economy, Environment, Sci-Tech", "--gs3"], ["GS4", "Ethics", "--gs4"],
    ["Essay", "Essay", "--essay"], ["Prelims", "Prelims", "--prelims"]
  ];
  var PCOLOR = {}; PAPERS.forEach(function (p) { PCOLOR[p[0]] = p[2]; });
  var DAY_MS = 864e5;
  var $ = function (id) { return document.getElementById(id); };
  var main = $("main"), rail = $("rail"), app = $("app");

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("ca:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("ca:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  // Per-browser study data: revised topics, bookmarks, own notes, flashcard schedule, practice history.
  var U = {
    revised: store.get("revised", {}), saved: store.get("saved", {}), mynotes: store.get("mynotes", {}),
    cards: store.get("cards", {}), attempts: store.get("attempts", [])
  };
  function persist(k) { store.set(k, U[k]); }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function d8(date) { var p = date.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(date, o) { return d8(date).toLocaleDateString("en-IN", o); }
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function badge(g) { return '<span class="badge" style="--c:var(' + (PCOLOR[g] || "--prelims") + ')">' + esc(g) + "</span>"; }
  function list(items, cls, tag) { items = (items || []).filter(Boolean); tag = tag || "ul"; return items.length ? "<" + tag + ' class="' + (cls || "list") + '">' + items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</" + tag + ">" : ""; }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function icon(name) {
    var P = {
      home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      news: '<path d="M4 5h13v14H4zM17 8h3v10a1 1 0 0 1-1 1h-2M7 9h7M7 13h7M7 16h4"/>',
      book: '<path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 20a2 2 0 0 1 0-4h10"/>',
      check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
      cards: '<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v11"/>',
      star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      note: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
      tick: '<path d="m5 12 5 5 9-10"/>',
      layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'
    };
    return '<svg class="i" viewBox="0 0 24 24">' + (P[name] || "") + "</svg>";
  }

  /* ---------- syllabus lookups (from the PYQ bundle) */
  var TOPIC = {}, SUBJECTS = [];
  function indexSyllabus() {
    TOPIC = {}; SUBJECTS = (PYQ && PYQ.syllabus) || [];
    SUBJECTS.forEach(function (s) { s.topics.forEach(function (t) { TOPIC[t.id] = { title: t.title, subject: s.subject, papers: t.papers }; }); });
  }
  function topicName(id) { var t = TOPIC[id]; return t ? t.subject + " › " + t.title : ""; }

  /* ---------- loading: local <script> files, or encrypted files on the site */
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function tob64(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function decryptWith(key, url, gz) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { var u = unb64(t.trim()); return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, key, u.slice(12)); })
      .then(function (buf) {
        if (!gz) return new TextDecoder().decode(buf);
        return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      })
      .then(JSON.parse);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function loadDay(date) {
    if (DAYS[date]) return Promise.resolve(DAYS[date]);
    var m = M.filter(function (x) { return x.date === date; })[0], v = m && m.v ? "?v=" + m.v : "";
    if (SITE) return decryptWith(KEY, "data/" + date + ".enc" + v).then(function (d) { DAYS[date] = d; return d; });
    return loadScript("data/" + date + ".js" + v).then(function () { if (!DAYS[date]) throw new Error("missing"); return DAYS[date]; });
  }
  function loadAllDays(dates) { return Promise.all((dates || M.map(function (m) { return m.date; })).map(function (d) { return loadDay(d).catch(function () { return null; }); })); }
  var pyqPromise = null;
  function loadPyq() {
    if (PYQ) return Promise.resolve(PYQ);
    if (!pyqPromise) {
      pyqPromise = (SITE ? decryptWith(KEY, "data/pyq.enc?v=" + (META.pyq_v || ""), true).then(function (d) { PYQ = d; })
        : loadScript("data/pyq.js?" + Date.now())).then(function () { PYQ = PYQ || { syllabus: [], papers: [], questions: [] }; indexSyllabus(); return PYQ; });
      pyqPromise.catch(function () { pyqPromise = null; });
    }
    return pyqPromise;
  }

  var subjPromise = null;
  function loadSubjects() {
    if (SUBJ) return Promise.resolve(SUBJ);
    if (!subjPromise) {
      subjPromise = (SITE ? decryptWith(KEY, "data/subjects.enc?v=" + (META.subjects_v || ""), true).then(function (d) { SUBJ = d; })
        : loadScript("data/subjects.js?" + Date.now())).then(function () { SUBJ = SUBJ || {}; return SUBJ; });
      subjPromise.catch(function () { subjPromise = null; });
    }
    return subjPromise;
  }

  /* ================================================================ study-data helpers */
  function key(date, i) { return date + "#" + i; }
  function revCount(m) { var n = 0; m.topics.forEach(function (_, i) { if (U.revised[key(m.date, i)]) n++; }); return n; }
  function cardsDue() {
    var now = Date.now(), n = 0;
    Object.keys(U.cards).forEach(function (k) { if (U.cards[k].due <= now) n++; });
    return n;
  }
  function record(src, ok, paper, subject) {
    U.attempts.push({ s: src, ok: ok ? 1 : 0, p: paper || "", sub: subject || "", t: Date.now() });
    if (U.attempts.length > 3000) U.attempts = U.attempts.slice(-3000);
    persist("attempts");
  }
  function streak() {
    var days = {};
    U.attempts.forEach(function (a) { days[new Date(a.t).toDateString()] = 1; });
    Object.keys(U.revised).forEach(function (k) { if (typeof U.revised[k] === "number") days[new Date(U.revised[k]).toDateString()] = 1; });
    Object.keys(U.cards).forEach(function (k) { if (U.cards[k].seen) days[new Date(U.cards[k].seen).toDateString()] = 1; });
    var n = 0, d = new Date();
    if (!days[d.toDateString()]) d = new Date(d.getTime() - DAY_MS);
    while (days[d.toDateString()]) { n++; d = new Date(d.getTime() - DAY_MS); }
    return n;
  }

  // Star, note and (for topics) revised buttons, shared by daily topics and PYQs.
  function actions(id, info, withRevised) {
    var saved = !!U.saved[id], note = U.mynotes[id];
    return '<div class="acts" data-id="' + esc(id) + '" data-info="' + esc(JSON.stringify(info)) + '">' +
      (withRevised ? '<button class="iconbtn rev' + (U.revised[withRevised] ? " on" : "") + '" data-act="rev" data-rk="' + esc(withRevised) + '">' + icon("tick") + (U.revised[withRevised] ? "Revised" : "Mark revised") + "</button>" : "") +
      '<button class="iconbtn star' + (saved ? " on" : "") + '" data-act="star" title="Bookmark">' + icon("star") + (saved ? "Saved" : "Save") + "</button>" +
      '<button class="iconbtn note' + (note ? " on" : "") + '" data-act="note" title="My notes">' + icon("note") + (note ? "My note" : "Add note") + "</button></div>" +
      '<div class="notebox" data-for="' + esc(id) + '"><textarea placeholder="Your own notes, mnemonics, points to add in an answer…">' + esc(note ? note.text : "") + '</textarea><small>Saved automatically in this browser.</small></div>';
  }
  function bindActions(root) {
    root.querySelectorAll(".acts").forEach(function (box) {
      var id = box.dataset.id, info = JSON.parse(box.dataset.info), nb = box.nextElementSibling;
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b) return;
        var act = b.dataset.act;
        if (act === "star") {
          if (U.saved[id]) delete U.saved[id]; else U.saved[id] = Object.assign({ t: Date.now() }, info);
          persist("saved");
          b.classList.toggle("on", !!U.saved[id]); b.innerHTML = icon("star") + (U.saved[id] ? "Saved" : "Save");
        } else if (act === "note") {
          nb.classList.toggle("open"); if (nb.classList.contains("open")) nb.querySelector("textarea").focus();
        } else if (act === "rev") {
          var rk = b.dataset.rk;
          if (U.revised[rk]) delete U.revised[rk]; else U.revised[rk] = Date.now();
          persist("revised");
          var yes = !!U.revised[rk];
          b.classList.toggle("on", yes); b.innerHTML = icon("tick") + (yes ? "Revised" : "Mark revised");
          document.dispatchEvent(new CustomEvent("revised", { detail: { rk: rk, yes: yes } }));
        }
        renderNav();
      });
      var tmr, ta = nb.querySelector("textarea"), btn = box.querySelector('[data-act="note"]');
      ta.addEventListener("input", function () {
        clearTimeout(tmr);
        tmr = setTimeout(function () {
          var v = ta.value.trim();
          if (v) U.mynotes[id] = Object.assign({ text: v, t: Date.now() }, info); else delete U.mynotes[id];
          persist("mynotes");
          btn.classList.toggle("on", !!v); btn.innerHTML = icon("note") + (v ? "My note" : "Add note");
          renderNav();
        }, 400);
      });
    });
  }

  /* ---------- MCQs (daily notes and PYQs) */
  function mcqHTML(q, opts) {
    opts = opts || {};
    return '<div class="mcq" data-ans="' + q.answer + '" data-src="' + (opts.src || "notes") + '" data-paper="' + esc(opts.paper || "") + '" data-sub="' + esc(opts.sub || "") + '">' +
      '<div class="qq">' + esc(q.q) + '</div><div class="opts">' + (q.options || []).map(function (o, k) {
        return '<button class="opt" data-k="' + k + '"><span class="l">' + "ABCD"[k] + "</span><span>" + esc(o) + "</span></button>"; }).join("") +
      '</div><div class="explain"><b>Answer: ' + ("ABCD"[q.answer] || "?") + "</b>" + (opts.ai ? '<span class="ai">AI answer · no official key</span>' : "") +
      " — " + esc(q.explanation) + "</div>" + (opts.extra || "") + "</div>";
  }
  function bindMcqs(root, onAnswer) {
    root.querySelectorAll(".mcq").forEach(function (box) {
      box.addEventListener("click", function (e) {
        var b = e.target.closest(".opt"); if (!b || box.classList.contains("done")) return;
        var ans = +box.dataset.ans, k = +b.dataset.k;
        box.classList.add("done");
        box.querySelectorAll(".opt").forEach(function (o) { if (+o.dataset.k === ans) o.classList.add("right"); });
        if (k !== ans) b.classList.add("wrong");
        record(box.dataset.src, k === ans, box.dataset.paper, box.dataset.sub);
        if (onAnswer) onAnswer(k === ans);
      });
    });
  }
  function noteMcq(t, q) { return { q: q.question, options: q.options, answer: q.answer_index, explanation: q.explanation }; }

  /* ================================================================ sidebar */
  function renderNav() {
    var r = current, total = 0, done = 0;
    M.forEach(function (m) { total += m.topics.length; done += revCount(m); });
    var due = cardsDue(), savedN = Object.keys(U.saved).length + Object.keys(U.mynotes).length;
    var link = function (href, ic, label, on, n, cls) {
      return '<a class="navlink' + (on ? " on" : "") + '" href="' + href + '">' + icon(ic) + label + (n ? '<span class="n ' + (cls || "") + '">' + n + "</span>" : "") + "</a>";
    };
    $("nav").innerHTML =
      link("#/", "home", "Home", r.name === "home") +
      link(M[0] ? "#/d/" + M[0].date : "#/", "news", "Latest notes", r.name === "day" && M[0] && r.day === M[0].date) +
      link("#/subjects", "layers", "Subjects &amp; syllabus", r.name === "subjects" || r.name === "subject") +
      link("#/pyq", "book", "Previous year questions", r.name === "pyq") +
      link("#/practice", "check", "Practice MCQs", r.name === "practice") +
      link("#/cards", "cards", "Flashcards", r.name === "cards", due || "", "due") +
      link("#/saved", "star", "Saved &amp; my notes", r.name === "saved", savedN || "") +
      link("#/pending", "clock", "Not yet revised", r.name === "pending", (total - done) || "");
    var month = "", h = "";
    M.forEach(function (m) {
      var mo = fmt(m.date, { month: "long", year: "numeric" });
      if (mo !== month) { h += '<div class="month">' + esc(mo) + "</div>"; month = mo; }
      h += '<a class="day' + (r.day === m.date ? " on" : "") + '" href="#/d/' + m.date + '"><span class="dn">' + d8(m.date).getDate() +
        '</span><span class="dw"><b>' + esc(fmt(m.date, { weekday: "long" })) + "</b>" + m.topics.length + " topics</span>" + ring(revCount(m), m.topics.length) + "</a>";
    });
    $("days").innerHTML = h || '<div class="empty" style="padding:20px 0">No notes yet</div>';
    $("papers").innerHTML = PAPERS.map(function (p) {
      return '<a class="pchip' + (r.paper === p[0] ? " on" : "") + '" href="#/gs/' + p[0] + '" title="' + esc(p[1]) + '"><span class="dot" style="--c:var(' + p[2] + ')"></span>' + p[0] + "</a>";
    }).join("");
    $("stat").textContent = M.length + " days · " + done + "/" + total + " revised";
  }
  function ring(done, total) {
    var r = 8, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="ring" viewBox="0 0 22 22"><circle cx="11" cy="11" r="' + r + '" fill="none" stroke="var(--line2)" stroke-width="2.5"/>' +
      (f ? '<circle cx="11" cy="11" r="' + r + '" fill="none" stroke="var(--good)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="' + (c * f) + " " + c + '" transform="rotate(-90 11 11)"/>' : "") + "</svg>";
  }
  function page(html, wide, withRail) {
    app.classList.toggle("norail", !withRail);
    if (!withRail) rail.innerHTML = "";
    main.innerHTML = '<div class="wrap' + (wide ? " wide" : "") + '">' + mast() + html + "</div>";
    tickHud();
  }
  function mast() {
    return '<header class="mast"><div class="aurora"></div><div><a class="wordmark" href="#/">the notes<i>.</i></a><span class="tagline">UPSC CSE · daily intelligence brief</span><span class="edition" id="hud-e"></span></div>' +
      '<div class="hud"><em class="live">live</em><b id="hud-d"></b><b id="hud-t"></b></div></header>';
  }
  var hudTimer;
  function tickHud() {
    var d = $("hud-d"), t = $("hud-t"); if (!d) return;
    var n = new Date();
    d.textContent = n.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    var e = $("hud-e"), doy = Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5);
    if (e) e.textContent = "Vol. " + (n.getFullYear() - 2025) + " · Issue Nº " + String(doy).padStart(3, "0") + " · " + M.length + " editions archived";
    t.textContent = n.toLocaleTimeString("en-GB") + " IST";
    clearTimeout(hudTimer); hudTimer = setTimeout(tickHud, 1000);
  }

  /* ================================================================ home */
  function renderHome() {
    page('<div class="empty">Loading…</div>', true);
    var latest = M[0];
    Promise.all([latest ? loadDay(latest.date) : null, loadPyq().catch(function () { return null; })]).then(function (res) {
      var day = res[0], total = 0, done = 0;
      M.forEach(function (m) { total += m.topics.length; done += revCount(m); });
      var month = U.attempts.filter(function (a) { return a.t > Date.now() - 30 * DAY_MS; });
      var right = month.filter(function (a) { return a.ok; }).length;
      var pyqAttempted = {}; U.attempts.forEach(function (a) { if (a.s === "pyq") pyqAttempted[a.t] = 1; });
      var prelimsN = PYQ ? PYQ.questions.filter(function (q) { return q.exam === "Prelims"; }).length : 0;
      var hour = new Date().getHours(), hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      var st = streak();
      var h = '<div class="eyebrow">' + esc(new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })) + "</div>" +
        "<h1>" + hello + "</h1>" + '<div class="meta">' + (st ? '<span class="streak">🔥 ' + st + "-day streak</span>" : "<span>Study something today to start a streak.</span>") + "</div>";
      h += '<div class="tiles">' +
        tile(latest ? "#/d/" + latest.date : "#/", "Latest notes", latest ? latest.topics.length : 0, latest ? fmt(latest.date, { day: "numeric", month: "short" }) + " · topics" : "none yet") +
        tile("#/pending", "Revised", pct(done, total) + "%", done + " of " + total + " topics") +
        tile("#/practice", "Practice accuracy", month.length ? pct(right, month.length) + "%" : "–", month.length + " answered in 30 days") +
        tile("#/cards", "Flashcards due", cardsDue(), Object.keys(U.cards).length + " cards learning") + "</div>";
      if (day) {
        var facts = (day.quick_bites || []).map(function (b) { return esc(b.fact); });
        if (facts.length) {
          var items = facts.map(function (f) { return "<span>" + f + "</span>"; }).join("");
          h += '<div class="ticker" aria-label="Quick bites"><b>Quick bites</b><div class="viewport"><div class="track">' + items + items + "</div></div></div>";
        }
        h += '<h2 class="sec-title">front page<a href="#/d/' + latest.date + '">All ' + day.notes.length + " topics →</a></h2>";
        h += '<div class="front">' + topicCard(latest.date, day.notes[0], 0, true) +
          day.notes.slice(1, 7).map(function (t, i) { return topicCard(latest.date, t, i + 1); }).join("") + "</div>";
      }
      h += '<div class="grid" style="margin-top:8px"><section class="panel" style="margin:0"><h2>Accuracy by subject</h2>' + accuracyBars() + "</section>" +
        '<section class="panel" style="margin:0"><h2>Previous year questions</h2>' + pyqSummary(prelimsN) + "</section></div>";
      page(h, true);
      countUp();
    });
  }
  function countUp() {
    main.querySelectorAll(".tile .v").forEach(function (el) {
      var m = /^(\d+)(%?)$/.exec(el.textContent.trim()); if (!m || +m[1] === 0) return;
      var end = +m[1], t0 = performance.now();
      (function step(t) {
        var k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + m[2];
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
  function tile(href, k, v, s) { return '<a class="tile" href="' + href + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + esc(s) + "</div></a>"; }
  function accuracyBars() {
    var by = {};
    U.attempts.forEach(function (a) { var k = a.sub || a.p || "Other"; by[k] = by[k] || [0, 0]; by[k][0] += a.ok; by[k][1]++; });
    var rows = Object.keys(by).filter(function (k) { return by[k][1] >= 1; }).sort(function (a, b) { return by[a][0] / by[a][1] - by[b][0] / by[b][1]; });
    if (!rows.length) return '<p style="color:var(--muted);margin:0">Answer some MCQs in <a href="#/practice">Practice</a> or <a href="#/pyq">PYQs</a> and your strong and weak subjects show up here.</p>';
    var weak = rows.filter(function (k) { return by[k][1] >= 3 && by[k][0] / by[k][1] < 0.6; }).slice(0, 3);
    return '<div class="bars">' + rows.slice(0, 8).map(function (k) {
      var p = pct(by[k][0], by[k][1]), c = p >= 70 ? "--good" : p >= 50 ? "--gs1" : "--bad";
      return '<div class="brow"><span>' + esc(k) + '</span><div class="bar" style="--c:var(' + c + ')"><i style="width:' + p + '%"></i></div><span class="pct">' + p + "% · " + by[k][1] + "</span></div>";
    }).join("") + "</div>" + (weak.length ? '<p style="margin:14px 0 0;font-size:13.5px;color:var(--muted)">Focus on: ' + weak.map(function (k) { return "<b>" + esc(k) + "</b>"; }).join(", ") + "</p>" : "");
  }
  function pyqSummary(prelimsN) {
    if (!PYQ || !PYQ.questions.length) return '<p style="color:var(--muted);margin:0">Official UPSC papers from 2016 onwards are being added a few at a time. They show up here as they are ready.</p>';
    var by = { Prelims: 0, Mains: 0, Essay: 0 };
    PYQ.questions.forEach(function (q) { by[qKind(q)]++; });
    var done = PYQ.papers.filter(function (p) { return p.complete; }).length;
    return '<div class="bars">' + ["Prelims", "Mains", "Essay"].map(function (k) {
      return '<div class="brow"><a href="#/pyq/' + k.toLowerCase() + '">' + k + '</a><div class="bar" style="--c:var(--gs2)"><i style="width:' + Math.min(100, pct(by[k], k === "Prelims" ? 1100 : k === "Mains" ? 880 : 88)) + '%"></i></div><span class="pct">' + by[k] + "</span></div>";
    }).join("") + '</div><p style="margin:14px 0 0;font-size:13.5px;color:var(--muted)">' + done + " of 66 official papers (2016–2026) processed so far. <a href=\"#/pyq\">Browse by topic →</a></p>";
  }
  function topicCard(date, t, i, lead) {
    return '<a class="tcard' + (lead ? " lead" : "") + '" href="#/d/' + date + "/" + (i + 1) + '"><span class="tick' + (U.revised[key(date, i)] ? " yes" : "") + '" data-tick="' + i + '"></span><span class="no">' + String(i + 1).padStart(2, "0") +
      "</span>" + (lead ? '<span class="kicker">Lead story</span>' : "") + "<h3>" + esc(t.title) + "</h3><p>" + esc(t.why_in_news) + '</p><div class="gsl">' + (t.gs_papers || []).map(badge).join("") + "</div></a>";
  }

  /* ================================================================ day view */
  function renderDay(date, focus) {
    var idx = M.findIndex(function (m) { return m.date === date; });
    if (idx < 0) { page('<div class="empty">No notes for this date.</div>'); return; }
    var m = M[idx];
    page('<div class="empty">Loading…</div>', false, true);
    loadDay(date).then(function (day) {
      var newer = M[idx - 1], older = M[idx + 1], n = day.notes.length, done = revCount(m);
      var h = '<div class="eyebrow">Daily current affairs</div><h1>' + esc(fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + "</h1>";
      h += '<div class="meta"><span>' + n + " topics</span><span>·</span><span>" + (day.stories_read ? day.stories_read + " stories read" : "The Hindu") + "</span>" +
        (m.lite ? '<span class="litechip" title="Written by a faster model while the free daily limit was used up. It is rewritten in full automatically when possible.">Short version</span>' : "") +
        '<div class="pager"><a class="btn" aria-disabled="' + !older + '" href="' + (older ? "#/d/" + older.date : "#") + '">← Older</a><a class="btn" aria-disabled="' + !newer + '" href="' + (newer ? "#/d/" + newer.date : "#") + '">Newer →</a></div></div>';
      h += '<div class="progress"><span id="pg-t">' + done + " of " + n + ' revised</span><div class="bar"><i id="pg-b" style="width:' + pct(done, n) + '%"></i></div></div>';
      h += '<div class="grid">' + day.notes.map(function (t, i) { return topicCard(date, t, i); }).join("") + "</div>";
      if (day.quick_bites && day.quick_bites.length) {
        h += '<section class="panel" id="bites"><h2>Quick bites for Prelims</h2><ul class="bites">' + day.quick_bites.map(function (b) {
          return "<li>" + esc(b.fact) + (b.link ? ' <a href="' + esc(b.link) + '" target="_blank" rel="noopener">source ↗</a>' : "") + "</li>";
        }).join("") + "</ul></section>";
      }
      day.notes.forEach(function (t, i) { h += topicHTML(date, t, i); });
      h += '<p class="disclaimer">AI-written study notes. The story comes from the newspaper; background facts and figures come from the model\'s own knowledge, so check anything you plan to quote against the original article or an official source.</p>';
      page(h, false, true);
      rail.innerHTML = "<h6>On this page</h6>" + day.notes.map(function (t, i) {
        return '<a href="#/d/' + date + "/" + (i + 1) + '" data-spy="t' + (i + 1) + '"><span>' + esc(t.title) + '</span><span class="rt" data-rt="' + i + '">' + (U.revised[key(date, i)] ? "✓" : "") + "</span></a>";
      }).join("") + (day.quick_bites && day.quick_bites.length ? '<a href="#/d/' + date + '/bites" data-spy="bites">Quick bites</a>' : "");
      bindMcqs(main); bindToggles(main); bindActions(main); spy();
      onRevised = function (e) {
        var parts = e.detail.rk.split("#"); if (parts[0] !== date) return;
        var i = +parts[1], t = main.querySelector('[data-tick="' + i + '"]'), rt = rail.querySelector('[data-rt="' + i + '"]');
        if (t) t.classList.toggle("yes", e.detail.yes); if (rt) rt.textContent = e.detail.yes ? "✓" : "";
        var d2 = revCount(m); $("pg-t").textContent = d2 + " of " + n + " revised"; $("pg-b").style.width = pct(d2, n) + "%";
      };
      if (focus) { var el = $(focus === "bites" ? "bites" : "t" + focus); if (el) el.scrollIntoView(); } else window.scrollTo(0, 0);
    }, function () { page('<div class="empty">Could not load notes for ' + esc(date) + ".</div>"); });
  }
  var onRevised = null;
  document.addEventListener("revised", function (e) { if (onRevised) onRevised(e); });

  function topicHTML(date, t, i) {
    var h = '<article class="topic" id="t' + (i + 1) + '"><div class="thead"><div class="tnum">' + String(i + 1).padStart(2, "0") + "</div><div>";
    h += '<div class="gsl">' + (t.gs_papers || []).map(badge).join("") + "</div><h2>" + esc(t.title) + "</h2>";
    if (t.syllabus_area) h += '<div class="syl">' + esc(t.syllabus_area) + "</div>";
    h += '</div></div><div class="why"><b>Why in news</b>' + esc(t.why_in_news) + "</div>";
    var bg = String(t.background || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); });
    if (bg.length) h += '<div class="sec prose"><h4>Background &amp; context</h4>' + bg.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>";
    if ((t.source_static || []).length) h += '<div class="sec"><h4>Static context from the articles</h4>' + list(t.source_static, "statics") + "</div>";
    if ((t.key_points || []).length) h += '<div class="sec"><h4>Key points</h4>' + list(t.key_points) + "</div>";
    if ((t.static_concepts || []).length) h += '<div class="sec"><h4>Syllabus links</h4><div class="concepts">' + t.static_concepts.map(function (c) {
      return '<div class="concept"><b>' + esc(c.term) + "</b><span>" + esc(c.explanation) + "</span></div>"; }).join("") + "</div></div>";
    if ((t.arguments_for || []).length || (t.concerns || []).length) h += '<div class="sec"><h4>Two sides</h4><div class="duo"><div class="side-good"><h5>Significance / for</h5>' +
      list(t.arguments_for) + '</div><div class="side-bad"><h5>Concerns / challenges</h5>' + list(t.concerns) + "</div></div></div>";
    if ((t.way_forward || []).length) h += '<div class="sec"><h4>Way forward</h4>' + list(t.way_forward, "steps", "ol") + "</div>";
    if ((t.prelims_facts || []).length) h += '<div class="sec"><h4>Prelims facts</h4>' + list(t.prelims_facts, "facts") + "</div>";
    if (t.mains_question) h += '<div class="sec"><h4>Mains practice</h4><div class="mains"><p class="q">' + esc(t.mains_question) +
      '</p><button class="toggle" data-reveal="Answer outline">Show answer outline</button><div class="reveal">' + list(t.answer_outline, "steps", "ol") + "</div></div></div>";
    if ((t.mcqs || []).length) h += '<div class="sec"><h4>Prelims practice</h4>' + t.mcqs.map(function (q) {
      return mcqHTML(noteMcq(t, q), { src: "notes", paper: (t.gs_papers || []).filter(function (g) { return g !== "Prelims"; })[0] || "Prelims" }); }).join("") + "</div>";
    h += '<div class="tfoot"><div class="kws">' + (t.keywords || []).map(function (k) { return '<span class="kw">' + esc(k) + "</span>"; }).join("") + "</div>" +
      actions("t:" + key(date, i), { kind: "topic", title: t.title, date: date, href: "#/d/" + date + "/" + (i + 1) }, key(date, i));
    if ((t.sources || []).length) h += '<div class="srcs">Read the originals: ' + t.sources.map(function (s) {
      return '<a href="' + esc(s.link) + '" target="_blank" rel="noopener">' + esc(s.source) + ": " + esc(s.title) + " ↗</a>"; }).join("") + "</div>";
    return h + "</div></article>";
  }
  function bindToggles(root) {
    root.querySelectorAll("[data-reveal]").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = b.nextElementSibling, open = o.classList.toggle("open");
        b.textContent = (open ? "Hide " : "Show ") + b.dataset.reveal.toLowerCase();
      });
    });
  }
  var observer;
  function spy() {
    if (observer) observer.disconnect();
    if (!("IntersectionObserver" in window)) return;
    var links = {}; rail.querySelectorAll("[data-spy]").forEach(function (a) { links[a.dataset.spy] = a; });
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && links[en.target.id]) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove("on"); });
          links[en.target.id].classList.add("on");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    main.querySelectorAll(".topic,#bites").forEach(function (el) { observer.observe(el); });
  }

  /* ================================================================ topic lists */
  function rowHTML(m, t, i, words) {
    var hl = function (s) { s = esc(s); (words || []).forEach(function (w) { s = s.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); }); return s; };
    return '<a class="row" href="#/d/' + m.date + "/" + (i + 1) + '"><div class="rd"><b>' + d8(m.date).getDate() + "</b>" + esc(fmt(m.date, { month: "short", year: "numeric" })) +
      "</div><div><h3>" + hl(t.title) + (U.revised[key(m.date, i)] ? ' <span style="color:var(--good)">✓</span>' : "") + "</h3><p>" + hl(t.why) + '</p><div class="gsl" style="margin-top:8px">' + (t.gs || []).map(badge).join("") + "</div></div></a>";
  }
  function renderPaper(p) {
    var info = PAPERS.filter(function (x) { return x[0] === p; })[0] || [p, p], rows = [];
    M.forEach(function (m) { m.topics.forEach(function (t, i) { if ((t.gs || []).indexOf(p) >= 0) rows.push(rowHTML(m, t, i)); }); });
    page('<div class="eyebrow">Daily notes by paper</div><h1>' + esc(p) + (info[1] !== p ? " · " + esc(info[1]) : "") + '</h1><div class="meta">' + rows.length +
      ' topics across all days · <a href="#/pyq?paper=' + p + '">' + esc(p) + " PYQs →</a></div><div style=\"margin-top:22px\">" + (rows.join("") || '<div class="empty">No topics yet.</div>') + "</div>");
    window.scrollTo(0, 0);
  }
  function renderPending() {
    var rows = [];
    M.forEach(function (m) { m.topics.forEach(function (t, i) { if (!U.revised[key(m.date, i)]) rows.push(rowHTML(m, t, i)); }); });
    page('<div class="eyebrow">Revision</div><h1>Not yet revised</h1><div class="meta">' + rows.length + ' topics left · newest first</div><div style="margin-top:22px">' +
      (rows.join("") || '<div class="empty">Everything is revised. Well done.</div>') + "</div>");
    window.scrollTo(0, 0);
  }

  /* ================================================================ PYQs */
  function qKind(q) { return q.exam === "Prelims" ? "Prelims" : /essay/.test(q.paper) ? "Essay" : "Mains"; }
  function paperLabel(q) { return q.exam === "Prelims" ? "Prelims GS I" : /essay/.test(q.paper) ? "Essay" : "Mains " + q.paper.split("-")[2].toUpperCase(); }
  function parseQuery(s) { var o = {}; (s || "").split("&").forEach(function (kv) { if (!kv) return; var p = kv.split("="); o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); }); return o; }
  function toQuery(o) { return Object.keys(o).filter(function (k) { return o[k] !== "" && o[k] != null; }).map(function (k) { return k + "=" + encodeURIComponent(o[k]); }).join("&"); }

  function renderPyq(kind, query) {
    page('<div class="empty">Loading previous year questions…</div>', true);
    loadPyq().then(function () {
      var f = parseQuery(query); kind = kind || f.kind || "";
      var all = PYQ.questions, counts = { Prelims: 0, Mains: 0, Essay: 0 };
      all.forEach(function (q) { counts[qKind(q)]++; });
      var h = '<div class="eyebrow">UPSC Civil Services · official papers 2016–2026</div><h1>Previous year questions</h1>' +
        '<div class="meta">' + all.length + " questions so far · Prelims answers are AI-worked (UPSC hasn't published keys online) · Mains outlines are AI-written</div>";
      h += '<div class="tabs">' + [["", "By topic"], ["prelims", "Prelims"], ["mains", "Mains"], ["essay", "Essay"]].map(function (t) {
        var n = t[0] ? counts[t[1]] : ""; return '<a class="tab' + (kind === t[0] ? " on" : "") + '" href="#/pyq' + (t[0] ? "/" + t[0] : "") + '">' + t[1] + (n !== "" ? '<span class="n">' + n + "</span>" : "") + "</a>";
      }).join("") + "</div>";
      if (!all.length) { page(h + '<div class="empty">The official papers are being processed a few at a time on the free AI tier. Questions appear here as each paper is done.</div>', true); return; }
      if (!kind && !f.topic && !f.paper && !f.q && !f.year && !f.saved) { page(h + topicGrid(all), true); return; }

      var K = kind ? kind[0].toUpperCase() + kind.slice(1) : "";
      var rows = all.filter(function (q) {
        if (K && qKind(q) !== K) return false;
        if (f.year && String(q.year) !== f.year) return false;
        if (f.topic && q.topic !== f.topic) return false;
        if (f.paper && !(f.paper === "Prelims" ? q.exam === "Prelims" : f.paper === "Essay" ? qKind(q) === "Essay" : q.exam === "Mains" && q.paper.split("-")[2] === f.paper.toLowerCase())) return false;
        if (f.saved && !U.saved["q:" + q.id] && !U.mynotes["q:" + q.id]) return false;
        if (f.q) { var hay = (q.q + " " + (q.options || []).join(" ") + " " + topicName(q.topic)).toLowerCase(); if (!f.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; })) return false; }
        return true;
      });
      var years = {}; all.forEach(function (q) { years[q.year] = 1; });
      var used = {}; all.forEach(function (q) { if (!K || qKind(q) === K) used[q.topic] = (used[q.topic] || 0) + 1; });
      h += '<div class="filters" id="pf"><select data-f="year"><option value="">All years</option>' + Object.keys(years).sort().reverse().map(function (y) { return "<option" + (f.year === y ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select>" +
        '<select data-f="topic"><option value="">All topics</option>' + SUBJECTS.map(function (s) {
          var ts = s.topics.filter(function (t) { return used[t.id]; }); if (!ts.length) return "";
          return '<optgroup label="' + esc(s.subject) + '">' + ts.map(function (t) { return '<option value="' + t.id + '"' + (f.topic === t.id ? " selected" : "") + ">" + esc(t.title) + " (" + used[t.id] + ")</option>"; }).join("") + "</optgroup>";
        }).join("") + "</select>" +
        (K === "Mains" || f.paper ? '<select data-f="paper"><option value="">All papers</option>' + ["GS1", "GS2", "GS3", "GS4"].map(function (p) { return "<option" + (f.paper === p ? " selected" : "") + ">" + p + "</option>"; }).join("") + "</select>" : "") +
        '<input type="search" data-f="q" placeholder="Search questions" value="' + esc(f.q || "") + '"><label><input type="checkbox" data-f="saved"' + (f.saved ? " checked" : "") + "> Saved only</label></div>";
      var title = f.topic ? topicName(f.topic) : "";
      h += '<div class="meta" style="margin-bottom:12px">' + rows.length + " question" + (rows.length === 1 ? "" : "s") + (title ? " · " + esc(title) : "") +
        (f.topic ? ' · <a href="#/subjects/' + f.topic + '">Read the notes →</a> · <a href="#/practice?src=pyq&topic=' + f.topic + '">Practise these →</a>' : "") + "</div>";
      h += '<div id="qlist"></div><div class="more" id="qmore"></div>';
      page(h, true);
      var shown = 0;
      function more() {
        var chunk = rows.slice(shown, shown + 20); shown += chunk.length;
        var box = document.createElement("div"); box.innerHTML = chunk.map(qCard).join("");
        $("qlist").appendChild(box); bindMcqs(box); bindToggles(box); bindActions(box);
        $("qmore").innerHTML = shown < rows.length ? '<button class="btn" id="qm">Show more (' + (rows.length - shown) + " left)</button>" : "";
        if ($("qm")) $("qm").onclick = more;
      }
      more();
      var pf = $("pf"), tmr;
      pf.addEventListener("change", apply); pf.addEventListener("input", function (e) { if (e.target.dataset.f === "q") { clearTimeout(tmr); tmr = setTimeout(apply, 350); } });
      function apply() {
        var o = {}; pf.querySelectorAll("[data-f]").forEach(function (el) { o[el.dataset.f] = el.type === "checkbox" ? (el.checked ? "1" : "") : el.value.trim(); });
        var qs = toQuery(o); history.replaceState(null, "", "#/pyq" + (kind ? "/" + kind : "") + (qs ? "?" + qs : "")); current = parse();
        renderPyq(kind, qs);
      }
      window.scrollTo(0, 0);
    }, function () { page('<div class="empty">Could not load the previous year questions.</div>', true); });
  }
  function topicGrid(all) {
    var by = {}; all.forEach(function (q) { by[q.topic] = by[q.topic] || { Prelims: 0, Mains: 0, Essay: 0 }; by[q.topic][qKind(q)]++; });
    return '<p style="color:var(--muted);margin:0 0 14px">Pick a syllabus topic to read every question UPSC has asked on it, newest first.</p><div class="subjects">' + SUBJECTS.map(function (s) {
      var ts = s.topics.filter(function (t) { return by[t.id]; }); if (!ts.length) return "";
      return '<div class="subj"><h3>' + esc(s.subject) + "</h3>" + ts.map(function (t) {
        var c = by[t.id], n = c.Prelims + c.Mains + c.Essay;
        return '<a href="#/pyq?topic=' + t.id + '" title="Prelims ' + c.Prelims + " · Mains " + c.Mains + (c.Essay ? " · Essay " + c.Essay : "") + '">' + esc(t.title) + "<span>" + n + "</span></a>";
      }).join("") + "</div>";
    }).join("") + "</div>";
  }
  function qCard(q) {
    var kind = qKind(q), sub = TOPIC[q.topic] ? TOPIC[q.topic].subject : "";
    var head = '<div class="qhead"><b>' + esc(paperLabel(q)) + " " + q.year + "</b><span>Q" + q.n + (q.section ? " · Section " + esc(q.section) : "") + "</span>" +
      (q.marks ? "<span>" + q.marks + " marks" + (q.words ? " · " + q.words + " words" : "") + "</span>" : "") +
      (q.topic ? '<a href="#/pyq?topic=' + q.topic + '">' + esc(topicName(q.topic)) + "</a>" : "") + "</div>";
    var body;
    if (kind === "Prelims") body = mcqHTML(q, { src: "pyq", paper: "Prelims", sub: sub, ai: true });
    else if (kind === "Essay") body = '<p class="qtext">' + esc(q.q) + "</p>" + ((q.approach || []).length ? '<button class="toggle" data-reveal="Approach">Show approach</button><div class="reveal">' + list(q.approach, "steps", "ol") + "</div>" : "");
    else body = '<p class="qtext">' + esc(q.q) + "</p>" + (q.outline ? '<button class="toggle" data-reveal="Answer outline">Show answer outline</button><div class="reveal outline"><h5>Introduction</h5><p>' + esc(q.outline.intro) +
      "</p><h5>Body</h5>" + list(q.outline.body, "steps", "ol") + "<h5>Conclusion</h5><p>" + esc(q.outline.conclusion) + "</p>" +
      ((q.outline.keywords || []).length ? '<div class="kws" style="margin-top:10px">' + q.outline.keywords.map(function (k) { return '<span class="kw">' + esc(k) + "</span>"; }).join("") + "</div>" : "") + "</div>"
      : '<div class="from">Answer outline coming soon.</div>');
    return '<div class="qcard">' + head + body + '<div class="tfoot" style="margin-top:12px;padding-top:12px">' +
      actions("q:" + q.id, { kind: "pyq", title: q.q.slice(0, 140), label: paperLabel(q) + " " + q.year + " · Q" + q.n, href: "#/pyq/" + kind.toLowerCase() + "?q=" + encodeURIComponent(q.q.split(/\s+/).slice(0, 6).join(" ")) + "&year=" + q.year }) + "</div></div>";
  }

  /* ================================================================ subjects */
  function pyqCountsBy() {
    var by = {}; (PYQ ? PYQ.questions : []).forEach(function (q) { by[q.topic] = by[q.topic] || { Prelims: 0, Mains: 0, Essay: 0, years: {} }; by[q.topic][qKind(q)]++; by[q.topic].years[q.year] = 1; });
    return by;
  }
  function renderSubjects() {
    page('<div class="empty">Loading subjects…</div>', true);
    Promise.all([loadPyq(), loadSubjects().catch(function () { return {}; })]).then(function () {
      var by = pyqCountsBy(), total = 0, studied = 0;
      SUBJECTS.forEach(function (s) { s.topics.forEach(function (t) { total++; if (U.revised["s:" + t.id]) studied++; }); });
      var h = '<div class="eyebrow">UPSC CSE syllabus</div><h1>Subjects</h1><div class="meta">' + Object.keys(SUBJ || {}).length + " of " + total +
        " topics have notes · " + studied + " marked studied · each topic links to every PYQ UPSC has asked on it</div>" +
        '<div class="progress"><span>' + pct(studied, total) + '% of the syllabus studied</span><div class="bar"><i style="width:' + pct(studied, total) + '%"></i></div></div><div class="subjects">' +
        SUBJECTS.map(function (s) {
          return '<div class="subj"><h3>' + esc(s.subject) + "</h3>" + s.topics.map(function (t) {
            var c = by[t.id], n = c ? c.Prelims + c.Mains + c.Essay : 0, has = SUBJ && SUBJ[t.id];
            return '<a href="#/subjects/' + t.id + '" title="' + esc(t.covers) + '">' + (U.revised["s:" + t.id] ? "✓ " : "") + esc(t.title) +
              "<span>" + (has ? "" : "notes soon · ") + n + " PYQ" + (n === 1 ? "" : "s") + "</span></a>";
          }).join("") + "</div>";
        }).join("") + "</div>";
      page(h, true);
    }, function () { page('<div class="empty">Could not load the syllabus.</div>', true); });
  }
  function renderSubject(id) {
    page('<div class="empty">Loading…</div>', false, true);
    Promise.all([loadPyq(), loadSubjects().catch(function () { return {}; })]).then(function () {
      var t = TOPIC[id]; if (!t) { page('<div class="empty">Unknown topic.</div>'); return; }
      var n = SUBJ && SUBJ[id], qs = PYQ.questions.filter(function (q) { return q.topic === id; }).sort(function (a, b) { return b.year - a.year; });
      var c = { Prelims: 0, Mains: 0, Essay: 0 }; qs.forEach(function (q) { c[qKind(q)]++; });
      var siblings = []; SUBJECTS.forEach(function (s) { if (s.subject === t.subject) siblings = s.topics; });
      var idx = siblings.findIndex(function (x) { return x.id === id; }), prev = siblings[idx - 1], next = siblings[idx + 1];
      var h = '<div class="eyebrow"><a href="#/subjects">Subjects</a> · ' + esc(t.subject) + "</div><h1>" + esc(t.title) + "</h1>" +
        '<div class="meta"><span class="gsl">' + t.papers.map(badge).join("") + "</span><span>" + qs.length + " PYQs (" + c.Prelims + " Prelims · " + c.Mains + " Mains" + (c.Essay ? " · " + c.Essay + " Essay" : "") + ")</span>" +
        '<div class="pager">' + (prev ? '<a class="btn" href="#/subjects/' + prev.id + '">← ' + esc(prev.title.split(/[,:&(]/)[0].trim()) + "</a>" : "") + (next ? '<a class="btn" href="#/subjects/' + next.id + '">' + esc(next.title.split(/[,:&(]/)[0].trim()) + " →</a>" : "") + "</div></div>";
      h += '<div class="tfoot" style="border:0;padding-top:6px;margin-top:10px">' + actions("s:" + id, { kind: "subject", title: t.title, label: t.subject, href: "#/subjects/" + id }, "s:" + id).replace(/Mark revised/g, "Mark studied").replace(/>Revised</g, ">Studied<") + "</div>";
      var toc = [];
      if (n) {
        h += '<article class="topic" style="margin-top:18px">';
        h += '<div class="sec prose" id="ov" style="margin-top:0"><h4>Overview</h4>' + n.overview.split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>"; toc.push(["ov", "Overview"]);
        n.sections.forEach(function (sec, i) { h += '<div class="sec" id="sx' + i + '"><h4>' + esc(sec.heading) + "</h4>" + list(sec.points) + "</div>"; toc.push(["sx" + i, sec.heading]); });
        h += '<div class="sec" id="kt"><h4>Key terms</h4><div class="concepts">' + n.key_terms.map(function (k) { return '<div class="concept"><b>' + esc(k.term) + "</b><span>" + esc(k.meaning) + "</span></div>"; }).join("") + "</div></div>"; toc.push(["kt", "Key terms"]);
        h += '<div class="sec" id="pf"><h4>Prelims facts</h4>' + list(n.prelims_facts, "facts") + "</div>"; toc.push(["pf", "Prelims facts"]);
        h += '<div class="sec" id="ma"><h4>How Mains asks it</h4>' + list(n.mains_angles, "steps", "ol") + "</div>"; toc.push(["ma", "Mains angles"]);
        h += '<div class="sec"><h4>Standard sources</h4>' + list(n.sources) + "</div></article>";
      } else h += '<section class="panel" style="margin-top:18px"><p style="margin:0;color:var(--muted)">Notes for this topic are being written and will appear here shortly. Its previous year questions are below.</p></section>';
      h += '<h2 class="sec-title" id="pq">Asked by UPSC<a href="#/pyq?topic=' + id + '">All ' + qs.length + " →</a></h2>"; toc.push(["pq", "Previous year questions"]);
      if (qs.length) {
        var years = {}; qs.forEach(function (q) { years[q.year] = (years[q.year] || 0) + 1; });
        h += '<div class="meta" style="margin-bottom:12px">' + Object.keys(years).sort().reverse().map(function (y) { return y + ": " + years[y]; }).join(" · ") +
          (c.Prelims ? ' · <a href="#/practice?src=pyq&topic=' + id + '">Practise the Prelims ones →</a>' : "") + '</div><div id="spq"></div>';
      } else h += '<p style="color:var(--muted)">No previous year questions tagged to this topic yet.</p>';
      if (n) h += '<p class="disclaimer">Notes written by Claude from general knowledge for revision. Check figures, dates and recent changes against NCERTs, standard books or official sources.</p>';
      page(h, false, true);
      rail.innerHTML = "<h6>On this page</h6>" + toc.map(function (x) { return '<a href="javascript:void 0" data-go="' + x[0] + '">' + esc(x[1]) + "</a>"; }).join("");
      rail.querySelectorAll("[data-go]").forEach(function (a) { a.addEventListener("click", function () { $(a.dataset.go).scrollIntoView({ behavior: "smooth" }); }); });
      bindActions(main);
      if (qs.length) { var box = $("spq"); box.innerHTML = qs.slice(0, 10).map(qCard).join(""); bindMcqs(box); bindToggles(box); bindActions(box); }
      window.scrollTo(0, 0);
    }, function () { page('<div class="empty">Could not load this topic.</div>'); });
  }

  /* ================================================================ practice */
  var practice = { src: store.get("psrc", "notes"), range: store.get("prange", 7), paper: store.get("ppaper", "all"), year: "", topic: "" };
  function renderPractice(query) {
    var f = parseQuery(query); if (f.src) practice.src = f.src; if (f.topic) practice.topic = f.topic;
    var seg = function (name, opts, val) {
      return '<div class="seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button data-v="' + o[0] + '"' + (String(o[0]) === String(val) ? ' class="on"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>";
    };
    var draw = function () {
      var h = '<div class="eyebrow">Practice</div><h1>Prelims MCQs</h1><div class="meta">Shuffled questions with instant answers. Your accuracy feeds the Home dashboard.</div>' +
        '<div class="setup">' + seg("src", [["notes", "From daily notes"], ["pyq", "Previous year Prelims"]], practice.src) + "</div><div class=\"setup\" style=\"margin-top:-12px\">";
      if (practice.src === "notes") h += seg("range", [[7, "Last 7 days"], [30, "Last 30 days"], [0, "All"]], practice.range) + seg("paper", [["all", "All papers"], ["GS1", "GS1"], ["GS2", "GS2"], ["GS3", "GS3"], ["Prelims", "Prelims"]], practice.paper);
      else {
        var years = {}, topics = {}; (PYQ ? PYQ.questions : []).forEach(function (q) { if (q.exam === "Prelims") { years[q.year] = 1; topics[q.topic] = (topics[q.topic] || 0) + 1; } });
        h += '<select data-sel="year"><option value="">All years</option>' + Object.keys(years).sort().reverse().map(function (y) { return "<option" + (practice.year === y ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select>" +
          '<select data-sel="topic"><option value="">All topics</option>' + SUBJECTS.map(function (s) {
            var ts = s.topics.filter(function (t) { return topics[t.id]; }); if (!ts.length) return "";
            return '<optgroup label="' + esc(s.subject) + '">' + ts.map(function (t) { return '<option value="' + t.id + '"' + (practice.topic === t.id ? " selected" : "") + ">" + esc(t.title) + " (" + topics[t.id] + ")</option>"; }).join("") + "</optgroup>";
          }).join("") + "</select>";
      }
      h += '<button class="go" id="go">Start</button></div><div id="quiz"></div>';
      page(h);
      main.querySelectorAll("[data-seg]").forEach(function (s) {
        s.addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          var k = s.dataset.seg, v = k === "range" ? +b.dataset.v : b.dataset.v;
          practice[k] = v; store.set({ src: "psrc", range: "prange", paper: "ppaper" }[k], v);
          if (k === "src") { if (v === "pyq") loadPyq().then(draw); else draw(); } else { s.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); }
        });
      });
      main.querySelectorAll("[data-sel]").forEach(function (el) { el.addEventListener("change", function () { practice[el.dataset.sel] = el.value; }); });
      $("go").addEventListener("click", startQuiz);
    };
    if (practice.src === "pyq") loadPyq().then(draw); else draw();
    window.scrollTo(0, 0);
  }
  function startQuiz() {
    var quiz = $("quiz"); quiz.innerHTML = '<div class="empty">Loading questions…</div>';
    var ready = practice.src === "pyq" ? loadPyq().then(function () {
      return PYQ.questions.filter(function (q) { return q.exam === "Prelims" && (!practice.year || String(q.year) === practice.year) && (!practice.topic || q.topic === practice.topic); })
        .map(function (q) { return { q: q, opts: { src: "pyq", paper: "Prelims", sub: TOPIC[q.topic] ? TOPIC[q.topic].subject : "", ai: true }, from: '<a href="#/pyq/prelims?year=' + q.year + "&q=" + encodeURIComponent(q.q.split(/\s+/).slice(0, 6).join(" ")) + '">Prelims ' + q.year + " · Q" + q.n + "</a> · " + esc(topicName(q.topic)) }; });
    }) : (function () {
      var days = practice.range ? M.slice(0, practice.range) : M;
      return loadAllDays(days.map(function (m) { return m.date; })).then(function () {
        var qs = [];
        days.forEach(function (m) {
          var d = DAYS[m.date]; if (!d) return;
          d.notes.forEach(function (t, i) {
            if (practice.paper !== "all" && (t.gs_papers || []).indexOf(practice.paper) < 0) return;
            var paper = (t.gs_papers || []).filter(function (g) { return g !== "Prelims"; })[0] || "Prelims";
            (t.mcqs || []).forEach(function (q) { qs.push({ q: noteMcq(t, q), opts: { src: "notes", paper: paper }, from: '<a href="#/d/' + m.date + "/" + (i + 1) + '">' + esc(t.title) + "</a> · " + esc(fmt(m.date, { day: "numeric", month: "short" })) }); });
          });
        });
        return qs;
      });
    })();
    ready.then(function (qs) {
      for (var i = qs.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = qs[i]; qs[i] = qs[j]; qs[j] = x; }
      var at = 0, right = 0, answered = 0, wrong = [];
      function score() { return "<span>Question <b>" + (at + 1) + "</b> of " + qs.length + "</span><span>Score <b>" + right + "</b> / " + answered + "</span>"; }
      function show() {
        if (!qs.length) { quiz.innerHTML = '<div class="empty">No questions in this selection yet.</div>'; return; }
        if (at >= qs.length) {
          quiz.innerHTML = '<section class="panel"><h2>Done: ' + right + " / " + answered + " correct (" + pct(right, answered) + "%)</h2>" +
            (wrong.length ? '<p style="margin:0 0 6px;color:var(--muted)">Revisit the ones you missed:</p><ul class="list">' + wrong.map(function (w) { return "<li>" + w + "</li>"; }).join("") + "</ul>" : "") +
            '<p style="margin:12px 0 0"><button class="go" id="again">Practise again</button></p></section>';
          $("again").addEventListener("click", startQuiz);
          return;
        }
        var it = qs[at];
        it.opts.extra = '<div class="from">From ' + it.from + "</div>";
        quiz.innerHTML = '<div class="score">' + score() + "</div>" + mcqHTML(it.q, it.opts) +
          '<div style="margin-top:14px;display:flex;gap:10px"><button class="go" id="next">Next →</button><button class="btn" id="stop">Finish</button></div>';
        bindMcqs(quiz, function (ok) { answered++; if (ok) right++; else wrong.push(it.from); quiz.querySelector(".score").innerHTML = score(); });
        $("next").addEventListener("click", function () { at++; show(); });
        $("stop").addEventListener("click", function () { at = qs.length; show(); });
      }
      show();
    });
  }

  /* ================================================================ flashcards */
  // Cards come from each topic's "Syllabus links" (term -> explanation). Leitner-style boxes:
  // each correct recall pushes the next review further out.
  var GAPS = [0, 1, 3, 7, 16, 35, 80];
  var NEW_PER_DAY = 20;
  function renderCards() {
    page('<div class="empty">Loading cards…</div>');
    Promise.all([loadAllDays(), loadSubjects().catch(function () { return {}; })]).then(function () {
      var deck = [];
      Object.keys(SUBJ || {}).forEach(function (tid) {
        (SUBJ[tid].key_terms || []).forEach(function (c, k) { deck.push({ id: "s:" + tid + "#" + k, front: c.term, back: c.meaning, from: SUBJ[tid].title, href: "#/subjects/" + tid }); });
      });
      M.forEach(function (m) {
        var d = DAYS[m.date]; if (!d) return;
        d.notes.forEach(function (t, i) {
          (t.static_concepts || []).forEach(function (c, k) { deck.push({ id: m.date + "#" + i + "#" + k, front: c.term, back: c.explanation, from: t.title, href: "#/d/" + m.date + "/" + (i + 1) }); });
        });
      });
      var now = Date.now(), tk = todayKey(), newToday = store.get("newcards", {})[tk] || 0;
      var due = deck.filter(function (c) { return U.cards[c.id] && U.cards[c.id].due <= now; });
      var fresh = deck.filter(function (c) { return !U.cards[c.id]; });
      var queue = due.concat(fresh.slice(0, Math.max(0, NEW_PER_DAY - newToday)));
      var h = '<div class="eyebrow">Revision</div><h1>Flashcards</h1><div class="meta">' + deck.length + " cards from subject key terms and your daily notes · " +
        due.length + " due · " + fresh.length + " new (up to " + NEW_PER_DAY + " a day)</div>";
      if (!queue.length) { page(h + '<div class="empty">All caught up. New cards arrive with each day\'s notes.</div>'); return; }
      page(h + '<div id="fc"></div>');
      var at = 0;
      function show() {
        if (at >= queue.length) { $("fc").innerHTML = '<section class="panel" style="margin-top:20px"><h2>Session done</h2><p style="margin:0;color:var(--muted)">' + queue.length + " cards reviewed. Come back tomorrow for the next ones.</p></section>"; renderNav(); return; }
        var c = queue[at], st = U.cards[c.id];
        $("fc").innerHTML = '<div class="score" style="margin-top:20px"><span>Card <b>' + (at + 1) + "</b> of " + queue.length + "</span><span>" + (st ? "Review" : "New") + "</span></div>" +
          '<div class="fcard" id="card"><div class="fface"><div class="ft">' + esc(c.front) + '</div><div class="fb" id="back" hidden>' + esc(c.back) + '</div><div class="fm" id="hint">Recall what it means, then tap to check</div></div></div>' +
          '<div class="fbtns" id="rate" hidden><button class="again" data-r="0">Again<small>soon</small></button><button data-r="1">Hard<small>tomorrow</small></button><button class="good" data-r="2">Good<small>' + GAPS[Math.min((st ? st.box : 0) + 1, GAPS.length - 1)] + 'd</small></button><button data-r="3">Easy<small>' + GAPS[Math.min((st ? st.box : 0) + 2, GAPS.length - 1)] + "d</small></button></div>" +
          '<div class="from">From <a href="' + c.href + '">' + esc(c.from) + "</a></div>";
        $("card").addEventListener("click", function () { $("back").hidden = false; $("rate").hidden = false; $("hint").textContent = "How well did you recall it?"; });
        $("rate").addEventListener("click", function (e) {
          var b = e.target.closest("[data-r]"); if (!b) return;
          var r = +b.dataset.r, box = st ? st.box : 0;
          if (!st) { var nc = store.get("newcards", {}); nc[tk] = (nc[tk] || 0) + 1; store.set("newcards", nc); }
          box = r === 0 ? 0 : r === 1 ? Math.max(1, box) : r === 2 ? box + 1 : box + 2;
          box = Math.min(box, GAPS.length - 1);
          U.cards[c.id] = { box: box, due: r === 0 ? Date.now() + 10 * 6e4 : Date.now() + GAPS[box] * DAY_MS, seen: Date.now() };
          persist("cards");
          if (r === 0) queue.push(c);
          at++; show();
        });
      }
      show();
    });
  }

  /* ================================================================ saved */
  function renderSaved(tab) {
    tab = tab || "all";
    var items = {};
    Object.keys(U.saved).forEach(function (k) { items[k] = Object.assign({ starred: true }, U.saved[k]); });
    Object.keys(U.mynotes).forEach(function (k) { items[k] = Object.assign(items[k] || {}, U.mynotes[k], { note: U.mynotes[k].text, starred: !!U.saved[k] }); });
    var keys = Object.keys(items).filter(function (k) { return tab === "all" || (tab === "notes" ? items[k].note : items[k].kind === tab); })
      .sort(function (a, b) { return (items[b].t || 0) - (items[a].t || 0); });
    var h = '<div class="eyebrow">Your library</div><h1>Saved &amp; my notes</h1><div class="meta">Stored in this browser. Use backup to move them to another device.</div>' +
      '<div class="tabs">' + [["all", "Everything"], ["topic", "Daily topics"], ["subject", "Subjects"], ["pyq", "PYQs"], ["notes", "With my notes"]].map(function (t) {
        return '<a class="tab' + (tab === t[0] ? " on" : "") + '" href="#/saved/' + t[0] + '">' + t[1] + "</a>"; }).join("") + "</div>";
    h += '<div id="savedlist">' + keys.map(function (k) {
      var it = items[k];
      return '<div class="row"><div class="rd">' + (it.kind === "topic" && it.date ? "<b>" + d8(it.date).getDate() + "</b>" + esc(fmt(it.date, { month: "short", year: "numeric" })) : "<b>" + (it.kind === "subject" ? "Subject" : "PYQ") + "</b>" + esc(it.label || "")) +
        '</div><div><h3><a href="' + esc(it.href) + '">' + esc(it.title) + "</a></h3>" + (it.note ? '<div class="mynote">' + esc(it.note) + "</div>" : "") +
        '</div><div class="acts">' + (it.starred ? '<button class="btn sm" data-unsave="' + esc(k) + '">Unsave</button>' : "") + (it.note ? '<button class="btn sm" data-delnote="' + esc(k) + '">Delete note</button>' : "") + "</div></div>";
    }).join("") + "</div>";
    if (!keys.length) h = h.replace('<div id="savedlist"></div>', '<div id="savedlist"><div class="empty">Nothing here yet. Use <b>Save</b> or <b>Add note</b> on any topic or question.</div></div>');
    h += '<section class="panel" style="margin-top:28px"><h2>Backup</h2><p style="margin:0 0 12px;color:var(--muted);font-size:14px">Your saved items, notes, revised marks, flashcard progress and practice history live in this browser only. Download a backup to keep them safe or to restore them on your phone or another computer.</p>' +
      '<button class="go" id="bk">Download backup</button> <label class="btn" style="margin-left:6px">Restore from backup<input type="file" id="rs" accept="application/json" hidden></label> <span id="rsmsg" style="font-size:13px;color:var(--muted);margin-left:8px"></span></section>';
    page(h);
    $("savedlist").addEventListener("click", function (e) {
      var u = e.target.closest("[data-unsave]"), d = e.target.closest("[data-delnote]");
      if (u) { delete U.saved[u.dataset.unsave]; persist("saved"); renderSaved(tab); renderNav(); }
      if (d && confirm("Delete this note?")) { delete U.mynotes[d.dataset.delnote]; persist("mynotes"); renderSaved(tab); renderNav(); }
    });
    $("bk").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify({ app: "current-affairs-notes", v: 1, at: new Date().toISOString(), data: U })], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "current-affairs-backup-" + todayKey() + ".json"; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $("rs").addEventListener("change", function () {
      var file = this.files[0]; if (!file) return;
      file.text().then(function (t) {
        var b = JSON.parse(t); if (!b || b.app !== "current-affairs-notes" || !b.data) throw new Error("not a backup");
        ["revised", "saved", "mynotes", "cards"].forEach(function (k) { U[k] = Object.assign({}, U[k], b.data[k] || {}); persist(k); });
        var seen = {}; U.attempts = U.attempts.concat(b.data.attempts || []).filter(function (a) { var k = a.t + a.s; if (seen[k]) return false; seen[k] = 1; return true; });
        persist("attempts");
        $("rsmsg").textContent = "Restored and merged."; renderNav();
      }).catch(function () { $("rsmsg").textContent = "That file isn't a backup from this app."; });
    });
    window.scrollTo(0, 0);
  }

  /* ================================================================ search */
  function renderSearch(q) {
    page('<div class="empty">Searching…</div>', true);
    Promise.all([loadPyq().catch(function () { return null; }), loadSubjects().catch(function () { return null; })]).then(function () {
      var words = q.toLowerCase().split(/\s+/).filter(Boolean), rows = [], bites = [];
      var match = function (s) { s = s.toLowerCase(); return words.every(function (w) { return s.indexOf(w) >= 0; }); };
      M.forEach(function (m) {
        m.topics.forEach(function (t, i) { if (match([t.title, t.why, t.syllabus, (t.keywords || []).join(" "), (t.gs || []).join(" ")].join(" "))) rows.push(rowHTML(m, t, i, words)); });
        (m.bites || []).forEach(function (b) { if (match(b)) bites.push("<li>" + esc(b) + ' <a href="#/d/' + m.date + '/bites">' + esc(fmt(m.date, { day: "numeric", month: "short" })) + "</a></li>"); });
      });
      var pq = PYQ ? PYQ.questions.filter(function (x) { return match(x.q + " " + (x.options || []).join(" ") + " " + topicName(x.topic)); }) : [];
      var subs = Object.keys(SUBJ || {}).filter(function (k) { var n = SUBJ[k]; return match([n.title, n.subject, n.overview, (n.key_terms || []).map(function (t) { return t.term; }).join(" "), (n.sections || []).map(function (x) { return x.heading + " " + x.points.join(" "); }).join(" ")].join(" ")); });
      var h = '<div class="eyebrow">Search</div><h1>“' + esc(q) + '”</h1><div class="meta">' + subs.length + " subject topics · " + rows.length + " daily topics · " + pq.length + " PYQs · " + bites.length + " quick bites</div>";
      if (subs.length) h += '<h2 class="sec-title">Subjects</h2>' + subs.map(function (k) {
        return '<a class="row" href="#/subjects/' + k + '"><div class="rd"><b>' + esc(SUBJ[k].subject.split(" ")[0]) + '</b></div><div><h3>' + esc(SUBJ[k].title) + "</h3><p>" + esc(SUBJ[k].overview.slice(0, 180)) + "…</p></div></a>"; }).join("");
      if (rows.length) h += '<h2 class="sec-title">Daily notes</h2>' + rows.join("");
      if (pq.length) h += '<h2 class="sec-title">Previous year questions<a href="#/pyq/' + qKind(pq[0]).toLowerCase() + "?q=" + encodeURIComponent(q) + '">Open in PYQs →</a></h2><div id="sq"></div>';
      if (bites.length) h += '<section class="panel" style="margin-top:22px"><h2>Quick bites</h2><ul class="bites">' + bites.join("") + "</ul></section>";
      if (!subs.length && !rows.length && !pq.length && !bites.length) h += '<div class="empty">Nothing found. Try fewer or different words.</div>';
      page(h, true);
      if (pq.length) { var box = $("sq"); box.innerHTML = pq.slice(0, 15).map(qCard).join(""); bindMcqs(box); bindToggles(box); bindActions(box); }
    });
  }

  /* ================================================================ routing */
  var current = {};
  function parse() {
    var raw = location.hash.replace(/^#\/?/, ""), qi = raw.indexOf("?"), query = qi >= 0 ? raw.slice(qi + 1) : "";
    var h = decodeURIComponent(qi >= 0 ? raw.slice(0, qi) : raw).split("/");
    if (h[0] === "d" && h[1]) return { name: "day", day: h[1], focus: h[2] };
    if (h[0] === "gs" && h[1]) return { name: "paper", paper: h[1] };
    if (h[0] === "search") return { name: "search", q: h.slice(1).join("/") };
    if (h[0] === "pyq") return { name: "pyq", kind: h[1] || "", query: query };
    if (h[0] === "subjects" && h[1]) return { name: "subject", id: h[1] };
    if (h[0] === "subjects") return { name: "subjects" };
    if (h[0] === "practice") return { name: "practice", query: query };
    if (h[0] === "cards") return { name: "cards" };
    if (h[0] === "saved") return { name: "saved", tab: h[1] };
    if (h[0] === "pending") return { name: "pending" };
    return { name: "home" };
  }
  function route() {
    if (!booted) return;
    var r = parse(), prev = current; current = r; onRevised = null;
    document.body.classList.remove("menu");
    renderNav();
    if (r.name === "day") {
      if (prev.name === "day" && prev.day === r.day && main.querySelector(".topic")) {
        var el = $(r.focus === "bites" ? "bites" : "t" + r.focus); if (el) el.scrollIntoView({ behavior: "smooth" }); else window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      renderDay(r.day, r.focus);
    } else if (r.name === "paper") renderPaper(r.paper);
    else if (r.name === "search") { if ($("q").value !== r.q) $("q").value = r.q; renderSearch(r.q); }
    else if (r.name === "pyq") renderPyq(r.kind, r.query);
    else if (r.name === "subjects") renderSubjects();
    else if (r.name === "subject") renderSubject(r.id);
    else if (r.name === "practice") renderPractice(r.query);
    else if (r.name === "cards") renderCards();
    else if (r.name === "saved") renderSaved(r.tab);
    else if (r.name === "pending") renderPending();
    else renderHome();
  }
  window.addEventListener("hashchange", route);

  var lit = null, TILT = "none";  // tilt switched off: calmer
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var el = e.target.closest && e.target.closest(".tcard,.tile,.qcard,.subj,.row");
    if (lit && lit !== el) { lit.style.removeProperty("--rx"); lit.style.removeProperty("--ry"); }
    lit = el; if (!el) return;
    var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", x * 100 + "%"); el.style.setProperty("--my", y * 100 + "%");
    if (el.matches(TILT)) { el.style.setProperty("--rx", ((0.5 - y) * 5).toFixed(2) + "deg"); el.style.setProperty("--ry", ((x - 0.5) * 6).toFixed(2) + "deg"); }
  });
  window.addEventListener("scroll", function () {
    var bar = $("readbar"), long = main.querySelector(".topic");
    if (!long) { bar.style.width = "0"; return; }
    var max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? 100 * scrollY / max : 0) + "%";
  }, { passive: true });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  var tmr;
  $("q").addEventListener("input", function () {
    clearTimeout(tmr); var v = this.value.trim();
    tmr = setTimeout(function () { location.hash = v ? "#/search/" + encodeURIComponent(v) : "#/"; }, 300);
  });
  document.addEventListener("keydown", function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); $("q").focus(); return; }
    if (e.key === "Escape" && typing) { document.activeElement.blur(); return; }
    if (typing || current.name !== "day" || e.metaKey || e.ctrlKey) return;
    var idx = M.findIndex(function (m) { return m.date === current.day; });
    if (e.key === "ArrowLeft" && M[idx + 1]) location.hash = "#/d/" + M[idx + 1].date;
    if (e.key === "ArrowRight" && idx > 0) location.hash = "#/d/" + M[idx - 1].date;
  });
  $("menubtn").addEventListener("click", function () { document.body.classList.add("menu"); });
  $("scrim").addEventListener("click", function () { document.body.classList.remove("menu"); });

  var themes = ["dark", "light"], theme = store.get("theme", "dark"); if (themes.indexOf(theme) < 0) theme = "dark";
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme);
    $("theme").textContent = theme[0].toUpperCase() + theme.slice(1) + " theme";
  }
  $("theme").addEventListener("click", function () { theme = themes[(themes.indexOf(theme) + 1) % themes.length]; store.set("theme", theme); applyTheme(); });
  applyTheme();

  /* ================================================================ password lock (site) + boot */
  function deriveKey(pw, meta) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(meta.salt), iterations: meta.iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    });
  }
  // A wrong key fails AES-GCM's integrity check, so decrypting the manifest doubles as the password check.
  function tryKey(key) { return decryptWith(key, "data/manifest.enc").then(function (man) { KEY = key; return man; }); }
  function unlockSite() {
    var lock = $("lock"), form = $("lockform"), err = $("lockerr");
    lock.hidden = false;
    fetch("data/meta.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (meta) {
      META = meta;
      var saved = store.get("key", null);
      var askPassword = function () {
        $("pw").focus();
        form.onsubmit = function (e) {
          e.preventDefault(); err.textContent = ""; $("unlock").disabled = true; $("unlock").textContent = "Unlocking…";
          deriveKey($("pw").value, meta).then(function (key) {
            return tryKey(key).then(function (man) {
              if ($("remember").checked) crypto.subtle.exportKey("raw", key).then(function (raw) { store.set("key", { salt: meta.salt, k: tob64(raw) }); });
              lock.hidden = true; boot(man);
            });
          }).catch(function () { err.textContent = "That password didn't work."; $("unlock").disabled = false; $("unlock").textContent = "Unlock"; $("pw").select(); });
        };
      };
      if (saved && saved.salt === meta.salt) {
        crypto.subtle.importKey("raw", unb64(saved.k), "AES-GCM", true, ["decrypt"]).then(tryKey)
          .then(function (man) { lock.hidden = true; boot(man); }, function () { store.set("key", null); askPassword(); });
      } else askPassword();
    }).catch(function () { err.textContent = "Couldn't reach the notes. Check your connection and reload."; });
  }
  function boot(manifest) {
    M = (manifest || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    booted = true;
    loadPyq().catch(function () {});  // warm up: topic names for search and dashboard
    route();
  }
  if (SITE) {
    $("lockbtn").hidden = false;
    $("lockbtn").addEventListener("click", function () { store.set("key", null); location.reload(); });
    unlockSite();
  } else boot(window.NOTES_MANIFEST);
})();
