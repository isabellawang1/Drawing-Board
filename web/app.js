// Draw directly on the browser canvas. No build step is needed.
function start() {
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  const paper = document.createElement('canvas'); // Finished strokes.
  const paperContext = paper.getContext('2d');
  const layer = document.createElement('canvas'); // One stroke, before applying opacity.
  const layerContext = layer.getContext('2d');
  const strokes = []; // Used to restore the drawing after resizing.
  let activeStroke = null;
  let pointer = null;
  const widths = { marker: 5, highlighter: 20, eraser: 20 };
  const widthInput = document.querySelector('#brush-width');
  const widthValue = document.querySelector('#width-value');
  function selectedTool() {
    return document.querySelector('input[name="tool"]:checked').value;
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
    if (points.length === 1) {
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
    for (const stroke of strokes) paintStroke(paperContext, stroke);
    render();
  }

  function appendPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    const previous = activeStroke.points.at(-1);
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    if (previous && x === previous.x && y === previous.y) return;
    activeStroke.points.push({ x, y, width: activeStroke.width });
  }

  function finish() {
    if (activeStroke) {
      strokes.push(activeStroke);
      paintStroke(paperContext, activeStroke);
      activeStroke = null;
      render();
    }
    const previous = pointer;
    pointer = null;
    if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
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
    if (event.pointerId === pointer) finish();
  };
  window.addEventListener('blur', finish);
  document.querySelector('#clear').onclick = () => {
    activeStroke = null;
    finish();
    strokes.length = 0;
    paperContext.clearRect(0, 0, paper.width, paper.height);
    render();
  };

  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  resize();
  showWidth();
  document.querySelector('fieldset').disabled = false;
  document.querySelector('#clear').disabled = false;
}

start();
