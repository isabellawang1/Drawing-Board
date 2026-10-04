const { test } = require('node:test');
const assert = require('node:assert/strict');
const createBoard = require('./helpers/board.cjs');

test('eyedropper samples the composite at zoomed HiDPI coordinates without changing history', () => {
  const b = createBoard(2);
  b.nodes['#custom-color'].parentElement = { style: { setProperty() {} } };
  for (let i = 0; i < 3; i++) b.click('#zoom-in');
  b.viewport.scrollLeft = 200;
  b.viewport.scrollTop = 100;
  let sampled;
  b.canvas.ctx.getImageData = (...args) => {
    sampled = args;
    return { data: [20, 80, 140, 255] };
  };
  b.click('#eyedropper');
  b.draw(40, 60);
  assert.deepEqual(sampled, [240, 160, 1, 1]);
  assert.equal(b.nodes['#custom-color'].value, '#14508c');
  assert.equal(b.nodes['#eyedropper']['aria-pressed'], 'false');
  assert.equal(b.nodes['#undo'].disabled, true);
  b.draw(40, 60);
  assert.equal(b.operations().find(op => op.op === 'fill').color, '#14508c');
});

test('eyedropper composites translucent pixels on white; Escape cancels picking', () => {
  const b = createBoard();
  b.nodes['#custom-color'].parentElement = { style: { setProperty() {} } };
  for (const [pixel, expected] of [[[0, 0, 0, 0], '#ffffff'], [[255, 0, 0, 128], '#ff7f7f']]) {
    b.canvas.ctx.getImageData = () => ({ data: pixel });
    b.click('#eyedropper');
    b.draw(20, 20);
    assert.equal(b.nodes['#custom-color'].value, expected);
  }
  b.click('#eyedropper');
  b.document.events.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(b.nodes['#eyedropper']['aria-pressed'], 'false');
  assert.equal(b.nodes['#color-hint'].hidden, true);
  assert.equal(b.nodes['#undo'].disabled, true);
});
