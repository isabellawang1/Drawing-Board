// Draw directly on the browser canvas. No build step is needed.
function findFillSpans(image, x, y) {
  const { width, height, data } = image;
  if (x < 0 || y < 0 || x >= width || y >= height) return [];
  // Compare colors as displayed on white paper, including translucent ink.
  const visible = (offset, channel) => 255 + (data[offset + channel] - 255) * data[offset + 3] / 255;
  const seed = (y * width + x) * 4;
  const color = [0, 1, 2].map(channel => visible(seed, channel));
  const visited = new Uint8Array(width * height);
  const matches = (px, py) => {
    const index = py * width + px;
    if (visited[index]) return false;
    const offset = index * 4;
    return Math.abs(visible(offset, 0) - color[0]) <= 24 &&
      Math.abs(visible(offset, 1) - color[1]) <= 24 &&
      Math.abs(visible(offset, 2) - color[2]) <= 24;
  };

  const pending = [[x, y]];
  const spans = [];
  while (pending.length) {
    const [px, py] = pending.pop();
    if (!matches(px, py)) continue;
    let left = px, right = px;
    while (left > 0 && matches(left - 1, py)) left--;
    while (right + 1 < width && matches(right + 1, py)) right++;
    visited.fill(1, py * width + left, py * width + right + 1);
    spans.push([left, py, right]);
    for (const row of [py - 1, py + 1]) {
      if (row < 0 || row >= height) continue;
      let inRun = false;
      for (let column = left; column <= right; column++) {
        const match = matches(column, row);
        if (match && !inRun) pending.push([column, row]);
        inRun = match;
      }
    }
  }
  return spans;
}

function start() {
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  const viewport = document.querySelector('#canvas-viewport');
  const extent = document.querySelector('#canvas-extent');
  const board = document.querySelector('#canvas-board');
  const zoomOut = document.querySelector('#zoom-out');
  const zoomIn = document.querySelector('#zoom-in');
  const zoomReset = document.querySelector('#zoom-reset');
  const panButton = document.querySelector('#pan');
  const zoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  let zoom = 1;
  let boardWidth = 0, boardHeight = 0;
  let panMode = false, panStart = null;
  const paper = document.createElement('canvas'); // Selected layer with an in-progress stroke.
  const paperContext = paper.getContext('2d');
  const layer = document.createElement('canvas'); // One stroke, before applying opacity.
  const layerContext = layer.getContext('2d');
  let layers = [{ id: 1, name: 'Layer 1', visible: true, strokes: [] }]; // Bottom to top.
  let selectedLayerId = 1;
  let nextLayerId = 2;
  const layerSurfaces = new Map();
  const undoHistory = [];
  const redoHistory = [];
  const undoButton = document.querySelector('#undo');
  const redoButton = document.querySelector('#redo');
  const clearButton = document.querySelector('#clear');
  const layersToggle = document.querySelector('#layers-toggle');
  const layersPicker = document.querySelector('#layers-picker');
  const layersPanel = document.querySelector('#layers-panel');
  const layerList = document.querySelector('#layer-list');
  const layerUpButton = document.querySelector('#layer-up');
  const layerDownButton = document.querySelector('#layer-down');
  const layerHint = document.querySelector('#layer-hint');
  let layerRename = null;
  let activeStroke = null;
  let pointer = null;
  let textDraft = null;
  const textEditor = document.querySelector('#text-editor');
  const textInput = document.querySelector('#text-input');
  const presetColors = [...document.querySelectorAll('input[name="color"]')];
  const customColor = document.querySelector('#custom-color');
  const eyedropper = document.querySelector('#eyedropper');
  const colorHint = document.querySelector('#color-hint');
  let pickingColor = false;
  let drawingColor = presetColors.find(input => input.checked).value;
  const widths = { marker: 5, highlighter: 20, eraser: 20, line: 5, rectangle: 5, circle: 5, text: 24 };
  const widthInput = document.querySelector('#brush-width');
  const widthValue = document.querySelector('#width-value');
  const widthLabel = document.querySelector('#width-label');
  const shapePicker = document.querySelector('#shape-picker');
  const shapeToggle = document.querySelector('#shape-toggle');
  const shapeOptions = document.querySelector('#shape-options');
  const shapeInputs = [...shapeOptions.querySelectorAll('input[name="tool"]')];
  let focusShapesOnOpen = false;
  const mathPicker = document.querySelector('#math-picker');
  const mathToggle = document.querySelector('#math-toggle');
  const mathOptions = document.querySelector('#math-options');
  const mathButtons = [...mathOptions.querySelectorAll('button[data-math]')];
  const mathHint = document.querySelector('#math-hint');
  let pendingMath = '';
  let focusMathOnOpen = false;

  function updateHistoryButtons() {
    const pending = !!activeStroke || !!(textDraft && textInput.value.trim());
    undoButton.disabled = undoHistory.length === 0 && !pending;
    redoButton.disabled = redoHistory.length === 0 || pending;
    clearButton.disabled = !layers.some(item => item.strokes.length) && !pending && !pendingMath;
  }

  function snapshot() {
    // Finished strokes and their arrays are immutable, so history can share them.
    return { layers: layers.map(item => ({ ...item })), selectedLayerId };
  }

  function recordAction(before) {
    undoHistory.push({ before, after: snapshot() });
    redoHistory.length = 0;
  }

  function selectedLayer() {
    return layers.find(item => item.id === selectedLayerId);
  }

  function layerSurface(id) {
    if (!layerSurfaces.has(id)) layerSurfaces.set(id, document.createElement('canvas'));
    const surface = layerSurfaces.get(id);
    if (surface.width !== canvas.width) surface.width = canvas.width;
    if (surface.height !== canvas.height) surface.height = canvas.height;
    return surface;
  }

  function appendStroke(stroke, layerId = selectedLayerId) {
    const before = snapshot();
    const owner = layers.find(item => item.id === layerId);
    owner.strokes = [...owner.strokes, stroke];
    recordAction(before);
    paintStroke(layerSurface(owner.id).getContext('2d'), stroke);
    updateLayers();
  }

  function settleDrawing() {
    finishLayerRename();
    finishText();
    finish();
    clearPendingMath();
  }

  function updateLayers() {
    const focusedId = layerList.contains(document.activeElement) ? document.activeElement.dataset.layerId : null;
    const focusedControl = ['layer-remove', 'layer-rename', 'layer-rename-input', 'layer-visibility']
      .find(name => document.activeElement.classList.contains(name)) || 'layer-select';
    layerList.replaceChildren();
    for (const item of [...layers].reverse()) {
      const row = document.createElement('li');
      row.className = 'layer-row';
      row.dataset.active = String(item.id === selectedLayerId);
      row.dataset.hidden = String(!item.visible);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layer-select';
      button.dataset.layerId = item.id;
      button.setAttribute('aria-pressed', String(item.id === selectedLayerId));
      button.setAttribute('aria-label', item.name);
      button.title = item.name;
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = item.name;
      const detail = document.createElement('small');
      detail.className = 'layer-detail';
      detail.textContent = item.visible
        ? (item.id === selectedLayerId ? 'Selected' : 'Click to draw on this layer')
        : (item.id === selectedLayerId ? 'Selected · Hidden' : 'Hidden');
      button.append(name, detail);
      button.onclick = () => {
        settleDrawing();
        selectedLayerId = item.id;
        updateLayers();
        layerList.querySelector(`[data-layer-id="${item.id}"]`).focus({ preventScroll: true });
      };
      const visibilityButton = document.createElement('button');
      visibilityButton.type = 'button';
      visibilityButton.className = 'layer-visibility';
      visibilityButton.dataset.layerId = item.id;
      visibilityButton.setAttribute('aria-label', `Visibility of ${item.name}`);
      visibilityButton.setAttribute('aria-pressed', String(item.visible));
      visibilityButton.title = `${item.visible ? 'Hide' : 'Show'} ${item.name}`;
      visibilityButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' +
        (item.visible ? '' : '<path d="m3 3 18 18"/>') + '</svg>';
      visibilityButton.onclick = () => {
        settleDrawing();
        const before = snapshot();
        item.visible = !item.visible;
        recordAction(before);
        render();
        updateLayers();
        updateHistoryButtons();
        layerList.querySelector(`.layer-visibility[data-layer-id="${item.id}"]`).focus({ preventScroll: true });
      };
      const renameButton = document.createElement('button');
      renameButton.type = 'button';
      renameButton.className = 'layer-rename';
      renameButton.dataset.layerId = item.id;
      renameButton.setAttribute('aria-label', `Rename ${item.name}`);
      renameButton.title = `Rename ${item.name}`;
      renameButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/></svg>';
      renameButton.onclick = () => {
        settleDrawing();
        layerRename = { id: item.id, name: item.name };
        updateLayers();
        const input = layerList.querySelector('.layer-rename-input');
        input.focus({ preventScroll: true });
        input.select();
      };
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'layer-remove';
      removeButton.dataset.layerId = item.id;
      removeButton.disabled = layers.length === 1;
      removeButton.setAttribute('aria-label', `Remove ${item.name}`);
      removeButton.title = removeButton.disabled ? 'Keep at least one layer' : `Remove ${item.name}`;
      removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
      removeButton.onclick = () => removeLayer(item.id);
      if (layerRename?.id === item.id) {
        const editor = document.createElement('div');
        editor.className = 'layer-rename-editor';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'layer-rename-input';
        input.dataset.layerId = item.id;
        input.value = layerRename.name;
        input.setAttribute('aria-label', `New name for ${item.name}`);
        input.setAttribute('aria-describedby', 'layer-rename-help');
        input.oninput = () => { layerRename.name = input.value; };
        input.onkeydown = event => {
          if (event.isComposing) return;
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finishLayerRename(event.key === 'Enter', true);
          }
        };
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save';
        save.onclick = () => finishLayerRename(true, true);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.onclick = () => finishLayerRename(false, true);
        editor.append(input, save, cancel);
        row.append(editor);
      } else row.append(button, visibilityButton, renameButton, removeButton);
      layerList.append(row);
    }
    if (focusedId) {
      const focusTarget = layerList.querySelector(`.${focusedControl}[data-layer-id="${focusedId}"]:not(:disabled)`) ||
        layerList.querySelector('.layer-rename-input') ||
        layerList.querySelector(`.layer-select[data-layer-id="${selectedLayerId}"]`);
      focusTarget.focus({ preventScroll: true });
    }
    const selected = selectedLayer();
    const selectedIndex = layers.indexOf(selected);
    layerUpButton.disabled = selectedIndex === layers.length - 1;
    layerDownButton.disabled = selectedIndex === 0;
    layerUpButton.title = `Move ${selected.name} up (toward the front)`;
    layerDownButton.title = `Move ${selected.name} down (toward the back)`;
    layersToggle.title = selected.visible ? `Layers — drawing on ${selected.name}` : `Layers — ${selected.name} is hidden`;
    canvas.dataset.layerHidden = String(!selected.visible);
    layerHint.hidden = selected.visible;
    layerHint.textContent = selected.visible ? '' : `${selected.name} is hidden. Show it with the eye button or select a visible layer to draw.`;
  }

  function moveSelectedLayer(direction) {
    const index = layers.findIndex(item => item.id === selectedLayerId);
    const target = index + direction;
    if (target < 0 || target >= layers.length) return;
    settleDrawing();
    const before = snapshot();
    [layers[index], layers[target]] = [layers[target], layers[index]];
    recordAction(before);
    render();
    updateLayers();
    updateHistoryButtons();
    const selectedButton = layerList.querySelector(`.layer-select[data-layer-id="${selectedLayerId}"]`);
    selectedButton.scrollIntoView({ block: 'nearest' });
    const moveButton = direction === 1 ? layerUpButton : layerDownButton;
    (moveButton.disabled ? selectedButton : moveButton).focus({ preventScroll: true });
    document.querySelector('#layer-order-status').textContent =
      `${selectedLayer().name} moved ${direction === 1 ? 'up' : 'down'}. Position ${layers.length - target} of ${layers.length}, front to back.`;
  }
  layerUpButton.onclick = () => moveSelectedLayer(1);
  layerDownButton.onclick = () => moveSelectedLayer(-1);

  function finishLayerRename(commit = true, restoreFocus = false) {
    if (!layerRename) return;
    const { id, name } = layerRename;
    layerRename = null;
    const item = layers.find(item => item.id === id);
    const trimmed = name.trim();
    if (commit && item && trimmed && trimmed !== item.name) {
      const before = snapshot();
      item.name = trimmed;
      recordAction(before);
    }
    updateLayers();
    updateHistoryButtons();
    if (restoreFocus) layerList.querySelector(`.layer-rename[data-layer-id="${id}"]`).focus({ preventScroll: true });
  }

  function removeLayer(id) {
    const index = layers.findIndex(item => item.id === id);
    if (layers.length === 1 || index === -1) return;
    settleDrawing();
    const before = snapshot();
    layers.splice(index, 1);
    if (selectedLayerId === id) selectedLayerId = layers[Math.max(0, index - 1)].id;
    recordAction(before);
    rebuildPaper();
    updateLayers();
    updateHistoryButtons();
    layerList.querySelector(`.layer-select[data-layer-id="${selectedLayerId}"]`).focus({ preventScroll: true });
  }

  function setLayersOpen(open) {
    if (!open) finishLayerRename();
    layersPicker.open = open;
    layersToggle.setAttribute('aria-expanded', String(open));
    if (open) document.querySelector('#layer-add').focus({ preventScroll: true });
    else layersToggle.focus({ preventScroll: true });
  }
  // Let the native disclosure open even before the drawing code has initialized.
  layersPicker.ontoggle = () => setLayersOpen(layersPicker.open);
  document.querySelector('#layers-close').onclick = () => setLayersOpen(false);
  layersPanel.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (layerRename) finishLayerRename(false, true);
      else setLayersOpen(false);
    }
  };
  document.querySelector('#layer-add').onclick = () => {
    settleDrawing();
    const before = snapshot();
    const id = nextLayerId++;
    layers.push({ id, name: `Layer ${id}`, visible: true, strokes: [] });
    selectedLayerId = id;
    recordAction(before);
    updateLayers();
    updateHistoryButtons();
    layerList.querySelector(`[data-layer-id="${id}"]`).scrollIntoView({ block: 'nearest' });
  };

  function restoreSnapshot(state) {
    layers = state.layers.map(item => ({ ...item }));
    selectedLayerId = state.selectedLayerId;
    rebuildPaper();
    updateLayers();
    updateHistoryButtons();
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
    setPickingColor(false);
    const tool = selectedTool();
    const width = widths[tool] || widths.marker;
    widthInput.disabled = tool === 'bucket';
    widthInput.min = tool === 'text' ? 8 : 1;
    widthInput.max = tool === 'text' ? 72 : 50;
    widthInput.value = width;
    widthLabel.textContent = tool === 'text' ? 'Text size' : 'Width';
    widthInput.setAttribute('aria-valuetext', `${width} pixels`);
    widthValue.value = tool === 'bucket' ? '—' : `${width} px`;
    shapeToggle.dataset.active = String(isShape(tool));
    shapeToggle.title = isShape(tool) ? `Shapes: ${tool}` : 'Choose a shape';
    shapeToggle.setAttribute('aria-label', isShape(tool) ? `Shapes: ${tool}` : 'Shapes');
    canvas.dataset.tool = tool;
  }
  widthInput.oninput = () => {
    widths[selectedTool()] = Number(widthInput.value);
    if (textDraft) {
      textDraft.size = widths.text;
      textInput.style.fontSize = `${textDraft.size}px`;
    }
    showWidth();
  };
  for (const tool of document.querySelectorAll('input[name="tool"]')) {
    tool.onchange = () => {
      clearPendingMath();
      if (selectedTool() !== 'text') finishText();
      showWidth();
    };
  }
  function selectColor(value, custom = false) {
    setPickingColor(false);
    drawingColor = value;
    for (const preset of presetColors) preset.checked = !custom && preset.value === value;
    customColor.dataset.active = String(custom);
    if (textDraft) textInput.style.color = textDraft.color = value;
  }
  for (const color of presetColors) color.onchange = () => selectColor(color.value);
  const useCustomColor = () => {
    customColor.parentElement.style.setProperty('--color', customColor.value);
    customColor.title = `Custom color: ${customColor.value.toUpperCase()}`;
    selectColor(customColor.value, true);
  };
  customColor.oninput = customColor.onchange = useCustomColor;
  // Reuse the last custom color even when the picker opens without changing it.
  customColor.onclick = useCustomColor;

  function setPickingColor(active) {
    pickingColor = active;
    eyedropper.setAttribute('aria-pressed', String(active));
    canvas.dataset.eyedropper = String(active);
    colorHint.hidden = !active;
    if (active) colorHint.textContent = 'Click or tap the drawing to pick a color. Esc to cancel.';
  }

  eyedropper.onclick = () => {
    finish();
    finishText();
    clearPendingMath();
    closeShapes();
    closeMath();
    panMode = false;
    canvas.dataset.pan = 'false';
    panButton.setAttribute('aria-pressed', 'false');
    setPickingColor(!pickingColor);
    canvas.focus({ preventScroll: true });
  };

  function pickColor(event) {
    const point = drawingPoint(event);
    const scale = window.devicePixelRatio || 1;
    const x = Math.floor(point.x * scale), y = Math.floor(point.y * scale);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    // Sample all visible layers and composite transparency onto the white board.
    const pixel = context.getImageData(x, y, 1, 1).data;
    customColor.value = '#' + [0, 1, 2].map(channel =>
      Math.round(255 + (pixel[channel] - 255) * pixel[3] / 255).toString(16).padStart(2, '0')
    ).join('');
    useCustomColor();
  }

  function closeShapes(restoreFocus = false) {
    shapePicker.open = false;
    if (restoreFocus || shapeOptions.contains(document.activeElement)) shapeToggle.focus();
  }

  function focusShape() {
    (shapeInputs.find(input => input.checked) || shapeInputs[0]).focus({ preventScroll: true });
  }

  shapeToggle.onpointerdown = () => { focusShapesOnOpen = false; };
  shapeToggle.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') focusShapesOnOpen = true;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      shapePicker.open = true;
      focusShape();
    }
  };
  shapePicker.ontoggle = () => {
    if (shapePicker.open) closeMath();
    if (shapePicker.open && focusShapesOnOpen) focusShape();
    focusShapesOnOpen = false;
  };
  shapePicker.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeShapes(true);
    } else if (shapeInputs.includes(event.target) && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.target.checked = true;
      clearPendingMath();
      finishText();
      showWidth();
      closeShapes(true);
    }
  };
  for (const input of document.querySelectorAll('input[name="tool"]')) {
    input.onclick = (event) => {
      clearPendingMath();
      // Arrow-key selection stays open; pointer selection finishes the choice.
      if (shapePicker.open && (!isShape(input.value) || event.detail > 0)) {
        closeShapes(isShape(input.value));
      }
    };
  }
  document.addEventListener('pointerdown', (event) => {
    if (shapePicker.open && !shapePicker.contains(event.target)) closeShapes();
    if (mathPicker.open && !mathPicker.contains(event.target)) closeMath();
  });
  shapePicker.onfocusout = (event) => {
    if (!shapePicker.contains(event.relatedTarget)) closeShapes();
  };

  function clearPendingMath() {
    pendingMath = '';
    mathHint.hidden = true;
    mathToggle.dataset.active = 'false';
    updateHistoryButtons();
  }

  function closeMath(restoreFocus = false) {
    mathPicker.open = false;
    if (restoreFocus || mathOptions.contains(document.activeElement)) mathToggle.focus();
  }

  mathToggle.onpointerdown = () => { focusMathOnOpen = false; };
  mathToggle.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') focusMathOnOpen = true;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      mathPicker.open = true;
      mathButtons[0].focus();
    }
  };
  mathPicker.ontoggle = () => {
    if (mathPicker.open) {
      closeShapes();
      if (focusMathOnOpen) mathButtons[0].focus();
    }
    focusMathOnOpen = false;
  };
  mathPicker.onfocusout = (event) => {
    if (!mathPicker.contains(event.relatedTarget)) closeMath();
  };
  mathPicker.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMath(true);
      return;
    }
    const index = mathButtons.indexOf(event.target);
    const direction = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
    if (index !== -1 && (event.key in direction || event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? mathButtons.length - 1 :
        (index + direction[event.key] + mathButtons.length) % mathButtons.length;
      mathButtons[next].focus();
    }
  };
  for (const button of mathButtons) {
    button.onclick = () => {
      const symbol = button.dataset.math;
      closeMath();
      document.querySelector('input[value="text"]').checked = true;
      showWidth();
      if (textDraft) {
        textInput.setRangeText(symbol, textInput.selectionStart, textInput.selectionEnd, 'end');
        textInput.focus({ preventScroll: true });
      } else {
        pendingMath += symbol;
        mathHint.textContent = `Click the canvas to place ${pendingMath}. Esc to cancel.`;
        mathHint.hidden = false;
        mathToggle.dataset.active = 'true';
        canvas.focus({ preventScroll: true });
      }
      updateHistoryButtons();
    };
  }

  function dot(point) {
    layerContext.beginPath();
    layerContext.arc(point.x, point.y, point.width / 2, 0, Math.PI * 2);
    layerContext.fill();
  }

  // Build an opaque stroke first, so highlighter segments don't darken at every join.
  function paintStroke(target, stroke) {
    if (stroke.type === 'bucket') {
      const scale = window.devicePixelRatio || 1;
      target.save();
      target.setTransform(scale, 0, 0, scale, 0, 0);
      target.drawImage(stroke.patch, stroke.x, stroke.y, stroke.width, stroke.height);
      target.restore();
      return;
    }
    layerContext.clearRect(0, 0, layer.width, layer.height);
    layerContext.fillStyle = layerContext.strokeStyle = stroke.color;
    const points = stroke.points;
    const first = points[0];
    if (stroke.type === 'text') {
      layerContext.font = `${stroke.width}px system-ui, sans-serif`;
      layerContext.textBaseline = 'top';
      stroke.text.split('\n').forEach((line, index) => {
        layerContext.fillText(line, first.x, first.y + index * stroke.width * 1.3);
      });
    } else if (isShape(stroke.type)) {
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
    for (const item of layers) {
      if (!item.visible) continue;
      const surface = layerSurface(item.id);
      if (activeStroke && activeStroke.layerId === item.id) {
        // Erasing the preview must reveal lower layers, not erase the composite.
        paperContext.clearRect(0, 0, paper.width, paper.height);
        paperContext.drawImage(surface, 0, 0);
        paintStroke(paperContext, activeStroke);
        context.drawImage(paper, 0, 0);
      } else context.drawImage(surface, 0, 0);
    }
  }

  function drawingPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom };
  }

  function layoutView() {
    const left = Math.max(0, (viewport.clientWidth - boardWidth * zoom) / 2);
    const top = Math.max(0, (viewport.clientHeight - boardHeight * zoom) / 2);
    extent.style.width = `${Math.max(viewport.clientWidth, boardWidth * zoom)}px`;
    extent.style.height = `${Math.max(viewport.clientHeight, boardHeight * zoom)}px`;
    board.style.width = `${boardWidth}px`;
    board.style.height = `${boardHeight}px`;
    board.style.transform = `translate(${left}px, ${top}px) scale(${zoom})`;
    zoomReset.textContent = `${Math.round(zoom * 100)}%`;
    zoomReset.setAttribute('aria-label', `Zoom ${Math.round(zoom * 100)}%. Reset view to 100%`);
    zoomOut.disabled = zoom === zoomLevels[0];
    zoomIn.disabled = zoom === zoomLevels.at(-1);
    return { left, top };
  }

  function changeZoom(next, reset = false) {
    if (next === zoom && !reset) return;
    finish();
    const bounds = viewport.getBoundingClientRect();
    const center = drawingPoint({ clientX: bounds.left + viewport.clientWidth / 2,
      clientY: bounds.top + viewport.clientHeight / 2 });
    zoom = next;
    const offset = layoutView();
    viewport.scrollLeft = reset ? 0 : center.x * zoom + offset.left - viewport.clientWidth / 2;
    viewport.scrollTop = reset ? 0 : center.y * zoom + offset.top - viewport.clientHeight / 2;
  }
  zoomOut.onclick = () => changeZoom(zoomLevels[Math.max(0, zoomLevels.indexOf(zoom) - 1)]);
  zoomIn.onclick = () => changeZoom(zoomLevels[Math.min(zoomLevels.length - 1, zoomLevels.indexOf(zoom) + 1)]);
  zoomReset.onclick = () => changeZoom(1, true);
  panButton.onclick = () => {
    setPickingColor(false);
    finish();
    finishText();
    panMode = !panMode;
    canvas.dataset.pan = String(panMode);
    panButton.setAttribute('aria-pressed', String(panMode));
  };

  function resize() {
    // Keep artwork reachable when the window shrinks; enlarge the board as needed.
    boardWidth = Math.max(boardWidth, viewport.clientWidth);
    boardHeight = Math.max(boardHeight, viewport.clientHeight);
    layoutView();
    const scale = window.devicePixelRatio || 1;
    for (const surface of [canvas, paper, layer]) {
      surface.width = Math.round(boardWidth * scale);
      surface.height = Math.round(boardHeight * scale);
    }
    layerContext.setTransform(scale, 0, 0, scale, 0, 0);
    rebuildPaper();
    if (textDraft) positionTextEditor();
  }

  function rebuildPaper() {
    for (const id of layerSurfaces.keys()) {
      if (!layers.some(item => item.id === id)) layerSurfaces.delete(id);
    }
    for (const item of layers) {
      const target = layerSurface(item.id).getContext('2d');
      target.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of item.strokes) paintStroke(target, stroke);
    }
    render();
  }

  function fillArea(event) {
    const point = drawingPoint(event);
    const scale = window.devicePixelRatio || 1;
    const x = Math.floor(point.x * scale);
    const y = Math.floor(point.y * scale);
    if (x < 0 || y < 0 || x >= paper.width || y >= paper.height) return;
    const color = drawingColor;
    const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    const image = layerSurface(selectedLayerId).getContext('2d').getImageData(0, 0, paper.width, paper.height);
    const offset = (y * paper.width + x) * 4;
    if (image.data[offset + 3] === 255 && rgb.every((value, index) => image.data[offset + index] === value)) return;
    const spans = findFillSpans(image, x, y);
    if (!spans.length) return;
    let left = x, right = x, top = y, bottom = y;
    for (const [start, row, end] of spans) {
      left = Math.min(left, start);
      right = Math.max(right, end);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
    }
    // Save the filled region itself so resize/undo never recomputes its boundaries.
    const patch = document.createElement('canvas');
    patch.width = right - left + 1;
    patch.height = bottom - top + 1;
    const patchContext = patch.getContext('2d');
    patchContext.fillStyle = color;
    for (const [start, row, end] of spans) patchContext.fillRect(start - left, row - top, end - start + 1, 1);
    const stroke = { type: 'bucket', patch, x: left / scale, y: top / scale,
      width: patch.width / scale, height: patch.height / scale };
    appendStroke(stroke);
    render();
    updateHistoryButtons();
  }

  function appendPoint(event) {
    const previous = activeStroke.points.at(-1);
    const { x, y } = drawingPoint(event);
    if (previous && x === previous.x && y === previous.y) return;
    const point = { x, y, width: activeStroke.width };
    // Shapes keep their starting point and replace the preview endpoint as you drag.
    if (isShape(activeStroke.type) && activeStroke.points.length > 0) activeStroke.points[1] = point;
    else activeStroke.points.push(point);
  }

  function finish() {
    panStart = null;
    canvas.dataset.panning = 'false';
    if (activeStroke) {
      if (!isShape(activeStroke.type) || hasShapeSize(activeStroke)) {
        appendStroke(activeStroke, activeStroke.layerId);
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

  function positionTextEditor() {
    const height = Math.min(180, canvas.clientHeight);
    const left = Math.max(0, Math.min(textDraft.x - 9, canvas.clientWidth - 120));
    const top = Math.max(0, Math.min(textDraft.y - 9, canvas.clientHeight - height));
    textEditor.style.left = `${left}px`;
    textEditor.style.top = `${top}px`;
    textEditor.style.width = `${Math.min(280, canvas.clientWidth - left)}px`;
    textEditor.style.height = `${height}px`;
    textDraft.position = { x: left + 9, y: top + 9 };
  }

  function beginText(x, y) {
    finishLayerRename();
    finishText();
    if (!selectedLayer().visible) return;
    const initialText = pendingMath;
    clearPendingMath();
    textDraft = { x, y, size: widths.text, color: drawingColor, layerId: selectedLayerId };
    textInput.value = initialText;
    textInput.style.fontSize = `${textDraft.size}px`;
    textInput.style.color = textDraft.color;
    textEditor.hidden = false;
    positionTextEditor();
    textInput.focus({ preventScroll: true });
    textInput.setSelectionRange(initialText.length, initialText.length);
    updateHistoryButtons();
  }

  function finishText(commit = true, restoreFocus = false) {
    if (!textDraft) return;
    if (commit && textInput.value.trim()) {
      const stroke = { type: 'text', text: textInput.value.replace(/\r\n?/g, '\n'),
        width: textDraft.size, color: textDraft.color, points: [textDraft.position] };
      appendStroke(stroke, textDraft.layerId);
    }
    textDraft = null;
    textInput.value = '';
    textEditor.hidden = true;
    render();
    updateHistoryButtons();
    if (restoreFocus) canvas.focus({ preventScroll: true });
  }

  document.querySelector('#text-done').onclick = () => finishText(true, true);
  document.querySelector('#text-cancel').onclick = () => finishText(false, true);
  textInput.oninput = updateHistoryButtons;
  textInput.onkeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      event.stopPropagation();
      finishText(event.key !== 'Escape', true);
    }
  };
  canvas.onkeydown = (event) => {
    if (!pickingColor && !panMode && selectedTool() === 'text' && event.key === 'Enter') {
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      const point = drawingPoint({ clientX: bounds.left + viewport.clientWidth / 2,
        clientY: bounds.top + viewport.clientHeight / 2 });
      beginText(point.x, point.y);
    }
  };

  canvas.onpointerdown = (event) => {
    if (pointer !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    finishLayerRename();
    finishText();
    if (panMode) {
      pointer = event.pointerId;
      panStart = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      canvas.dataset.panning = 'true';
      canvas.setPointerCapture(pointer);
      return;
    }
    if (pickingColor) {
      pickColor(event);
      return;
    }
    if (!selectedLayer().visible) return;
    const type = selectedTool();
    if (type === 'bucket') {
      fillArea(event);
      return;
    }
    if (type === 'text') {
      const point = drawingPoint(event);
      beginText(point.x, point.y);
      return;
    }
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    activeStroke = { type, width: widths[type], color: drawingColor, points: [], layerId: selectedLayerId };
    appendPoint(event);
    render();
    updateHistoryButtons();
  };
  canvas.onpointermove = (event) => {
    if (event.pointerId !== pointer) return;
    if (panStart) {
      viewport.scrollLeft = panStart.left - (event.clientX - panStart.x);
      viewport.scrollTop = panStart.top - (event.clientY - panStart.y);
      return;
    }
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) appendPoint(sample);
    render();
  };
  canvas.onpointerup = (event) => {
    if (event.pointerId !== pointer) return;
    if (!panStart) appendPoint(event);
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
    finishLayerRename();
    clearPendingMath();
    finishText();
    finish();
    if (!layers.some(item => item.strokes.length)) return;
    const before = snapshot();
    for (const item of layers) item.strokes = [];
    recordAction(before);
    rebuildPaper();
    updateHistoryButtons();
  };
  undoButton.onclick = () => {
    finishLayerRename();
    clearPendingMath();
    finishText();
    finish();
    const action = undoHistory.pop();
    if (!action) return;
    redoHistory.push(action);
    restoreSnapshot(action.before);
  };
  redoButton.onclick = () => {
    finishLayerRename();
    clearPendingMath();
    finishText();
    finish();
    const action = redoHistory.pop();
    if (!action) return;
    undoHistory.push(action);
    restoreSnapshot(action.after);
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pickingColor) {
      event.preventDefault();
      setPickingColor(false);
      return;
    }
    if (event.key === 'Escape' && pendingMath) {
      event.preventDefault();
      clearPendingMath();
      return;
    }
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

  new ResizeObserver(resize).observe(viewport);
  window.addEventListener('resize', resize);
  resize();
  showWidth();
  updateLayers();
  document.querySelector('#tools').disabled = false;
  document.querySelector('#layer-add').disabled = false;
  updateHistoryButtons();
}

start();
