// Draw directly on the browser canvas. No build step is needed.
function start() {
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  const paper = document.createElement('canvas'); // Finished strokes.
  const paperContext = paper.getContext('2d');
  const layer = document.createElement('canvas'); // One stroke, before applying opacity.
  const layerContext = layer.getContext('2d');
  let strokes = []; // Used to restore the drawing after resizing or undoing.
  const undoHistory = [];
  const redoHistory = [];
  const undoButton = document.querySelector('#undo');
  const redoButton = document.querySelector('#redo');
  const clearButton = document.querySelector('#clear');
  let activeStroke = null;
  let pointer = null;
  const widths = { marker: 5, highlighter: 20, eraser: 20, line: 5, rectangle: 5, circle: 5 };
  const widthInput = document.querySelector('#brush-width');
  const widthValue = document.querySelector('#width-value');

  function updateHistoryButtons() {
    undoButton.disabled = undoHistory.length === 0 && !activeStroke;
    redoButton.disabled = redoHistory.length === 0 || !!activeStroke;
    clearButton.disabled = strokes.length === 0 && !activeStroke;
  }

  function recordAction(action) {
    undoHistory.push(action);
    redoHistory.length = 0;
  }
  function selectedTool() {
    return document.querySelector('input[name="tool"]:checked').value;
  }

  function isShape(type) {
    return ['line', 'rectangle', 'circle'].includes(type);
  }

  function hasShapeSize(stroke) {
    if (stroke.points.length < 2) return false;
    const [first, last] = stroke.points;
    return stroke.type === 'rectangle'
      ? first.x !== last.x && first.y !== last.y
      : first.x !== last.x || first.y !== last.y;
  }

  function showWidth() {
    const width = widths[selectedTool()];
    widthInput.value = width;
    widthInput.setAttribute('aria-valuetext', `${width} pixels`);
    widthValue.value = `${width} px`;
  }
  widthInput.oninput = () => {
    widths[selectedTool()] = Number(widthInput.value);
    showWidth();
  };
  for (const tool of document.querySelectorAll('input[name="tool"]')) tool.onchange = showWidth;

  function dot(point) {
    layerContext.beginPath();
    layerContext.arc(point.x, point.y, point.width / 2, 0, Math.PI * 2);
    layerContext.fill();
  }

  // Build an opaque stroke first, so highlighter segments don't darken at every join.
  function paintStroke(target, stroke) {
    layerContext.clearRect(0, 0, layer.width, layer.height);
    layerContext.fillStyle = layerContext.strokeStyle = stroke.color;
    const points = stroke.points;
    const first = points[0];
    if (isShape(stroke.type)) {
      if (!hasShapeSize(stroke)) return;
      const last = points[1];
      layerContext.lineWidth = stroke.width;
      layerContext.lineCap = 'round';
      layerContext.lineJoin = 'miter';
      layerContext.beginPath();
      if (stroke.type === 'line') {
        layerContext.moveTo(first.x, first.y);
        layerContext.lineTo(last.x, last.y);
      } else if (stroke.type === 'rectangle') {
        layerContext.rect(Math.min(first.x, last.x), Math.min(first.y, last.y),
          Math.abs(last.x - first.x), Math.abs(last.y - first.y));
      } else {
        layerContext.arc(first.x, first.y, Math.hypot(last.x - first.x, last.y - first.y), 0, Math.PI * 2);
      }
      layerContext.stroke();
    } else if (points.length === 1) {
      if (stroke.type === 'highlighter') {
        layerContext.fillRect(first.x - stroke.width / 2, first.y - stroke.width / 2, stroke.width, stroke.width);
      } else dot(first);
    } else {
      layerContext.lineWidth = stroke.width;
      layerContext.lineCap = stroke.type === 'highlighter' ? 'square' : 'round';
      layerContext.lineJoin = 'round';
      layerContext.beginPath();
      layerContext.moveTo(first.x, first.y);
      for (const point of points.slice(1)) layerContext.lineTo(point.x, point.y);
      layerContext.stroke();
    }
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = stroke.type === 'highlighter' ? 0.3 : 1;
    target.globalCompositeOperation = stroke.type === 'eraser' ? 'destination-out' : 'source-over';
    target.drawImage(layer, 0, 0);
    target.restore();
  }

  function render() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(paper, 0, 0);
    if (activeStroke) paintStroke(context, activeStroke);
  }

  function resize() {
    const scale = window.devicePixelRatio || 1;
    for (const surface of [canvas, paper, layer]) {
      surface.width = Math.round(canvas.clientWidth * scale);
      surface.height = Math.round(canvas.clientHeight * scale);
    }
    layerContext.setTransform(scale, 0, 0, scale, 0, 0);
    rebuildPaper();
  }

  function rebuildPaper() {
    paperContext.clearRect(0, 0, paper.width, paper.height);
    for (const stroke of strokes) paintStroke(paperContext, stroke);
    render();
  }

  function appendPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    const previous = activeStroke.points.at(-1);
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    if (previous && x === previous.x && y === previous.y) return;
    const point = { x, y, width: activeStroke.width };
    // Shapes keep their starting point and replace the preview endpoint as you drag.
    if (isShape(activeStroke.type) && activeStroke.points.length > 0) activeStroke.points[1] = point;
    else activeStroke.points.push(point);
  }

  function finish() {
    if (activeStroke) {
      if (!isShape(activeStroke.type) || hasShapeSize(activeStroke)) {
        strokes.push(activeStroke);
        recordAction({ type: 'stroke', stroke: activeStroke });
        paintStroke(paperContext, activeStroke);
      }
      activeStroke = null;
      render();
    }
    const previous = pointer;
    pointer = null;
    if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
    updateHistoryButtons();
  }

  function cancelShape() {
    activeStroke = null;
    finish();
    render();
  }

  canvas.onpointerdown = (event) => {
    if (pointer !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    const type = selectedTool();
    activeStroke = { type, width: widths[type], color: document.querySelector('input[name="color"]:checked').value, points: [] };
    appendPoint(event);
    render();
    updateHistoryButtons();
  };
  canvas.onpointermove = (event) => {
    if (event.pointerId !== pointer) return;
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) appendPoint(sample);
    render();
  };
  canvas.onpointerup = (event) => {
    if (event.pointerId !== pointer) return;
    appendPoint(event);
    finish();
  };
  canvas.onpointercancel = canvas.onlostpointercapture = (event) => {
    if (event.pointerId !== pointer) return;
    if (activeStroke && isShape(activeStroke.type)) cancelShape();
    else finish();
  };
  window.addEventListener('blur', () => {
    if (activeStroke && isShape(activeStroke.type)) cancelShape();
    else finish();
  });
  clearButton.onclick = () => {
    finish();
    if (strokes.length === 0) return;
    recordAction({ type: 'clear', strokes: strokes.slice() });
    strokes = [];
    rebuildPaper();
    updateHistoryButtons();
  };
  undoButton.onclick = () => {
    finish();
    const action = undoHistory.pop();
    if (!action) return;
    if (action.type === 'stroke') strokes.pop();
    else strokes = action.strokes.slice();
    redoHistory.push(action);
    rebuildPaper();
    updateHistoryButtons();
  };
  redoButton.onclick = () => {
    finish();
    const action = redoHistory.pop();
    if (!action) return;
    if (action.type === 'stroke') strokes.push(action.stroke);
    else strokes = [];
    undoHistory.push(action);
    rebuildPaper();
    updateHistoryButtons();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeStroke && isShape(activeStroke.type)) {
      event.preventDefault();
      cancelShape();
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.target.isContentEditable ||
        event.target.matches('textarea, select, input:not([type="radio"]):not([type="range"])')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || (key === 'y' && !event.metaKey)) {
      event.preventDefault();
      if (key === 'y' || event.shiftKey) redoButton.onclick();
      else undoButton.onclick();
    }
  });

  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  resize();
  showWidth();
  document.querySelector('fieldset').disabled = false;
  updateHistoryButtons();
}

start();
