const { test } = require('node:test');
const assert = require('node:assert/strict');
const createBoard = require('./helpers/board.cjs');
const key = 'drawing-board.autosave.v1';

function setup() {
  const storage = new Map();
  const b = createBoard(1, storage);
  b.draw(10, 10);
  b.click('#layer-add');
  b.draw(20, 20);
  b.click('#layer-add');
  const list = b.nodes['#layer-list'];
  const layout = () => {
    list.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 150 });
    list.children.forEach((row, index) => {
      row.getBoundingClientRect = () => ({ top: index * 50, height: 50 });
    });
  };
  const event = (y, x = 80) => ({ pointerId: 7, isPrimary: true, button: 0, clientX: x, clientY: y, preventDefault() {} });
  const start = (id, y) => {
    layout();
    list.querySelector(`.layer-select[data-layer-id="${id}"]`).onpointerdown(event(y));
  };
  const state = () => JSON.parse(storage.get(key));
  return { b, list, storage, start, event, state };
}

test('drag moves a hidden layer across the stack, preserving artwork and selection with one undo step', () => {
  const { b, list, start, event, state, storage } = setup();
  list.querySelector('.layer-visibility[data-layer-id="1"]').onclick();
  const before = state();
  start(1, 125);
  list.onpointermove(event(5));
  assert.equal(list.children[0].dataset.drop, 'before');
  assert.deepEqual(state(), before, 'preview does not save intermediate order');
  // Touch implicit capture can be lost when capture transfers to the list.
  list.onlostpointercapture({ target: list.children[2].children[0] });
  list.onpointerup(event(5));
  const after = state();
  assert.deepEqual(after.layers.map(layer => layer.id), [2, 3, 1]);
  assert.equal(after.selectedLayerId, before.selectedLayerId);
  assert.deepEqual(after.layers[2], before.layers[0]);
  b.click('#undo');
  assert.deepEqual(state(), before);
  b.click('#redo');
  assert.deepEqual(state(), after);
  const restored = createBoard(1, storage);
  assert.deepEqual(restored.nodes['#layer-list'].children.map(row => row.dataset.id), [1, 3, 2]);
});

test('outside drop, Escape, pointer cancellation and unchanged position do not save a reorder', () => {
  const { b, list, start, event, state } = setup();
  const before = state();
  for (const cancel of ['outside', 'escape', 'pointer', 'same']) {
    start(3, 25);
    list.onpointermove(event(cancel === 'same' ? 10 : 140));
    if (cancel === 'outside') list.onpointerup(event(140, 250));
    if (cancel === 'escape') b.nodes['#layers-panel'].onkeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    if (cancel === 'pointer') list.onpointercancel();
    if (cancel === 'same') list.onpointerup(event(10));
    assert.deepEqual(state(), before);
    assert.equal(list.capture, null);
    assert.ok(list.children.every(row => !row.dataset.drop && !row.dataset.dragging));
  }
  b.click('#undo');
  assert.equal(state().layers.length, 2, 'cancellations do not add undo steps');
});

test('keyboard reorder moves either direction and stops at the edges', () => {
  const { list, state } = setup();
  const press = key => list.querySelector('.layer-select[data-layer-id="3"]').onkeydown({ key, altKey: true, preventDefault() {}, stopPropagation() {} });
  press('ArrowDown');
  press('ArrowDown');
  press('ArrowDown');
  assert.deepEqual(state().layers.map(layer => layer.id), [3, 1, 2]);
  press('ArrowUp');
  assert.deepEqual(state().layers.map(layer => layer.id), [1, 3, 2]);
});
