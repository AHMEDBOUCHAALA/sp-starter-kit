/*
 * Moteur d'alignement de récitation.
 *
 * Il reçoit les mots reconnus un par un (micro ou clavier) et les compare
 * au texte attendu, à partir d'un curseur. Chaque mot attendu finit dans
 * un des états suivants :
 *   correct  - récité correctement
 *   error    - un autre mot a été dit à sa place (substitution)
 *   skipped  - sauté (l'utilisateur a enchaîné sur un mot plus loin)
 *   hint     - révélé par un indice
 *
 * Fichier sans dépendance, utilisable dans le navigateur ou dans Node.
 */
(function (root) {
  'use strict';

  // Diacritiques arabes (harakat, tanwin, shadda, sukun, alif suscrit, tatweel)
  const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

  function normalize(word) {
    return String(word)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // accents latins
      .replace(ARABIC_MARKS, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/لا/g, 'ال') // ligature lam-alif souvent inversée dans les PDF
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/[^\p{L}\p{N}]/gu, ''); // ponctuation, apostrophes, tirets
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const STRICTNESS = {
    tolerant: { ratio: 0.6, shortMaxDist: 1 },
    normal: { ratio: 0.75, shortMaxDist: 1 },
    strict: { ratio: 1, shortMaxDist: 0 },
  };

  function similar(spoken, expected, strictness) {
    if (!spoken || !expected) return false;
    if (spoken === expected) return true;
    const cfg = STRICTNESS[strictness] || STRICTNESS.normal;
    const d = levenshtein(spoken, expected);
    const len = Math.max(spoken.length, expected.length);
    if (len <= 3) return d <= cfg.shortMaxDist && cfg.ratio < 1 && len > 1;
    return 1 - d / len >= cfg.ratio;
  }

  const LOOKAHEAD = 4; // nombre de mots qu'on accepte de "sauter"
  const MAX_PENDING = 2; // mots non reconnus avant de déclarer une faute
  const LOOKBEHIND = 80; // jusqu'où on reconnaît un retour en arrière (en mots)

  class RecitationEngine {
    /**
     * @param {string[]} words  mots attendus (forme affichée)
     * @param {object}   opts   { strictness, onChange(index, state), onMistake(index, kind, spoken),
     *                            onReplay(index) : mot redit lors d'un retour en arrière }
     */
    constructor(words, opts = {}) {
      this.words = words;
      this.norm = words.map(normalize);
      this.states = words.map((w, i) => (this.norm[i] ? 'todo' : 'punct'));
      this.strictness = opts.strictness || 'normal';
      this.onChange = opts.onChange || (() => {});
      this.onMistake = opts.onMistake || (() => {});
      this.onReplay = opts.onReplay || (() => {});
      this.replay = []; // positions possibles du prochain mot pendant un retour en arrière
      this.backtracks = 0;
      this.pending = [];
      this.cursor = 0;
      this.end = words.length;
      this.history = [];
      this._skipPunct();
    }

    setRange(start, end) {
      this.end = Math.min(end ?? this.words.length, this.words.length);
      for (let i = 0; i < this.words.length; i++) {
        const outside = i < start || i >= this.end;
        const s = this.norm[i] ? (outside ? 'context' : 'todo') : 'punct';
        this._set(i, s);
      }
      this.cursor = start;
      this.pending = [];
      this.history = [];
      this.replay = [];
      this.backtracks = 0;
      this._skipPunct();
    }

    get done() {
      return this.cursor >= this.end;
    }

    stats() {
      const c = { correct: 0, error: 0, skipped: 0, hint: 0, total: 0 };
      for (let i = 0; i < this.words.length; i++) {
        const s = this.states[i];
        if (s === 'punct' || s === 'context') continue;
        c.total++;
        if (c[s] !== undefined) c[s]++;
      }
      const done = c.correct + c.error + c.skipped + c.hint;
      c.accuracy = done ? Math.round((c.correct / done) * 100) : null;
      c.progress = c.total ? Math.round((done / c.total) * 100) : 0;
      c.backtracks = this.backtracks;
      return c;
    }

    /** Traite un mot reconnu. Retourne true si le curseur a avancé. */
    feed(rawWord) {
      if (this.done) return false;
      const w = normalize(rawWord);
      if (!w) return false;
      const i = this.cursor;

      // 1. Le mot reconnu, éventuellement collé aux mots en attente,
      //    correspond au mot attendu (ex. "quatre" + "vingt" = "quatrevingt").
      const joined = this.pending.map((p) => p.norm).join('') + w;
      if (this.pending.length && similar(joined, this.norm[i], this.strictness)) {
        this.pending = [];
        this._mark(i, 'correct');
        return true;
      }

      // 2. Correspondance exacte au curseur.
      if (similar(w, this.norm[i], this.strictness)) {
        this.pending = []; // les mots en trop sont ignorés
        this._mark(i, 'correct');
        return true;
      }

      // 3. Le mot reconnu regroupe deux mots attendus (ex. "aujourdhui").
      const j2 = this._nextWord(i);
      if (j2 < this.end && w === this.norm[i] + this.norm[j2]) {
        this.pending = [];
        this._mark(i, 'correct');
        this._mark(j2, 'correct');
        return true;
      }

      // 4a. Retour en arrière en cours : le mot continue-t-il le passage redit ?
      let staleReplay = [];
      if (this.replay.length) {
        const matches = this.replay.filter((c) => c < i && similar(w, this.norm[c], this.strictness));
        if (matches.length) {
          if (this.pending.length) this.backtracks++; // 2e mot : le retour est confirmé
          this.pending = [];
          this.replay = matches.map((c) => this._nextWord(c));
          this.replayMiss = false;
          this.onReplay(matches[matches.length - 1]);
          return false;
        }
        staleReplay = this.replay;
        this.replay = [];
      }

      // 4. Le mot correspond à un mot plus loin : on a sauté ou remplacé des mots.
      let j = i;
      for (let step = 1; step <= LOOKAHEAD; step++) {
        j = this._nextWord(j);
        if (j >= this.end) break;
        // Un mot court ("de", "la") ne suffit pas pour sauter plusieurs mots.
        if (step > 1 && this.norm[j].length < 4) continue;
        if (similar(w, this.norm[j], this.strictness)) {
          const kind = this.pending.length ? 'error' : 'skipped';
          const heard = this.pending.map((p) => p.raw).join(' ');
          for (let k = i; k < j; k++) {
            if (!this.norm[k]) continue;
            this._mark(k, kind);
            this.onMistake(k, kind, heard);
          }
          this.pending = [];
          this._mark(j, 'correct');
          return true;
        }
      }

      // 4b. Le mot correspond à un passage déjà récité : peut-être un retour en
      //     arrière pour se remémorer la suite. Tant qu'il n'est pas confirmé par
      //     le mot suivant, il reste "en attente" comme un mot inconnu.
      // Un seul mot mal compris par le micro pendant un retour est toléré.
      if (staleReplay.length && !this.replayMiss) {
        this.replayMiss = true;
        this.replay = staleReplay.map((c) => this._nextWord(c)).filter((c) => c <= i);
        this.pending.push({ raw: rawWord, norm: w });
        return false;
      }

      const behind = [];
      for (let k = i - 1; k >= Math.max(0, i - LOOKBEHIND); k--) {
        if (this.norm[k] && similar(w, this.norm[k], this.strictness)) behind.push(k);
      }
      if (behind.length) {
        this.replay = behind.map((k) => this._nextWord(k));
        this.replayMiss = false;
        this.pending.push({ raw: rawWord, norm: w });
        this.onReplay(behind[0]);
        return false;
      }

      // 5. Pas de correspondance : on attend un peu avant de trancher,
      //    car ce peut être un mot parasite ("euh") ou une erreur du micro.
      this.pending.push({ raw: rawWord, norm: w });
      if (this.pending.length >= MAX_PENDING) {
        const heard = this.pending.map((p) => p.raw).join(' ');
        this.pending = [];
        this._mark(i, 'error');
        this.onMistake(i, 'error', heard);
        return true;
      }
      return false;
    }

    feedText(text) {
      for (const t of String(text).split(/\s+/)) if (t) this.feed(t);
    }

    /** Révèle le mot suivant (indice). */
    hint() {
      if (this.done) return;
      this.pending = [];
      this.replay = [];
      this._mark(this.cursor, 'hint');
    }

    /** Annule le dernier mot validé. */
    undo() {
      const last = this.history.pop();
      if (last === undefined) return;
      for (let k = last; k < this.cursor; k++) {
        if (this.norm[k]) this._set(k, 'todo');
      }
      this.cursor = last;
      this.pending = [];
      this.replay = [];
    }

    _nextWord(i) {
      let j = i + 1;
      while (j < this.end && !this.norm[j]) j++;
      return j;
    }

    _mark(i, state) {
      this.replay = [];
      this.history.push(this.cursor);
      this._set(i, state);
      this.cursor = Math.max(this.cursor, i + 1);
      this._skipPunct();
    }

    _skipPunct() {
      while (this.cursor < this.end && !this.norm[this.cursor]) this.cursor++;
    }

    _set(i, state) {
      if (this.states[i] === state) return;
      this.states[i] = state;
      this.onChange(i, state);
    }
  }

  const api = { RecitationEngine, normalize, levenshtein, similar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Recitation = api;
})(typeof self !== 'undefined' ? self : this);
