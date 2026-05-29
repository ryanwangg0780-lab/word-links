const size = 13;
const center = Math.floor(size / 2);
const boardEl = document.querySelector("#board");
const rackEl = document.querySelector("#rack");
const linkLayer = document.querySelector("#link-layer");
const scoreEl = document.querySelector("#score");
const linksEl = document.querySelector("#links");
const timerEl = document.querySelector("#timer");
const messageEl = document.querySelector("#message");
const wordInput = document.querySelector("#word-input");
const form = document.querySelector("#play-form");
const canvas = document.querySelector("#spark-field");
const ctx = canvas.getContext("2d");

const letters = "EEEEEEEEEEEAAAAAAAIIIIIIIOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ";
const hintWords = [
  "LINK", "WORD", "WORDS", "PLAY", "GAME", "GAMES", "BOARD", "BOARDS", "CROSS", "CROSSWORD",
  "CLUE", "CLUES", "CHAIN", "CHAINS", "TILE", "TILES", "LETTER", "LETTERS", "MAKE", "MAKER",
  "BUILD", "BUILDER", "SPARK", "SPARKS", "SMART", "START", "STAR", "STARE", "RATE", "RATED",
  "READ", "READER", "LEAD", "DEAL", "IDEA", "IDEAS", "PATH", "PATHS", "SHARE", "SHARED",
  "HARD", "HARDER", "EASY", "EASE", "LINE", "LINES", "NODE", "NODES", "GRID", "GRIDS",
  "RING", "RINGS", "SCORE", "SCORES", "BONUS", "BONUSES", "LIGHT", "LIGHTS", "BRIGHT",
  "CRAFT", "CRAFTS", "TRACE", "TRACES", "LACE", "PLACE", "PLACE", "PLACES", "ARCADE",
  "BRAIN", "BRAINS", "TRAIN", "TRAINS", "TRAIL", "TRAILS", "VIBE", "VIBES", "SHIFT",
  "SHIFTS", "QUEST", "QUESTS", "QUICK", "QUIET", "NOISE", "POINT", "POINTS", "ROUND"
];
const bonuses = new Map([
  ["2,2", "2X"], ["2,10", "2X"], ["10,2", "2X"], ["10,10", "2X"],
  ["0,6", "+5"], ["6,0", "+5"], ["6,12", "+5"], ["12,6", "+5"],
  ["4,4", "+3"], ["4,8", "+3"], ["8,4", "+3"], ["8,8", "+3"]
]);

let board;
let rack;
let score;
let links;
let selected;
let seconds;
let timerId;
let particles = [];

function freshBoard() {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
}

function drawLetter() {
  return letters[Math.floor(Math.random() * letters.length)];
}

function drawRack() {
  while (rack.length < 7) {
    rack.push(drawLetter());
  }
}

function renderBoard(newCells = []) {
  boardEl.innerHTML = "";
  const fresh = new Set(newCells.map(([r, c]) => `${r},${c}`));

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.dataset.bonus = bonuses.get(`${r},${c}`) || "";
      cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);

      if (selected && selected.r === r && selected.c === c) {
        cell.classList.add("selected");
      }

      if (board[r][c]) {
        cell.classList.add("filled");
        if (fresh.has(`${r},${c}`)) cell.classList.add("new-tile");
        cell.innerHTML = `<span class="letter">${board[r][c]}</span>`;
      }

      cell.addEventListener("click", () => {
        selected = { r, c };
        renderBoard();
        setMessage(`Start square: row ${r + 1}, column ${c + 1}.`, "good");
        wordInput.focus();
      });

      boardEl.appendChild(cell);
    }
  }
}

function renderRack() {
  rackEl.innerHTML = "";
  rack.forEach((letter) => {
    const tile = document.createElement("button");
    tile.className = "rack-tile";
    tile.type = "button";
    tile.textContent = letter;
    tile.setAttribute("aria-label", `Add ${letter}`);
    tile.addEventListener("click", () => {
      wordInput.value += letter;
      wordInput.focus();
    });
    rackEl.appendChild(tile);
  });
}

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function chosenDirection() {
  return new FormData(form).get("direction");
}

function getPath(word, start, direction) {
  return [...word].map((letter, index) => ({
    letter,
    r: start.r + (direction === "down" ? index : 0),
    c: start.c + (direction === "across" ? index : 0)
  }));
}

function validateMove(word, path) {
  if (!selected) return "Pick a starting square on the board.";
  if (word.length < 3) return "Use at least three letters.";
  if (!/[AEIOUY]/.test(word)) return "Use a word with at least one vowel.";
  if (path.some(({ r, c }) => r < 0 || c < 0 || r >= size || c >= size)) return "That word runs off the board.";

  const needed = [];
  let shared = 0;

  for (const step of path) {
    const current = board[step.r][step.c];
    if (current && current !== step.letter) return "One of those squares already has a different letter.";
    if (current === step.letter) {
      shared += 1;
    } else {
      needed.push(step.letter);
    }
  }

  if (!path.some(({ r, c }) => board[r][c])) {
    return "At least one letter must link to the existing crossword.";
  }

  if (!canSpendLetters(needed)) return "Your rack does not have the new letters for that word.";

  return { needed, shared };
}

function hasNeighbor(r, c) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    return nr >= 0 && nc >= 0 && nr < size && nc < size && board[nr][nc];
  });
}

function canSpendLetters(needed) {
  const available = [...rack];
  return needed.every((letter) => {
    const index = available.indexOf(letter);
    if (index === -1) return false;
    available.splice(index, 1);
    return true;
  });
}

function spendLetters(needed) {
  needed.forEach((letter) => {
    const index = rack.indexOf(letter);
    if (index >= 0) rack.splice(index, 1);
  });
  drawRack();
}

function scoreMove(path, shared) {
  let total = path.length + shared * 4;
  for (const { r, c } of path) {
    const bonus = bonuses.get(`${r},${c}`);
    if (bonus === "2X") total *= 2;
    if (bonus === "+5") total += 5;
    if (bonus === "+3") total += 3;
  }
  return total;
}

function placeWord(event) {
  event.preventDefault();
  const word = wordInput.value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  wordInput.value = word;
  const direction = chosenDirection();
  const path = getPath(word, selected || { r: 0, c: 0 }, direction);
  const result = validateMove(word, path);

  if (typeof result === "string") {
    setMessage(result, "warn");
    return;
  }

  const newCells = [];
  path.forEach(({ r, c, letter }) => {
    if (!board[r][c]) newCells.push([r, c]);
    board[r][c] = letter;
  });

  const gained = scoreMove(path, result.shared);
  score += gained;
  links += Math.max(1, result.shared);
  seconds = Math.min(75, seconds + 8 + result.shared * 3);
  spendLetters(result.needed);
  renderBoard(newCells);
  renderRack();
  flashLinks(path);
  updateStats();
  setMessage(`Nice link. ${word} earned ${gained} points and added ${Math.max(1, result.shared)} link${result.shared === 1 ? "" : "s"}.`, "good");
  wordInput.value = "";
}

function flashLinks(path) {
  const boardRect = boardEl.getBoundingClientRect();
  const wrapRect = linkLayer.getBoundingClientRect();
  path.forEach(({ r, c }) => {
    if (!hasNeighbor(r, c)) return;
    const burst = document.createElement("span");
    burst.className = "link-flash";
    const x = (c + 0.5) * (boardRect.width / size) + boardRect.left - wrapRect.left;
    const y = (r + 0.5) * (boardRect.height / size) + boardRect.top - wrapRect.top;
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    linkLayer.appendChild(burst);
    setTimeout(() => burst.remove(), 720);
  });
}

function updateStats() {
  scoreEl.textContent = score;
  linksEl.textContent = links;
  timerEl.textContent = seconds;
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    seconds = Math.max(0, seconds - 1);
    updateStats();
    if (seconds <= 0) {
      clearInterval(timerId);
      setMessage("Time. Start a new board and try for a bigger web of words.", "warn");
    }
  }, 1000);
}

function newGame() {
  board = freshBoard();
  rack = ["L", "I", "N", "E", "S", "A", "R"];
  score = 0;
  links = 0;
  seconds = 60;
  selected = { r: center, c: center - 1 };
  "LINK".split("").forEach((letter, index) => {
    board[center][center - 1 + index] = letter;
  });
  renderBoard();
  renderRack();
  updateStats();
  startTimer();
  setMessage("The board starts with LINK. Try LINE downward from the L, or build from any matching letter.", "good");
}

function shuffleRack() {
  for (let i = rack.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rack[i], rack[j]] = [rack[j], rack[i]];
  }
  renderRack();
}

function showHint() {
  const options = hintWords.filter((word) => word.length <= 7 && canSpendLetters([...word]));
  const hint = options[Math.floor(Math.random() * options.length)] || "LINK";
  setMessage(`Try making ${hint}, or type your own word that reuses one letter already on the grid.`, "good");
}

function sizeCanvas() {
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  particles = Array.from({ length: 54 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: 1 + Math.random() * 2.4
  }));
}

function animateField() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.lineWidth = 1;
  particles.forEach((particle, index) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    if (particle.x < 0 || particle.x > window.innerWidth) particle.vx *= -1;
    if (particle.y < 0 || particle.y > window.innerHeight) particle.vy *= -1;

    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    ctx.fillStyle = index % 3 === 0 ? "rgba(57, 214, 191, 0.7)" : "rgba(255, 255, 255, 0.42)";
    ctx.fill();

    for (let i = index + 1; i < particles.length; i += 1) {
      const other = particles[i];
      const dx = particle.x - other.x;
      const dy = particle.y - other.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 118) {
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(other.x, other.y);
        ctx.strokeStyle = `rgba(99, 167, 255, ${0.18 * (1 - distance / 118)})`;
        ctx.stroke();
      }
    }
  });
  requestAnimationFrame(animateField);
}

form.addEventListener("submit", placeWord);
document.querySelector("#shuffle").addEventListener("click", shuffleRack);
document.querySelector("#hint").addEventListener("click", showHint);
document.querySelector("#new-game").addEventListener("click", newGame);
window.addEventListener("resize", sizeCanvas);

sizeCanvas();
animateField();
newGame();
