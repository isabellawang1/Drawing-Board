const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../../web/index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));

// A small DOM/canvas double for checking artwork coordinates and UI actions.
module.exports = function createBoard(scale = 1, storage = new Map()) {
  let document;
  class Element {
    constructor() {
      this.events = {}; this.style = {}; this.dataset = {}; this.children = [];
      this.className = ''; this.value = ''; this.hidden = true;
      this.clientWidth = 320; this.clientHeight = 240;
      this.scrollLeft = 0; this.scrollTop = 0;
      this.classList = { contains: name => this.className.split(' ').includes(name) };
    }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this[name] = value; }
    focus() { document.activeElement = this; }
    contains(item) { return item === this || this.children.some(child => child.contains(item)); }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
    scrollIntoView() {}
    setSelectionRange() {}
    select() {}
    matches() { return false; }
    querySelector(selector) {
      const id = selector.match(/data-layer-id="(\d+)"/)?.[1];
      const cls = selector.match(/^\.([\w-]+)/)?.[1];
      for (const child of this.children) {
        if ((!id || String(child.dataset.layerId) === id) && (!cls || child.className === cls) &&
            (!selector.includes(':not(:disabled)') || !child.disabled)) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    getBoundingClientRect() { return { left: 40, top: 56 }; }
  }
  let imageFactory;
  function makeCanvas() {
    const canvas = new Element();
    const ctx = {
      operations: [], stack: [], globalAlpha: 1, globalCompositeOperation: 'source-over',
      clearRect() { this.operations = []; }, setTransform() {},
      save() { this.stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation }); },
      restore() { Object.assign(this, this.stack.pop()); },
      drawImage(source, ...args) {
        this.operations.push({ op: 'image', args, alpha: this.globalAlpha, mode: this.globalCompositeOperation,
          content: structuredClone(source.ctx.operations) });
      },
      getImageData(x, y, width, height) { return imageFactory(width, height); }
    };
    for (const name of ['beginPath', 'arc', 'fill', 'fillRect', 'moveTo', 'lineTo', 'rect', 'stroke', 'fillText']) {
      ctx[name] = function (...args) { this.operations.push({ op: name, args, width: this.lineWidth, color: this.fillStyle }); };
    }
    canvas.ctx = ctx; canvas.getContext = () => ctx;
    canvas.setPointerCapture = id => { canvas.capture = id; };
    canvas.hasPointerCapture = id => canvas.capture === id;
    canvas.releasePointerCapture = () => { canvas.capture = null; };
    return canvas;
  }
  document = new Element(); document.activeElement = new Element();
  const canvas = makeCanvas();
  const nodes = { canvas };
  const tools = ['marker', 'highlighter', 'eraser', 'bucket', 'line', 'rectangle', 'circle', 'text']
    .map(value => Object.assign(new Element(), { value }));
  let selected = tools[0];
  const colors = [Object.assign(new Element(), { value: '#ef4444', checked: true })];
  // Missing IDs must return null, as in the browser, so removed controls fail tests.
  document.querySelector = selector => selector.startsWith('#') && !htmlIds.has(selector.slice(1)) ? null : selector === 'input[name="tool"]:checked' ? selected : (nodes[selector] ||= new Element());
  document.querySelectorAll = selector => selector === 'input[name="color"]' ? colors : tools;
  document.createElement = tag => tag === 'canvas' ? makeCanvas() : new Element();
  document.querySelector('#shape-options').querySelectorAll = () => tools.slice(4, 7);
  document.querySelector('#math-options').querySelectorAll = () => [];
  const viewport = document.querySelector('#canvas-viewport');
  const board = document.querySelector('#canvas-board');
  const extent = document.querySelector('#canvas-extent');
  for (const [axis, size] of [['Left', 'Width'], ['Top', 'Height']]) {
    let scroll = 0;
    Object.defineProperty(viewport, `scroll${axis}`, {
      get: () => scroll,
      set: value => { scroll = Math.max(0, Math.min(value, parseFloat(extent.style[size.toLowerCase()] || 0) - viewport[`client${size}`])); }
    });
    Object.defineProperty(canvas, `client${size}`, { get: () => parseFloat(board.style[size.toLowerCase()] || 0) });
  }
  canvas.getBoundingClientRect = () => {
    const [, x, y, zoom] = board.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/);
    return { left: 40 + Number(x) - viewport.scrollLeft, top: 56 + Number(y) - viewport.scrollTop,
      width: canvas.clientWidth * zoom, height: canvas.clientHeight * zoom };
  };
  const window = new Element(); window.devicePixelRatio = scale;
  window.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  let resize;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../web/app.js'), 'utf8'), {
    document, window, ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} }
  });
  const event = (x, y) => ({ pointerId: 1, isPrimary: true, button: 0, clientX: x + 40, clientY: y + 56, preventDefault() {} });
  return {
    nodes, canvas, viewport, document, window, event, resize: () => resize(),
    click: id => nodes[id].onclick(),
    tool: name => { selected = tools.find(tool => tool.value === name); },
    image: factory => { imageFactory = factory; },
    draw: (x, y, endX = x, endY = y) => { canvas.onpointerdown(event(x, y)); canvas.onpointerup(event(endX, endY)); },
    operations: () => {
      const flatten = ops => ops.flatMap(op => [op, ...flatten(op.content || [])]);
      return flatten(canvas.ctx.operations);
    }
  };
};
