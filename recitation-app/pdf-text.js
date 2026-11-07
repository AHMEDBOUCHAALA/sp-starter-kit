/*
 * Extraction et nettoyage du texte d'un PDF (pdf.js), page par page.
 * Détecte aussi les pages dont le texte est illisible pour la machine
 * (glyphes éclatés, voyelles séparées des lettres, caractères inconnus).
 */
(function (root) {
  'use strict';

  const LETTER = /\p{L}/u;
  const ARABIC = /[؀-ۿ]/;
  const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ̀-ͯ]/g;

  /** Corrige les défauts classiques des PDF arabes mis en page avec InDesign. */
  function fixArabic(text) {
    if (!ARABIC.test(text)) return text;
    return text
      .replace(/﷽/g, 'بسم الله الرحمن الرحيم')
      .replace(/هللا/g, 'الله')
      // Le "r" final colle souvent au mot suivant : "الإصدارالثالث"
      .replace(/(\p{L}{2,}ر)(ا[إأآ]?ل\p{L}{2,})/gu, '$1 $2')
      // Ligatures lam-alif / lam-mim restituées à l'envers en début de mot
      .replace(/(^|[\s(«"'])ا([إأآ])ل/gu, '$1ال$2')
      .replace(/(^|[\s(«"'])امل/gu, '$1الم')
      .replace(/[‪-‮‎‏]/g, '');
  }

  /** Score entre 0 (propre) et 1 (illisible). */
  function garbleScore(text) {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (!tokens.length) return 0;
    let bad = 0;
    for (const t of tokens) {
      const bare = t.replace(MARKS, '').replace(/[^\p{L}\p{N}]/gu, '');
      if (t.includes('�')) bad++;
      else if (bare.length === 0 && /[ً-ْ]/.test(t)) bad++; // voyelles seules
      else if (bare.length === 1 && LETTER.test(bare) && !/^[وبلفكأإآاءy]$/i.test(bare)) bad++;
    }
    return bad / tokens.length;
  }

  function linesFromItems(items) {
    const lines = [];
    let cur = '';
    for (const it of items) {
      cur += it.str;
      if (it.hasEOL) {
        lines.push(cur);
        cur = '';
      }
    }
    if (cur) lines.push(cur);
    return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Recolle les mots coupés en fin de ligne et retire les numéros seuls. */
  function cleanLines(lines) {
    const out = [];
    for (let l of lines) {
      if (/^[\d٠-٩\s.\-]+$/.test(l)) continue; // numéros de page / de vers
      if (out.length && /\p{L}-$/u.test(out[out.length - 1])) {
        out[out.length - 1] = out[out.length - 1].slice(0, -1) + l;
      } else out.push(l);
    }
    return out;
  }

  /** Retire les en-têtes et pieds de page répétés sur au moins la moitié des pages. */
  function removeRunningHeaders(pages) {
    if (pages.length < 3) return pages;
    // Le numéro de page est souvent collé à l'en-tête : on l'ignore pour comparer.
    const key = (l) => l.replace(/[\d٠-٩]+/g, '').replace(/\s+/g, ' ').trim();
    const count = new Map();
    for (const p of pages) for (const k of new Set(p.lines.map(key))) count.set(k, (count.get(k) || 0) + 1);
    const repeated = new Set([...count].filter(([k, n]) => k && n >= pages.length / 2).map(([k]) => k));
    return pages.map((p) => ({ ...p, lines: p.lines.filter((l) => !repeated.has(key(l))) }));
  }

  async function extractPdf(file, onProgress) {
    const pdfjsLib = root.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data }).promise;
    let pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const lines = cleanLines(linesFromItems(content.items).map(fixArabic));
      pages.push({ number: n, lines });
      if (onProgress) onProgress(n, doc.numPages);
    }
    pages = removeRunningHeaders(pages);
    return pages.map((p) => {
      const text = p.lines.join('\n');
      const score = garbleScore(text);
      return {
        number: p.number,
        text,
        garbled: score > 0.25,
        empty: text.replace(/\s/g, '').length < 5,
      };
    });
  }

  root.PdfText = { extractPdf, fixArabic, garbleScore };
})(typeof self !== 'undefined' ? self : this);
