const { test } = require('node:test');
const assert = require('node:assert/strict');
const createBoard = require('./helpers/board.cjs');
const key = 'drawing-board.autosave.v1';

test('reload restores artwork, hidden layers, selection, names, and board extent', () => {
  const storage = new Map();
  const b = createBoard(1, storage);
  b.viewport.clientWidth = 700; b.resize();
  b.draw(10, 20, 80, 90);
  b.click('#layer-add');
  b.draw(25, 30);
  const list = b.nodes['#layer-list'];
  list.querySelector('.layer-rename[data-layer-id="2"]').onclick();
  const input = list.querySelector('.layer-rename-input');
  input.value = 'Sketch'; input.oninput(); input.onkeydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
  list.querySelector('.layer-visibility[data-layer-id="2"]').onclick();
  const saved = JSON.parse(storage.get(key));
  assert.equal(saved.layers[1].name, 'Sketch');
  assert.equal(saved.layers[1].visible, false);
  const restored = createBoard(1, storage);
  assert.equal(restored.canvas.width, 700);
  assert.equal(restored.nodes.canvas.dataset.layerHidden, 'true');
  assert.equal(restored.nodes['#undo'].disabled, true);
  assert.deepEqual(restored.operations(), b.operations());
  assert.equal(restored.nodes['#save-status'].textContent, 'Saved');
  restored.click('#layer-add');
  assert.equal(JSON.parse(storage.get(key)).selectedLayerId, 3);
});

test('clear, undo, and redo persist the current drawing', () => {
  const storage = new Map(); const b = createBoard(1, storage);
  b.draw(10, 10);
  b.click('#clear');
  assert.equal(createBoard(1, storage).operations().some(op => op.op === 'arc'), false);
  b.click('#undo');
  assert.equal(createBoard(1, storage).operations().some(op => op.op === 'arc'), true);
  b.click('#redo');
  assert.equal(createBoard(1, storage).operations().some(op => op.op === 'arc'), false);
});

test('bucket fills survive reload and a changed pixel ratio', () => {
  const storage = new Map(); const b = createBoard(1, storage);
  b.image((width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
  b.tool('bucket'); b.draw(20, 20);
  const restored = createBoard(2, storage);
  assert.equal(restored.operations().some(op => op.op === 'fillRect'), true);
  assert.deepEqual(restored.operations().find(op => op.op === 'image' && op.args.length === 4).args, [0, 0, 320, 240]);
});

test('corrupt saves and storage failures leave drawing usable', () => {
  const storage = new Map([[key, '{broken']]);
  const b = createBoard(1, storage);
  assert.equal(b.nodes['#save-status'].textContent, 'Not restored');
  b.window.events.pagehide();
  assert.equal(storage.get(key), '{broken');
  b.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  b.draw(10, 10);
  assert.equal(b.nodes['#save-status'].textContent, 'Not saved');
  assert.equal(b.operations().some(op => op.op === 'arc'), true);
});

test('leaving the page commits unfinished text', () => {
  const storage = new Map(); const b = createBoard(1, storage);
  b.tool('text'); b.draw(30, 40);
  b.nodes['#text-input'].value = 'Remember this';
  b.window.events.pagehide();
  const restored = createBoard(1, storage);
  assert.equal(restored.operations().find(op => op.op === 'fillText').args[0], 'Remember this');
});
