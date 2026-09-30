const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../web/app.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source.replace(/start\(\);\s*$/, ''), sandbox);
const { findFillSpans } = sandbox;

function drawing(rows, palette = {}) {
  const colors = { '.': [0, 0, 0, 0], '#': [0, 0, 0, 255], ...palette };
  return { width: rows[0].length, height: rows.length,
    data: new Uint8ClampedArray(rows.flatMap(row => [...row].flatMap(pixel => colors[pixel]))) };
}

function filled(image, x, y) {
  const result = new Set();
  for (const [left, row, right] of findFillSpans(image, x, y)) {
    for (let column = left; column <= right; column++) {
      const key = `${column},${row}`;
      assert.ok(!result.has(key), 'Each pixel should be visited only once');
      result.add(key);
    }
  }
  return result;
}

test('fills an enclosed area without crossing its outline', () => {
  const image = drawing(['.......', '.#####.', '.#...#.', '.#...#.', '.#####.', '.......']);
  assert.deepEqual(filled(image, 3, 2), new Set(['2,2', '3,2', '4,2', '2,3', '3,3', '4,3']));
  assert.equal(filled(image, 0, 0).size, 22);
});

test('open boundaries connect to the background; diagonal contact does not', () => {
  assert.equal(filled(drawing(['.....', '.#.#.', '.#.#.', '.###.', '.....']), 2, 2).size, 18);
  assert.equal(filled(drawing(['.#', '#.']), 0, 0).size, 1);
});

test('matches visible colors on white and stops at translucent ink', () => {
  const image = drawing(['.wh.'], { w: [255, 255, 255, 255], h: [0, 0, 0, 77] });
  assert.deepEqual(filled(image, 0, 0), new Set(['0,0', '1,0']));
});

test('tolerance is relative to the seed and does not creep across a gradient', () => {
  const image = drawing(['.abc'], { a: [240, 240, 240, 255], b: [220, 220, 220, 255], c: [200, 200, 200, 255] });
  assert.equal(filled(image, 0, 0).size, 2);
});

test('handles a large blank canvas without recursion and rejects out-of-bounds seeds', () => {
  const image = { width: 1600, height: 1000, data: new Uint8ClampedArray(1600 * 1000 * 4) };
  const spans = findFillSpans(image, 800, 500);
  assert.equal(spans.reduce((count, [left, , right]) => count + right - left + 1, 0), 1600000);
  assert.equal(findFillSpans(image, -1, 0).length, 0);
  assert.equal(findFillSpans(image, 0, 1000).length, 0);
});
