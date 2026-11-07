/* Interface : import, bibliothèque, récitation au micro. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const { RecitationEngine } = window.Recitation;

  // ---------- Stockage local (tolérant aux navigateurs qui le bloquent) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* quota plein ou stockage bloqué : on continue sans sauvegarde */
      }
    },
  };

  let docs = store.get('hifz.docs', []);
  let currentDoc = null;
  let engine = null;
  let spans = [];

  function saveDocs() {
    store.set('hifz.docs', docs);
  }

  function showView(id) {
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== id));
  }

  const isArabic = (t) => (t.match(/[؀-ۿ]/g) || []).length > t.length * 0.3;

  // ---------- Étape 1 : import ----------
  $$('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab));
    })
  );

  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach((e) =>
    drop.addEventListener(e, (ev) => {
      ev.preventDefault();
      drop.classList.add('over');
    })
  );
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const f = ev.dataTransfer.files[0];
    if (f) importPdf(f);
  });
  $('#file-pdf').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (f) importPdf(f);
  });

  let pendingPdf = null;

  async function importPdf(file) {
    const status = $('#pdf-status');
    status.className = 'status';
    status.textContent = 'Lecture du PDF...';
    try {
      const pages = await window.PdfText.extractPdf(file, (n, total) => {
        status.textContent = `Lecture du PDF... page ${n} / ${total}`;
      });
      pendingPdf = { title: file.name.replace(/\.pdf$/i, ''), pages };
      status.textContent = '';
      renderPageList();
      showView('view-pages');
    } catch (err) {
      status.className = 'status bad';
      status.textContent = 'Impossible de lire ce PDF : ' + err.message;
    }
  }

  function renderPageList() {
    const list = $('#page-list');
    list.innerHTML = '';
    const garbledCount = pendingPdf.pages.filter((p) => p.garbled).length;
    if (garbledCount) {
      const warn = document.createElement('p');
      warn.className = 'status bad';
      warn.textContent =
        `${garbledCount} page(s) sur ${pendingPdf.pages.length} ont un texte illisible pour la machine ` +
        `(le PDF dessine les lettres au lieu de les écrire). Elles sont décochées. ` +
        `Colle la bonne version du texte dans leur cadre, ou utilise l'onglet "Coller un texte".`;
      list.appendChild(warn);
    }
    for (const p of pendingPdf.pages) {
      const row = document.createElement('details');
      row.className = 'page-row';
      if (p.garbled) row.open = false;
      const badge = p.empty
        ? '<span class="badge">vide</span>'
        : p.garbled
          ? '<span class="badge bad">illisible</span>'
          : '<span class="badge ok">ok</span>';
      const preview = p.text.slice(0, 90).replace(/\n/g, ' ');
      row.innerHTML = `
        <summary>
          <input type="checkbox" ${p.garbled || p.empty ? '' : 'checked'} data-page="${p.number}">
          <b>Page ${p.number}</b> ${badge}
          <span class="preview" dir="auto"></span>
        </summary>
        <textarea rows="6" dir="auto" data-page="${p.number}"></textarea>`;
      row.querySelector('.preview').textContent = preview;
      const ta = row.querySelector('textarea');
      ta.value = p.text;
      ta.addEventListener('input', () => {
        p.text = ta.value;
        p.garbled = false;
        row.querySelector('input').checked = true;
      });
      row.querySelector('input').addEventListener('click', (e) => e.stopPropagation());
      list.appendChild(row);
    }
  }

  $('#btn-pages-back').addEventListener('click', () => showView('view-import'));
  $('#btn-pages-ok').addEventListener('click', () => {
    const checked = new Set($$('#page-list input:checked').map((i) => +i.dataset.page));
    const text = pendingPdf.pages
      .filter((p) => checked.has(p.number))
      .map((p) => p.text)
      .join('\n\n');
    if (!text.trim()) return alert('Aucune page sélectionnée.');
    openDoc(addDoc(pendingPdf.title, text));
  });

  $('#btn-paste').addEventListener('click', () => {
    const text = $('#paste-text').value.trim();
    if (!text) return;
    const title = $('#paste-title').value.trim() || text.split('\n')[0].slice(0, 40);
    openDoc(addDoc(title, text));
  });

  function addDoc(title, text) {
    const doc = {
      id: Date.now().toString(36),
      title,
      text,
      lang: isArabic(text) ? 'ar-SA' : 'fr-FR',
      yt: '',
      start: 0,
    };
    docs.unshift(doc);
    saveDocs();
    return doc;
  }

  // ---------- Bibliothèque ----------
  const library = $('#library');
  function renderLibrary() {
    const ul = $('#library-list');
    ul.innerHTML = '';
    if (!docs.length) ul.innerHTML = '<li class="hint">Aucun texte pour le moment.</li>';
    for (const d of docs) {
      const li = document.createElement('li');
      li.innerHTML = `<button class="link"></button><small></small><button class="ghost small" title="Supprimer">Suppr.</button>`;
      li.querySelector('.link').textContent = d.title;
      li.querySelector('small').textContent = d.best != null ? `meilleur score ${d.best} %` : '';
      li.querySelector('.link').addEventListener('click', () => {
        library.close();
        openDoc(d);
      });
      li.querySelector('.small').addEventListener('click', () => {
        if (!confirm(`Supprimer "${d.title}" ?`)) return;
        docs = docs.filter((x) => x !== d);
        saveDocs();
        renderLibrary();
      });
      ul.appendChild(li);
    }
  }
  $('#btn-library').addEventListener('click', () => {
    renderLibrary();
    library.showModal();
  });
  $('#btn-library-close').addEventListener('click', () => library.close());
  $('#btn-new').addEventListener('click', () => {
    library.close();
    stopMic();
    showView('view-import');
  });

  // ---------- Étape 3 : récitation ----------
  function openDoc(doc) {
    currentDoc = doc;
    $('#doc-title').textContent = doc.title;
    $('#lang').value = doc.lang;
    $('#yt-url').value = doc.yt || '';
    if (doc.yt) showYoutube(doc.yt);
    else $('#yt-box').classList.add('hidden');
    renderText();
    showView('view-recite');
  }

  /** Découpe le texte en mots en gardant les retours à la ligne. */
  function tokenize(text) {
    const tokens = [];
    const paragraphs = text.split(/\n\s*\n/);
    paragraphs.forEach((para, pi) => {
      para.split('\n').forEach((line, li) => {
        line.split(/\s+/).filter(Boolean).forEach((w) => tokens.push({ w, br: null }));
        if (tokens.length) tokens[tokens.length - 1].br = li < para.split('\n').length - 1 ? 'line' : null;
      });
      if (tokens.length && pi < paragraphs.length - 1) tokens[tokens.length - 1].br = 'para';
    });
    return tokens;
  }

  function renderText() {
    const tokens = tokenize(currentDoc.text);
    const el = $('#text');
    el.innerHTML = '';
    el.dir = isArabic(currentDoc.text) ? 'rtl' : 'ltr';
    el.classList.toggle('arabic', el.dir === 'rtl');
    let para = document.createElement('p');
    el.appendChild(para);
    spans = tokens.map((t, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = t.w;
      s.dataset.i = i;
      para.appendChild(s);
      para.appendChild(document.createTextNode(' '));
      if (t.br === 'line') para.appendChild(document.createElement('br'));
      if (t.br === 'para') {
        para = document.createElement('p');
        el.appendChild(para);
      }
      return s;
    });

    engine = new RecitationEngine(
      tokens.map((t) => t.w),
      {
        strictness: $('#strictness').value,
        onChange: (i, state) => {
          spans[i].className = 'w ' + state;
        },
        onMistake: (i) => {
          spans[i].classList.add('shake');
          if ($('#sound').checked) beep();
        },
      }
    );
    engine.states.forEach((s, i) => (spans[i].className = 'w ' + s));
    engine.setRange(Math.min(currentDoc.start || 0, tokens.length), tokens.length);
    applyMode();
    refresh();
  }

  $('#text').addEventListener('click', (e) => {
    const s = e.target.closest('.w');
    if (!s || !engine) return;
    currentDoc.start = +s.dataset.i;
    saveDocs();
    engine.setRange(currentDoc.start, spans.length);
    refresh();
  });

  function refresh() {
    spans.forEach((s) => s.classList.remove('cur'));
    if (!engine.done) {
      const cur = spans[engine.cursor];
      cur.classList.add('cur');
      const r = cur.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 160) {
        cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    const st = engine.stats();
    $('#st-correct').textContent = st.correct;
    $('#st-error').textContent = st.error;
    $('#st-skipped').textContent = st.skipped;
    $('#st-hint').textContent = st.hint;
    $('#st-accuracy').textContent = st.accuracy == null ? '-' : st.accuracy + ' %';
    $('#progress-bar').style.width = st.progress + '%';
    if (engine.done && st.total) finish(st);
  }

  function finish(st) {
    stopMic();
    if (currentDoc.best == null || st.accuracy > currentDoc.best) {
      currentDoc.best = st.accuracy;
      saveDocs();
    }
    $('#heard').innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'done';
    msg.textContent = `Terminé ! ${st.accuracy} % de mots justes, ${st.error} faute(s), ${st.skipped} oubli(s), ${st.hint} indice(s).`;
    $('#heard').appendChild(msg);
  }

  function applyMode() {
    $('#text').classList.toggle('memorize', $('#mode').value === 'memorize');
  }
  $('#mode').addEventListener('change', applyMode);
  $('#strictness').addEventListener('change', () => engine && (engine.strictness = $('#strictness').value));
  $('#lang').addEventListener('change', () => {
    currentDoc.lang = $('#lang').value;
    saveDocs();
    if (listening) {
      stopMic();
      startMic();
    }
  });

  $('#btn-hint').addEventListener('click', () => {
    engine.hint();
    refresh();
  });
  $('#btn-undo').addEventListener('click', () => {
    engine.undo();
    refresh();
  });
  $('#btn-restart').addEventListener('click', () => {
    engine.setRange(currentDoc.start || 0, spans.length);
    $('#heard').textContent = '';
    refresh();
  });
  const peekOn = (e) => {
    e.preventDefault();
    $('#text').classList.add('peek');
  };
  const peekOff = () => $('#text').classList.remove('peek');
  $('#btn-peek').addEventListener('pointerdown', peekOn);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => $('#btn-peek').addEventListener(e, peekOff));

  // Saisie clavier : même moteur, utile sans micro ou pour tester
  $('#type-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const v = e.target.value.trim();
    if (!v) return;
    e.preventDefault();
    engine.feedText(v);
    e.target.value = '';
    refresh();
  });

  // ---------- Micro (Web Speech API) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null;
  let listening = false;
  let consumed = {}; // nombre de mots déjà traités par résultat

  if (!SR) {
    $('#unsupported').classList.remove('hidden');
    $('#btn-mic').disabled = true;
  }

  function startMic() {
    if (!SR || engine.done) return;
    recog = new SR();
    recog.lang = $('#lang').value;
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    consumed = {};
    recog.onresult = onResult;
    recog.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        $('#heard').textContent = "Accès au micro refusé. Autorise-le dans la barre d'adresse.";
        stopMic();
      }
    };
    // Chrome coupe l'écoute après un silence : on relance tant que l'utilisateur n'a pas arrêté.
    recog.onend = () => {
      if (listening) {
        consumed = {};
        try {
          recog.start();
        } catch {
          /* déjà démarré */
        }
      }
    };
    try {
      recog.start();
    } catch {
      return;
    }
    listening = true;
    $('#btn-mic').classList.add('on');
    $('#btn-mic').setAttribute('aria-pressed', 'true');
    $('#mic-label').textContent = 'Stop';
  }

  function stopMic() {
    listening = false;
    if (recog) recog.stop();
    $('#btn-mic').classList.remove('on');
    $('#btn-mic').setAttribute('aria-pressed', 'false');
    $('#mic-label').textContent = 'Réciter';
  }

  function onResult(ev) {
    let display = '';
    for (let r = ev.resultIndex; r < ev.results.length; r++) {
      const res = ev.results[r];
      const words = res[0].transcript.trim().split(/\s+/).filter(Boolean);
      display += res[0].transcript + ' ';
      // Le dernier mot d'un résultat provisoire peut encore changer : on l'attend.
      const usable = res.isFinal ? words.length : Math.max(0, words.length - 1);
      const from = consumed[r] || 0;
      for (let k = from; k < usable; k++) engine.feed(words[k]);
      consumed[r] = Math.max(from, usable);
    }
    $('#heard').textContent = display.trim();
    refresh();
  }

  $('#btn-mic').addEventListener('click', () => (listening ? stopMic() : startMic()));

  // ---------- Son de faute ----------
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new AudioContext();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 220;
      g.gain.setValueAtTime(0.15, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.25);
    } catch {
      /* audio indisponible */
    }
  }

  // ---------- YouTube ----------
  function youtubeId(url) {
    const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function showYoutube(url) {
    const id = youtubeId(url);
    const box = $('#yt-box');
    if (!id) {
      box.classList.add('hidden');
      return false;
    }
    box.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}`;
    iframe.title = 'Vidéo YouTube';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    box.appendChild(iframe);
    box.classList.remove('hidden');
    return true;
  }
  $('#btn-yt').addEventListener('click', () => {
    const url = $('#yt-url').value.trim();
    if (!showYoutube(url)) return alert('Lien YouTube non reconnu.');
    currentDoc.yt = url;
    saveDocs();
  });

  // ---------- Démarrage ----------
  if (docs.length) openDoc(docs[0]);
  else showView('view-import');

  // Accès pour les tests automatisés
  window.__hifz = { get engine() { return engine; }, importPdf };
})();
