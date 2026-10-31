const MIN_SIZE = 0;
const MAX_SIZE = 100;
const MAX_CELL_SIZE = 24;
const BORDER = 1;
const BOTTOM_SPACE = 24;

const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const matrix = document.getElementById('matrix');
const toggleButton = document.getElementById('toggle');
const generationDisplay = document.getElementById('generation');
const speedInput = document.getElementById('speed');
const speedDisplay = document.getElementById('speed-value');
const predictCheckbox = document.getElementById('predict');
const predictionOverlay = document.getElementById('prediction');

// Generations per second at the slider's maximum (one every 200 ms).
const MAX_SPEED = 5;

let running = false;
// Id of the timeout that computes the next generation; null when none is due.
let generationTimer = null;
// When the last generation was computed, so speed changes keep the elapsed time.
let lastGenerationTime = 0;
// Id of the timeout that shows the prediction halfway through an interval.
let predictionTimer = null;
// The next generation shown in the overlay; null while the overlay is hidden.
let predictedCells = null;
// Generations computed since the current run was started.
let generation = 0;

function showGeneration(value) {
  generation = value;
  generationDisplay.textContent = value;
}

// Green cells, keyed by "row,col", so they survive resizing the matrix.
const aliveCells = new Set();

// Parses an input value and keeps it within the allowed range.
function readSize(input) {
  const value = parseInt(input.value, 10);
  if (Number.isNaN(value))
    return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value));
}

// Largest cell size that lets `count` cells and their gaps fit into `space` pixels.
function cellSizeFor(space, count, gap) {
  if (count === 0)
    return Infinity;
  return (space - 2 * BORDER - (count - 1) * gap) / count;
}

// Picks cell size and gap so the whole matrix fits in the visible screen area.
function fitMatrix() {
  const width = readSize(widthInput);
  const height = readSize(heightInput);

  const bodyStyle = getComputedStyle(document.body);
  const availableWidth = document.documentElement.clientWidth
    - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight);
  const availableHeight = window.innerHeight
    - (matrix.getBoundingClientRect().top + window.scrollY) - BOTTOM_SPACE;

  const fit = (gap) => Math.min(
    MAX_CELL_SIZE,
    cellSizeFor(availableWidth, width, gap),
    cellSizeFor(availableHeight, height, gap),
  );

  // Drop the grid lines when the cells get too small to keep them visible.
  let gap = 1;
  let cell = fit(gap);
  if (cell < 3) {
    gap = 0;
    cell = fit(gap);
  }
  // Whole pixels keep the grid crisp; tiny cells stay fractional so they still fit.
  cell = cell >= 1 ? Math.floor(cell) : Math.max(cell, 0);

  // The overlay gets the identical grid so its cells sit exactly over the matrix.
  [matrix, predictionOverlay].forEach((grid) => {
    grid.style.gap = `${gap}px`;
    grid.style.gridTemplateColumns = `repeat(${width}, ${cell}px)`;
    grid.style.gridAutoRows = `${cell}px`;
  });
}

function renderMatrix() {
  const width = readSize(widthInput);
  const height = readSize(heightInput);

  // Forget green cells that fell outside the new dimensions.
  aliveCells.forEach((key) => {
    const [row, col] = key.split(',').map(Number);
    if (row >= height || col >= width) aliveCells.delete(key);
  });

  const fragment = document.createDocumentFragment();
  const overlayFragment = document.createDocumentFragment();
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = document.createElement('div');
      const key = `${row},${col}`;
      cell.className = 'cell';
      cell.dataset.key = key;
      cell.classList.toggle('alive', aliveCells.has(key));
      fragment.appendChild(cell);

      const predictionCell = document.createElement('div');
      predictionCell.className = 'prediction-cell';
      predictionCell.dataset.key = key;
      overlayFragment.appendChild(predictionCell);
    }
  }
  matrix.replaceChildren(fragment);
  predictionOverlay.replaceChildren(overlayFragment);
  // A prediction of the old matrix no longer applies.
  hidePrediction();
  fitMatrix();
}

function setCellAlive(cell, alive) {
  // Editing the matrix makes any shown prediction outdated.
  hidePrediction();
  cell.classList.toggle('alive', alive);
  if (alive) {
    aliveCells.add(cell.dataset.key);
  } else {
    aliveCells.delete(cell.dataset.key);
  }
}

function cellAt(x, y) {
  const element = document.elementFromPoint(x, y);
  return element && matrix.contains(element) ? element.closest('.cell') : null;
}

// Painting: pressing on a cell switches it between black and green, and dragging
// paints every cell the pointer passes over with that same color.
const PAINT_STEP = 2;

let paintAlive = null;
let lastPaintedCell = null;
let lastPoint = null;

function paintAt(x, y) {
  // Touch pointers stay captured by the first cell, so look up the cell under the pointer.
  const cell = cellAt(x, y);
  if (!cell || cell === lastPaintedCell) return;
  lastPaintedCell = cell;
  setCellAlive(cell, paintAlive);
}

matrix.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || running) return;
  const cell = event.target.closest('.cell');
  if (!cell) return;
  event.preventDefault();
  paintAlive = !cell.classList.contains('alive');
  lastPaintedCell = cell;
  lastPoint = { x: event.clientX, y: event.clientY };
  setCellAlive(cell, paintAlive);
});

window.addEventListener('pointermove', (event) => {
  if (paintAlive === null) return;
  // Fast moves skip over cells between events, so paint along the whole path.
  const { x, y } = lastPoint;
  const dx = event.clientX - x;
  const dy = event.clientY - y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / PAINT_STEP));
  for (let i = 1; i <= steps; i++) {
    paintAt(x + (dx * i) / steps, y + (dy * i) / steps);
  }
  lastPoint = { x: event.clientX, y: event.clientY };
});

function stopPainting() {
  paintAlive = null;
  lastPaintedCell = null;
  lastPoint = null;
}

window.addEventListener('pointerup', stopPainting);
window.addEventListener('pointercancel', stopPainting);

// Snap out-of-range values back into the range once the user leaves the field.
function normalizeInput(input) {
  if (input.value !== '') input.value = readSize(input);
}

[widthInput, heightInput].forEach((input) => {
  input.addEventListener('input', renderMatrix);
  input.addEventListener('change', () => normalizeInput(input));
});

window.addEventListener('resize', fitMatrix);

// Calculates the next generation using Conway's rules without changing the
// matrix: a live cell with 2 or 3 live neighbours survives, a dead cell with
// exactly 3 comes alive. Cells beyond the edges count as dead.
function computeNextGeneration() {
  const width = readSize(widthInput);
  const height = readSize(heightInput);
  const next = new Set();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let neighbours = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && aliveCells.has(`${row + dr},${col + dc}`))
            neighbours++;
        }
      }
      const key = `${row},${col}`;
      if (neighbours === 3 || (neighbours === 2 && aliveCells.has(key)))
        next.add(key);
    }
  }
  return next;
}

// Shows the calculated next generation over the matrix: blue cells will be
// alive, red cells will be dead. The matrix itself is left untouched.
function showPrediction() {
  if (predictedCells === null)
    predictedCells = computeNextGeneration();
  for (const cell of predictionOverlay.children) {
    cell.classList.toggle('alive', predictedCells.has(cell.dataset.key));
  }
  predictionOverlay.classList.add('visible');
}

function hidePrediction() {
  predictedCells = null;
  predictionOverlay.classList.remove('visible');
}

// Applies the next generation to the matrix, reusing the shown prediction so
// the matrix becomes exactly what the overlay displayed.
function step() {
  const next = predictedCells ?? computeNextGeneration();
  hidePrediction();
  aliveCells.clear();
  next.forEach((key) => aliveCells.add(key));
  for (const cell of matrix.children) {
    cell.classList.toggle('alive', aliveCells.has(cell.dataset.key));
  }
  showGeneration(generation + 1);
}

function readSpeed() {
  return Math.min(MAX_SPEED, Math.max(0, parseFloat(speedInput.value) || 0));
}

function isAdvancing() {
  return running && readSpeed() > 0;
}

function isPredictionShown() {
  return predictedCells !== null;
}

function advanceGeneration() {
  lastGenerationTime = performance.now();
  step();
  scheduleNextGeneration();
}

// Plans the next generation from the current speed. Time already waited since
// the last generation counts towards the new interval, so moving the slider
// never restarts the wait. With prediction on, the overlay appears halfway
// through the interval. Speed 0 plans nothing, which pauses the simulation;
// the prediction is then shown so it can be compared with the matrix.
function scheduleNextGeneration() {
  clearTimeout(generationTimer);
  clearTimeout(predictionTimer);
  generationTimer = null;
  predictionTimer = null;
  if (!running)
    return;
  if (!isAdvancing()) {
    if (predictCheckbox.checked)
      showPrediction();
    return;
  }

  const interval = 1000 / readSpeed();
  const elapsed = performance.now() - lastGenerationTime;
  if (predictCheckbox.checked && !isPredictionShown()) {
    predictionTimer = setTimeout(showPrediction, Math.max(0, interval / 2 - elapsed));
  }
  generationTimer = setTimeout(advanceGeneration, Math.max(0, interval - elapsed));
}

// Continues after a pause or stop. A prediction left on screen is applied
// straight away, then the cycle starts over for the following generation.
function resume() {
  if (isPredictionShown()) {
    advanceGeneration();
  } else {
    scheduleNextGeneration();
  }
}

function showSpeed() {
  const speed = readSpeed();
  speedDisplay.textContent = speed === 0 ? 'Paused' : `${speed} gen/s`;
}

// The slider already holds its new value when 'input' fires, so remember the old one.
let previousSpeed = readSpeed();

speedInput.addEventListener('input', () => {
  const wasPaused = previousSpeed === 0;
  previousSpeed = readSpeed();
  showSpeed();
  if (wasPaused && isAdvancing()) {
    resume();
  } else {
    scheduleNextGeneration();
  }
});

predictCheckbox.addEventListener('change', () => {
  if (!predictCheckbox.checked)
    hidePrediction();
  scheduleNextGeneration();
});

function setRunning(isRunning) {
  running = isRunning;
  if (running) {
    stopPainting();
    showGeneration(0);
    lastGenerationTime = performance.now();
    resume();
  } else {
    scheduleNextGeneration();
    // Keep the next generation on screen so it can be checked against the matrix.
    if (predictCheckbox.checked) showPrediction();
  }
  widthInput.disabled = running;
  heightInput.disabled = running;
  matrix.classList.toggle('locked', running);
  toggleButton.classList.toggle('running', running);
  toggleButton.textContent = running ? 'Stop' : 'Start';
}

toggleButton.addEventListener('click', () => setRunning(!running));

speedInput.max = MAX_SPEED;
showSpeed();

renderMatrix();
