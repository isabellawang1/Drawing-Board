const { test } = require('node:test');
const assert = require('node:assert/strict');
const createBoard = require('./helpers/board.cjs');
const key = 'drawing-board.autosave.v1';
const setOpacity = (b, value) => {
  b.nodes['#brush-opacity'].value = value;
  b.nodes['#brush-opacity'].oninput();
};
const translucentImages = b => b.operations().filter(op => op.op === 'image' && op.alpha !== 1);

test('opacity composites whole strokes and survives undo, redo, resize, and reload', () => {
  const storage = new Map();
  const b = createBoard(1, storage);
  setOpacity(b, 45);
  b.draw(10, 10, 100, 100);
  assert.equal(translucentImages(b)[0].alpha, 0.45);
  b.click('#undo');
  assert.equal(translucentImages(b).length, 0);
  b.click('#redo');
  b.resize();
  assert.equal(translucentImages(b)[0].alpha, 0.45);
  assert.deepEqual(createBoard(2, storage).operations(), b.operations());
  b.tool('highlighter'); b.draw(20, 20);
  assert.equal(translucentImages(b).at(-1).alpha, 0.3);
  b.tool('marker'); b.draw(30, 30);
  assert.equal(translucentImages(b).at(-1).alpha, 0.45);
});

test('shapes, fills, text drafts, and partial erasing respect opacity', () => {
  const b = createBoard();
  for (const tool of ['line', 'rectangle', 'circle', 'eraser', 'bucket', 'text']) {
    b.tool(tool); setOpacity(b, 25);
    if (tool === 'bucket') b.image((width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
    b.draw(20, 20, 60, 60);
    if (tool === 'text') {
      b.nodes['#text-input'].value = 'Hello';
      setOpacity(b, 50);
      assert.equal(b.nodes['#text-input'].style.opacity, 0.5);
      b.click('#text-done');
    }
    const painted = translucentImages(b).at(-1);
    assert.equal(painted.alpha, tool === 'text' ? 0.5 : 0.25);
    assert.equal(painted.mode, tool === 'eraser' ? 'destination-out' : 'source-over');
  }
});

test('legacy drawings retain original opacity and zero opacity is preserved', () => {
  const storage = new Map(); const b = createBoard(1, storage);
  b.tool('highlighter'); b.draw(10, 10);
  const data = JSON.parse(storage.get(key));
  delete data.layers[0].strokes[0].opacity;
  storage.set(key, JSON.stringify(data));
  const restored = createBoard(1, storage);
  assert.equal(translucentImages(restored)[0].alpha, 0.3);
  setOpacity(restored, 0); restored.draw(30, 30);
  assert.equal(translucentImages(createBoard(1, storage)).at(-1).alpha, 0);
});
