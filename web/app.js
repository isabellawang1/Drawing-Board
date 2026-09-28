// Draw directly on the browser canvas. No build step is needed.
function start() {
  const canvas = document.querySelector("canvas");
  const context = canvas.getContext("2d");
  const commands = []; // Keep the drawing when the window is resized.
  let pointer = null;
  let lastPoint = null;
  let erasing = false;
  let color = "#000000";
  let strokeWidth = 5;
  const widths = { marker: 5, eraser: 20 };
  const widthInput = document.querySelector("#brush-width");
  const widthValue = document.querySelector("#width-value");

  function selectedTool() {
    return document.querySelector('input[name="tool"]:checked').value;
  }

  function showWidth() {
    const width = widths[selectedTool()];
    widthInput.value = width;
    widthInput.setAttribute("aria-valuetext", `${width} pixels`);
    widthValue.value = `${width} px`;
  }

  widthInput.oninput = () => {
    widths[selectedTool()] = Number(widthInput.value);
    showWidth();
  };
  for (const tool of document.querySelectorAll('input[name="tool"]')) {
    tool.onchange = showWidth;
  }
  showWidth();

  function paint(x1, y1, x2, y2, width, erase, strokeColor) {
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.strokeStyle = strokeColor;
    context.fillStyle = strokeColor;
    context.lineWidth = width;
    context.lineCap = "round";
    context.beginPath();
    if (x1 === x2 && y1 === y2) {
      context.arc(x1, y1, width / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
  }

  function resize() {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * scale);
    canvas.height = Math.round(canvas.clientHeight * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    for (const command of commands) paint(...command);
  }

  function drawTo(point) {
    const command = [...lastPoint, ...point, strokeWidth, erasing, color];
    commands.push(command);
    paint(...command);
    lastPoint = point;
  }

  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  }

  function finish() {
    lastPoint = null;
    const previous = pointer;
    pointer = null;
    if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
  }

  canvas.onpointerdown = (event) => {
    if (pointer !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    erasing = document.querySelector('input[value="eraser"]').checked;
    strokeWidth = widths[selectedTool()];
    color = document.querySelector('input[name="color"]:checked').value;
    lastPoint = point(event);
    drawTo(lastPoint); // A click makes a dot, even without dragging.
  };
  canvas.onpointermove = (event) => {
    if (event.pointerId === pointer) drawTo(point(event));
  };
  canvas.onpointerup = (event) => {
    if (event.pointerId !== pointer) return;
    drawTo(point(event));
    finish();
  };
  canvas.onpointercancel = canvas.onlostpointercapture = (event) => {
    if (event.pointerId === pointer) finish();
  };
  window.addEventListener("blur", finish);
  document.querySelector("#clear").onclick = () => {
    finish();
    commands.length = 0;
    context.clearRect(0, 0, canvas.width, canvas.height);
  };

  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);
  resize();
  document.querySelector("fieldset").disabled = false;
  document.querySelector("#clear").disabled = false;
}

start();
