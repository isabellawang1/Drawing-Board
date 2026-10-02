const { test } = require('node:test');
const assert = require('node:assert/strict');
const createBoard = require('./helpers/board.cjs');

function zoomTo200(board) {
  for (let i = 0; i < 3; i++) board.click('#zoom-in');
}

test('zoom keeps the center anchored, clamps at 25–400%, and leaves history untouched', () => {
  const b = createBoard();
  zoomTo200(b);
  assert.equal(b.nodes['#zoom-reset'].textContent, '200%');
  assert.equal(b.viewport.scrollLeft, 160);
  assert.equal(b.viewport.scrollTop, 120);
  assert.equal(b.canvas.width, 320);
  for (let i = 0; i < 10; i++) b.click('#zoom-in');
  assert.equal(b.nodes['#zoom-reset'].textContent, '400%');
  assert.equal(b.nodes['#zoom-in'].disabled, true);
  for (let i = 0; i < 15; i++) b.click('#zoom-out');
  assert.equal(b.nodes['#zoom-reset'].textContent, '25%');
  assert.equal(b.nodes['#zoom-out'].disabled, true);
  b.click('#zoom-reset');
  assert.equal(b.nodes['#zoom-reset'].textContent, '100%');
  assert.equal(b.viewport.scrollLeft, 0);
  assert.equal(b.viewport.scrollTop, 0);
  assert.equal(b.nodes['#undo'].disabled, true);
});

test('strokes and every shape use drawing coordinates at 200% and 50%', () => {
  for (const tool of ['marker', 'highlighter', 'eraser', 'line', 'rectangle', 'circle']) {
    const b = createBoard(); b.tool(tool); zoomTo200(b);
    b.draw(40, 40, 80, 80); // World (100, 80) -> (120, 100).
    const ops = b.operations();
    if (tool === 'rectangle') assert.deepEqual(ops.find(op => op.op === 'rect').args, [100, 80, 20, 20]);
    else if (tool === 'circle') assert.deepEqual(ops.find(op => op.op === 'arc').args.slice(0, 3), [100, 80, Math.hypot(20, 20)]);
    else {
      assert.deepEqual(ops.find(op => op.op === 'moveTo').args, [100, 80]);
      assert.deepEqual(ops.find(op => op.op === 'lineTo').args, [120, 100]);
    }
    const artwork = JSON.stringify(b.canvas.ctx.operations);
    b.click('#zoom-reset'); assert.equal(JSON.stringify(b.canvas.ctx.operations), artwork);
    b.click('#undo'); assert.equal(b.operations().some(op => op.op === 'stroke'), false);
    b.click('#zoom-out'); b.click('#zoom-out');
    b.click('#redo'); assert.equal(JSON.stringify(b.canvas.ctx.operations), artwork);
  }
  const b = createBoard(); b.click('#zoom-out'); b.click('#zoom-out');
  b.draw(130, 100, 140, 110); // Centered half-size board starts at (80, 60).
  assert.deepEqual(b.operations().find(op => op.op === 'moveTo').args, [100, 80]);
  assert.deepEqual(b.operations().find(op => op.op === 'lineTo').args, [120, 100]);
});

test('panning moves the view without drawing and releases pointer capture', () => {
  const b = createBoard(); zoomTo200(b); b.click('#pan');
  b.canvas.onpointerdown(b.event(100, 100));
  b.canvas.onpointermove(b.event(60, 70));
  b.canvas.onpointerup(b.event(60, 70));
  assert.equal(b.viewport.scrollLeft, 200);
  assert.equal(b.viewport.scrollTop, 150);
  assert.equal(b.canvas.capture, null);
  assert.equal(b.nodes['#undo'].disabled, true);
  b.click('#pan'); b.draw(40, 50, 80, 90);
  assert.deepEqual(b.operations().find(op => op.op === 'moveTo').args, [120, 100]);
  assert.deepEqual(b.operations().find(op => op.op === 'lineTo').args, [140, 120]);
});

test('text drafts stay at their drawing position across zoom; keyboard text uses the visible center', () => {
  const b = createBoard(); zoomTo200(b); b.tool('text'); b.draw(40, 40);
  assert.equal(b.nodes['#text-editor'].style.left, '91px');
  assert.equal(b.nodes['#text-editor'].style.top, '60px'); // Editor stays inside the board.
  b.nodes['#text-input'].value = 'Hello'; b.click('#zoom-out');
  assert.equal(b.nodes['#text-editor'].hidden, false);
  b.click('#text-done');
  assert.deepEqual(b.operations().find(op => op.op === 'fillText').args, ['Hello', 100, 69]);
  b.canvas.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.equal(b.nodes['#text-editor'].style.left, '151px');
});

test('bucket seeds account for zoom, pan, and device pixel ratio', () => {
  for (const scale of [1, 2]) {
    const b = createBoard(scale); zoomTo200(b); b.tool('bucket');
    b.viewport.scrollLeft = 200; b.viewport.scrollTop = 100;
    b.image((width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      // A single white pixel surrounded by black, at drawing point (120, 80).
      const offset = (80 * scale * width + 120 * scale) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 255;
      return { width, height, data };
    });
    b.draw(40, 60);
    const patch = b.operations().find(op => op.op === 'image' && op.args.length === 4);
    assert.deepEqual(patch.args, [120, 80, 1 / scale, 1 / scale]);
    b.click('#zoom-reset'); b.resize();
    assert.deepEqual(b.operations().find(op => op.op === 'image' && op.args.length === 4).args, patch.args);
  }
});

test('resize retains the board, and layers retain their order and visibility while zooming', () => {
  const b = createBoard(); b.draw(20, 20); b.click('#layer-add'); b.draw(50, 50);
  b.nodes['#layer-list'].querySelector('.layer-visibility[data-layer-id="2"]').onclick();
  const artwork = JSON.stringify(b.canvas.ctx.operations);
  zoomTo200(b); b.viewport.clientWidth = 240; b.viewport.clientHeight = 180; b.resize();
  assert.equal(b.canvas.width, 320); assert.equal(b.canvas.height, 240);
  assert.equal(JSON.stringify(b.canvas.ctx.operations), artwork);
  assert.equal(b.nodes['#layer-list'].querySelector('.layer-visibility[data-layer-id="2"]')['aria-pressed'], 'false');
  b.click('#undo'); // Undo hiding, not zooming.
  assert.equal(b.nodes['#layer-list'].querySelector('.layer-visibility[data-layer-id="2"]')['aria-pressed'], 'true');
  assert.equal(b.nodes['#zoom-reset'].textContent, '200%');
});
