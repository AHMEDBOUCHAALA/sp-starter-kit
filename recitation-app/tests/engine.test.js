// Lancer avec : node tests/engine.test.js
const assert = require('assert');
const { RecitationEngine, normalize } = require('../engine.js');

function run(text, spoken, opts) {
  const e = new RecitationEngine(text.split(/\s+/), opts);
  e.feedText(spoken);
  return e;
}
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test('récitation parfaite', () => {
  const e = run('Le savoir est une lumière.', 'le savoir est une lumière');
  assert.deepStrictEqual(e.states, ['correct', 'correct', 'correct', 'correct', 'correct']);
  assert.ok(e.done);
});
test('accents et ponctuation ignorés', () => {
  const e = run("L'élève, déjà prêt !", 'leleve deja pret');
  assert.deepStrictEqual(e.states.slice(0, 3), ['correct', 'correct', 'correct']);
});
test('mot oublié', () => {
  const e = run('le savoir est une grande lumière', 'le savoir est une lumière');
  assert.strictEqual(e.states[4], 'skipped');
  assert.strictEqual(e.states[5], 'correct');
});
test('mot remplacé (faute)', () => {
  const e = run('le savoir est une grande lumière', 'le savoir est une petite lumière');
  assert.strictEqual(e.states[4], 'error');
  assert.strictEqual(e.states[5], 'correct');
});
test('mot parasite ignoré', () => {
  const e = run('le savoir est une lumière', 'le savoir euh est une lumière');
  assert.ok(e.states.every((s) => s === 'correct'));
});
test('deux mots faux d affilée = faute', () => {
  const mistakes = [];
  const e = run('le savoir est une lumière', 'le chat mange', { onMistake: (i) => mistakes.push(i) });
  assert.strictEqual(e.states[1], 'error');
  assert.deepStrictEqual(mistakes, [1]);
});
test('petite erreur du micro tolérée', () => {
  const e = run('Remplacement', 'remplacemant');
  assert.strictEqual(e.states[0], 'correct');
});
test('mode strict refuse la petite erreur', () => {
  const e = run('Remplacement suivant', 'remplacemant suivant', { strictness: 'strict' });
  assert.strictEqual(e.states[0], 'error');
});
test('mot coupé en deux par le micro', () => {
  const e = run('quatre-vingt ans', 'quatre vingt ans');
  assert.deepStrictEqual(e.states, ['correct', 'correct']);
});
test('arabe vocalisé vs reconnaissance sans voyelles', () => {
  const e = run('يَقُولُ عَبْدُ الْوَاحِدِ بْنُ عَاشِرِ', 'يقول عبد الواحد بن عاشر');
  assert.ok(e.states.every((s) => s === 'correct'), e.states.join());
});
test('arabe : ligature inversée dans le PDF', () => {
  assert.strictEqual(normalize('العالمة'), normalize('العلامة'));
  assert.strictEqual(normalize('إِلَى'), normalize('الى'));
});
test('indice et annulation', () => {
  const e = new RecitationEngine('un deux trois'.split(' '));
  e.hint();
  e.feed('deux');
  assert.deepStrictEqual(e.states, ['hint', 'correct', 'todo']);
  e.undo();
  assert.strictEqual(e.cursor, 1);
  assert.strictEqual(e.states[1], 'todo');
});
test('ponctuation seule sautée', () => {
  const e = run('bonjour - monde', 'bonjour monde');
  assert.deepStrictEqual(e.states, ['correct', 'punct', 'correct']);
});

let fail = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ', name); }
  catch (err) { fail++; console.log('FAIL ', name, '\n     ', err.message); }
}
process.exit(fail ? 1 : 0);
