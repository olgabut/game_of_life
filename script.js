const MIN_SIZE = 0;
const MAX_SIZE = 100;
const MAX_CELL_SIZE = 24;
const BORDER = 1;
const BOTTOM_SPACE = 24;

const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const matrix = document.getElementById('matrix');
const toggleButton = document.getElementById('toggle');
const iterationsDisplay = document.getElementById('iterations');

const STEP_INTERVAL = 200;
// Id of the interval advancing the simulation; null while stopped.
let simulationTimer = null;
// Generations computed since the current run was started.
let iterations = 0;

function showIterations(value) {
  iterations = value;
  iterationsDisplay.textContent = value;
}

// Parses an input value and keeps it within the allowed range.
function readSize(input) {
  const value = parseInt(input.value, 10);
  if (Number.isNaN(value)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value));
}

// Largest cell size that lets `count` cells and their gaps fit into `space` pixels.
function cellSizeFor(space, count, gap) {
  if (count === 0) return Infinity;
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

  matrix.style.gap = `${gap}px`;
  matrix.style.gridTemplateColumns = `repeat(${width}, ${cell}px)`;
  matrix.style.gridAutoRows = `${cell}px`;
}

// Green cells, keyed by "row,col", so they survive resizing the matrix.
const aliveCells = new Set();

function renderMatrix() {
  const width = readSize(widthInput);
  const height = readSize(heightInput);

  // Forget green cells that fell outside the new dimensions.
  aliveCells.forEach((key) => {
    const [row, col] = key.split(',').map(Number);
    if (row >= height || col >= width) aliveCells.delete(key);
  });

  const fragment = document.createDocumentFragment();
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = document.createElement('div');
      const key = `${row},${col}`;
      cell.className = 'cell';
      cell.dataset.key = key;
      cell.classList.toggle('alive', aliveCells.has(key));
      fragment.appendChild(cell);
    }
  }
  matrix.replaceChildren(fragment);
  fitMatrix();
}

function setCellAlive(cell, alive) {
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
  if (event.button !== 0 || simulationTimer !== null) return;
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

// Advances one generation using Conway's rules: a live cell with 2 or 3 live
// neighbours survives, a dead cell with exactly 3 comes alive. Cells beyond the
// edges count as dead.
function step() {
  const width = readSize(widthInput);
  const height = readSize(heightInput);
  const next = new Set();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let neighbours = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && aliveCells.has(`${row + dr},${col + dc}`)) neighbours++;
        }
      }
      const key = `${row},${col}`;
      if (neighbours === 3 || (neighbours === 2 && aliveCells.has(key))) next.add(key);
    }
  }

  aliveCells.clear();
  next.forEach((key) => aliveCells.add(key));
  for (const cell of matrix.children) {
    cell.classList.toggle('alive', aliveCells.has(cell.dataset.key));
  }
  showIterations(iterations + 1);
}

function setRunning(running) {
  if (running) {
    stopPainting();
    showIterations(0);
    simulationTimer = setInterval(step, STEP_INTERVAL);
  } else {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
  widthInput.disabled = running;
  heightInput.disabled = running;
  matrix.classList.toggle('locked', running);
  toggleButton.classList.toggle('running', running);
  toggleButton.textContent = running ? 'Stop' : 'Start';
}

toggleButton.addEventListener('click', () => setRunning(simulationTimer === null));

renderMatrix();
