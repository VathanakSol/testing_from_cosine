/**
 * Simple Visual Novel Engine Demo
 * - Title screen with Continue / Start New Game
 * - Two demo scenes with a choice
 * - Typing dialogue, click or Space/Enter to advance/skip
 * - Scene change wipe-left transition; portrait mounts after wipe
 * - Optional BGM with mute toggle (top-left)
 * - Choices overlay; affects state
 * - Dev console overlay with jump/inspect hooks
 * - Visual polish: theme toggle, title particles, parallax
 * - Story select: choose route from title screen
 */

const $ = (sel) => document.querySelector(sel);
const $ = (sel) => Array.from(document.querySelectorAll(sel));

/* DOM refs */
const titleScreen = $("#title-screen");
const continueBtn = $("#continue-btn");
const newGameBtn = $("#newgame-btn");
const themeToggleBtn = $("#theme-toggle");
const devToggleBtn = $("#devconsole-toggle");
const titleParticlesCanvas = $("#title-particles");

const gameScreen = $("#game-screen");
const bgImage = $("#bg-image");
const portraitImage = $("#portrait-image");
const wipeOverlay = $("#wipe-overlay");
const bgm = $("#bgm");
const muteBtn = $("#mute-btn");

const dialogueLayer = $("#dialogue-layer");
const nameTag = $("#name-tag");
const dialogueBox = $("#dialogue-box");
const dialogueSpeaker = $("#dialogue-speaker");
const dialogueText = $("#dialogue-text");

const choicesOverlay = $("#choices-overlay");
const choicesContainer = $("#choices-container");
const choicesCancelBtn = $("#choices-cancel");

const devConsole = $("#dev-console");
const devConsoleClose = $("#devconsole-close");
const devSkipToEnd = $("#dev-skip-to-end");
const devState = $("#dev-state");

/* Persistence */
const STORAGE_KEY = "vn_save_v1";
const SETTINGS_KEY = "vn_settings_v1";

/* Engine State */
const Engine = {
  sceneId: null,
  lineIndex: 0,
  typing: false,
  typeSpeed: 25,
  textBuffer: "",
  flags: {}, // choice flags or conditions
  seenScenes: new Set(),
  theme: "light",
};

/* Settings */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme || "light");
  Engine.theme = theme || "light";
}
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof s.muted === "boolean") bgm.muted = s.muted;
    if (s.theme) applyTheme(s.theme);
  } catch {}
  updateMuteIcon();
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: bgm.muted, theme: Engine.theme }));
}

function hasSave() {
  return !!localStorage.getItem(STORAGE_KEY);
}
function saveGame() {
  const payload = {
    sceneId: Engine.sceneId,
    lineIndex: Engine.lineIndex,
    flags: Engine.flags,
    seenScenes: Array.from(Engine.seenScenes),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!data.sceneId) return false;
    Engine.sceneId = data.sceneId;
    Engine.lineIndex = data.lineIndex || 0;
    Engine.flags = data.flags || {};
    Engine.seenScenes = new Set(data.seenScenes || []);
    return true;
  } catch {
    return false;
  }
}
function clearSave() {
  localStorage.removeItem(STORAGE_KEY);
}

/* Content model */
const Scenes = {
  scene1: {
    id: "scene1",
    bg: "assets/images/bg/bg_home.png",
    portrait: "assets/images/char/char_a.png",
    music: null, // provide an audio path if available, will loop
    lines: [
      { name: "Narrator", text: "A soft breeze greets the morning. Another day, another story waiting to be written." },
      { name: "Alex", text: "Hah... I really should head out before I'm late again." },
      { name: "Alex", text: "Still, I can't shake this feeling—like something is about to change." },
      { name: "Narrator", text: "On the way, a thought lingers. Do you embrace the unknown, or play it safe?" },
      { type: "choice", prompt: "What do you do?", options: [
        { text: "Take a detour through the park", set: { tookPark: true }, next: "scene2" },
        { text: "Stick to the usual route", set: { tookPark: false }, next: "scene2" },
      ]},
    ],
  },
  scene2: {
    id: "scene2",
    bg: "assets/images/bg/bg_classroom.png",
    portrait: "assets/images/char/char_b.png",
    music: null,
    lines: [
      { name: "Narrator", text: "Later that day, the classroom buzzes with quiet anticipation." },
      { name: "Taylor", text: "You're here! I saved you a seat." },
      { name: "Alex", text: "Thanks. By the way... I took a moment to think this morning." },
      { name: "Taylor", text: (state) => state.flags.tookPark
          ? "Through the park again? You and your scenic routes."
          : "Stuck to the plan, huh? Reliable as always." },
      { name: "Narrator", text: "The bell rings. A new chapter begins." },
      { name: "System", text: "Demo complete. Replay from the title screen?", end: true },
    ],
  }
};

/* Additional scenes for Festival route */
Scenes.fest1 = {
  id: "fest1",
  bg: "assets/images/bg/bg_classroom.png",
  portrait: "assets/images/char/char_a.png",
  music: null,
  lines: [
    { name: "Narrator", text: "The school festival is in full swing. Laughter echoes across the courtyard." },
    { name: "Alex", text: "Looks like everyone's here. Where should I start?" },
    { type: "choice", prompt: "First stop?", options: [
      { text: "Try the food stalls", set: { festFood: true }, next: "fest2" },
      { text: "Visit the game booths", set: { festFood: false }, next: "fest2" },
    ]},
  ],
};
Scenes.fest2 = {
  id: "fest2",
  bg: "assets/images/bg/bg_classroom.png",
  portrait: "assets/images/char/char_b.png",
  music: null,
  lines: [
    { name: "Taylor", text: (state) => state.flags.festFood ? "You caught the chef's special? Save me a bite!" : "Beat the high score already? Show-off." },
    { name: "Narrator", text: "As the sun dips, the festival lights brighten. A memorable day draws to a close." },
    { name: "System", text: "Festival route complete. Return to title?", end: true },
  ],
};

/* Title Screen initialization */
function updateTitleScreen() {
  titleScreen.classList.add("active");
  gameScreen.classList.remove("active");
  continueBtn.disabled = !hasSave();
  startTitleParticles();
}
function goToTitle() {
  stopBgm();
  hideOverlay(choicesOverlay);
  hideOverlay(devConsole);
  titleScreen.classList.add("active");
  gameScreen.classList.remove("active");
  continueBtn.disabled = !hasSave();
  startTitleParticles();
}

/* Scene rendering */
async function startNewGame() {
  clearSave();
  Engine.sceneId = "scene1";
  Engine.lineIndex = 0;
  Engine.flags = {};
  Engine.seenScenes = new Set();
  await enterGame();
}
async function continueGame() {
  if (!loadGame()) return;
  await enterGame();
}

async function enterGame() {
  stopTitleParticles();
  titleScreen.classList.remove("active");
  gameScreen.classList.add("active");
  await showScene(Engine.sceneId, { wipe: true, fromStart: Engine.lineIndex === 0 });
  await playLoopIfAny(Scenes[Engine.sceneId].music);
  renderDevState();
}

function setBackground(src) {
  bgImage.src = src || "";
}
function setPortrait(src) {
  if (src) {
    portraitImage.src = src;
    portraitImage.classList.remove("show");
    portraitImage.style.display = "block";
    requestAnimationFrame(() => {
      portraitImage.classList.add("show");
    });
  } else {
    portraitImage.classList.remove("show");
    portraitImage.style.display = "none";
    portraitImage.removeAttribute("src");
  }
}

function stopBgm() {
  bgm.pause();
  bgm.removeAttribute("src");
}

async function playLoopIfAny(src) {
  if (!src) return;
  if (bgm.src.endsWith(src)) {
    bgm.play().catch(() => {});
    return;
  }
  bgm.src = src;
  try { await bgm.play(); } catch {}
}

function updateMuteIcon() {
  muteBtn.textContent = bgm.muted ? "🔈" : "🔇";
}

/* Wipe transition: mount bg immediately, delay portrait until after wipe */
async function wipeTransition() {
  gameScreen.classList.add("wiping");
  await new Promise((res) => {
    const handler = () => { wipeOverlay.removeEventListener("animationend", handler); res(); };
    wipeOverlay.addEventListener("animationend", handler, { once: true });
  });
  gameScreen.classList.remove("wiping");
}

async function showScene(id, { wipe = true, fromStart = true } = {}) {
  const scene = Scenes[id];
  if (!scene) return;
  Engine.sceneId = id;
  Engine.seenScenes.add(id);
  if (fromStart) Engine.lineIndex = 0;

  setBackground(scene.bg);
  const portraitSrc = scene.portrait;

  if (wipe) {
    setPortrait(null);
    await nextAnimationFrame();
    await wipeTransition();
  }

  setPortrait(portraitSrc);
  await playLoopIfAny(scene.music);
  await runDialogueLoop(scene);
}

async function runDialogueLoop(scene) {
  while (Engine.sceneId === scene.id && Engine.lineIndex < scene.lines.length) {
    const entry = scene.lines[Engine.lineIndex];

    if (entry && entry.type === "choice") {
      await presentChoice(entry);
      Engine.lineIndex++;
      saveGame();
      continue;
    }

    if (entry && entry.end) {
      await typeLine(entry.name || null, entry.text);
      await waitForAdvance();
      goToTitle();
      return;
    }

    const name = entry.name || null;
    const text = typeof entry.text === "function" ? entry.text(Engine) : entry.text;
    await typeLine(name, text);
    await waitForAdvance();

    Engine.lineIndex++;
    saveGame();
  }

  goToTitle();
}

/* Typing system */
function setNameTag(maybe) {
  nameTag.style.display = "none";
}

async function typeLine(name, text) {
  dialogueSpeaker.textContent = name ? String(name) : "";
  dialogueSpeaker.style.display = name ? "block" : "none";

  const full = String(text);
  dialogueText.textContent = "";
  dialogueBox.classList.remove("ready");
  Engine.typing = true;

  const skipHandler = () => {
    if (Engine.typing) {
      Engine.typing = false;
      dialogueText.textContent = full;
    }
  };
  dialogueBox.addEventListener("click", skipHandler, { capture: true, once: true });

  const chars = [...full];
  for (let i = 0; i < chars.length; i++) {
    if (!Engine.typing) break;
    dialogueText.textContent += chars[i];
    await delay(Engine.typeSpeed);
  }

  if (!Engine.typing) {
    dialogueText.textContent = full;
  }
  Engine.typing = false;
  dialogueBox.classList.add("ready");
}

function waitForAdvance() {
  return new Promise((resolve) => {
    const finishTyping = () => {
      Engine.typing = false;
    };
    const proceed = () => {
      cleanup();
      resolve();
    };
    const handler = () => {
      if (Engine.typing) {
        finishTyping();
        return;
      }
      proceed();
    };
    const keyHandler = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handler();
      }
    };
    const clickHandler = (e) => {
      if (e.target.closest("#dialogue-box")) {
        handler();
      }
    };
    function cleanup() {
      dialogueBox.removeEventListener("click", clickHandler);
      window.removeEventListener("keydown", keyHandler);
    }
    dialogueBox.addEventListener("click", clickHandler);
    window.addEventListener("keydown", keyHandler);
  });
}

/* Choices */
function presentChoice(entry) {
  return new Promise((resolve) => {
    choicesContainer.innerHTML = "";
    entry.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => {
        if (opt.set) Object.assign(Engine.flags, opt.set);
        if (opt.next && Scenes[opt.next]) {
          Engine.sceneId = opt.next;
          Engine.lineIndex = 0;
          saveGame();
          hideOverlay(choicesOverlay);
          showScene(opt.next, { wipe: true, fromStart: true }).then(resolve);
          return;
        }
        hideOverlay(choicesOverlay);
        resolve();
      });
      choicesContainer.appendChild(btn);
    });

    choicesCancelBtn.classList.add("hidden");
    showOverlay(choicesOverlay);
  });
}

/* Overlays */
function showOverlay(el) {
  el.classList.remove("hidden");
}
function hideOverlay(el) {
  el.classList.add("hidden");
}

/* Utils */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function nextAnimationFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/* Dev Console */
function toggleDevConsole(show) {
  if (typeof show === "boolean") {
    show ? showOverlay(devConsole) : hideOverlay(devConsole);
  } else {
    devConsole.classList.contains("hidden") ? showOverlay(devConsole) : hideOverlay(devConsole);
  }
  renderDevState();
}
function renderDevState() {
  const snapshot = {
    sceneId: Engine.sceneId,
    lineIndex: Engine.lineIndex,
    flags: Engine.flags,
    seenScenes: Array.from(Engine.seenScenes),
    hasSave: hasSave(),
    muted: bgm.muted,
    theme: Engine.theme,
  };
  devState.textContent = JSON.stringify(snapshot, null, 2);
}

/* Title particles */
let particleRAF = null;
let particles = [];
function startTitleParticles() {
  if (!titleParticlesCanvas) return;
  resizeParticlesCanvas();
  particles = createParticles(40);
  if (particleRAF) cancelAnimationFrame(particleRAF);
  const ctx = titleParticlesCanvas.getContext("2d");
  function step() {
    ctx.clearRect(0, 0, titleParticlesCanvas.width, titleParticlesCanvas.height);
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -p.r) p.x = titleParticlesCanvas.width + p.r;
      if (p.x > titleParticlesCanvas.width + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = titleParticlesCanvas.height + p.r;
      if (p.y > titleParticlesCanvas.height + p.r) p.y = -p.r;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "#fde68a";
      ctx.fill();
    });
    particleRAF = requestAnimationFrame(step);
  }
  step();
  window.addEventListener("resize", resizeParticlesCanvas);
}
function stopTitleParticles() {
  if (particleRAF) {
    cancelAnimationFrame(particleRAF);
    particleRAF = null;
  }
  window.removeEventListener("resize", resizeParticlesCanvas);
  if (titleParticlesCanvas) {
    const ctx = titleParticlesCanvas.getContext("2d");
    ctx.clearRect(0, 0, titleParticlesCanvas.width, titleParticlesCanvas.height);
  }
}
function resizeParticlesCanvas() {
  if (!titleParticlesCanvas) return;
  titleParticlesCanvas.width = titleScreen.clientWidth;
  titleParticlesCanvas.height = titleScreen.clientHeight;
}
function createParticles(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: Math.random() * titleParticlesCanvas.width,
      y: Math.random() * titleParticlesCanvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1 + Math.random() * 2.5,
      alpha: 0.25 + Math.random() * 0.5,
    });
  }
  return arr;
}

/* Parallax */
function setupParallax() {
  const maxBg = 6;      // px
  const maxPortrait = 8; // px
  gameScreen.addEventListener("mousemove", (e) => {
    const rect = gameScreen.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    bgImage.style.transform = `translate(${(-dx * maxBg).toFixed(2)}px, ${(-dy * maxBg).toFixed(2)}px)`;
    portraitImage.style.transform = `translate(calc(-50% + ${ (dx * maxPortrait).toFixed(2)}px), ${ (dy * maxPortrait).toFixed(2)}px)`;
  });
  gameScreen.addEventListener("mouseleave", () => {
    bgImage.style.transform = "translate(0, 0)";
    portraitImage.style.transform = "translateX(-50%)";
  });
}

/* Story selection */
const Routes = [
  { id: "route_morning", title: "Morning Routine", description: "Start at home and decide your path to class.", startScene: "scene1" },
  { id: "route_festival", title: "Festival Day", description: "Begin at the school festival with new choices.", startScene: "fest1" },
];

/* Title: story select overlay handling */
function openStorySelect() {
  const list = document.getElementById("story-list");
  list.innerHTML = "";
  Routes.forEach((r) => {
    const item = document.createElement("div");
    item.className = "story-item";
    const info = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = r.title;
    const desc = document.createElement("p");
    desc.textContent = r.description;
    info.appendChild(title);
    info.appendChild(desc);
    const actions = document.createElement("div");
    actions.className = "actions";
    const startBtn = document.createElement("button");
    startBtn.className = "secondary small";
    startBtn.textContent = "Start";
    startBtn.addEventListener("click", () => startRoute(r));
    actions.appendChild(startBtn);
    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  });
  showOverlay(document.getElementById("story-select"));
}
function closeStorySelect() {
  hideOverlay(document.getElementById("story-select"));
}
function startRoute(route) {
  clearSave();
  Engine.sceneId = route.startScene;
  Engine.lineIndex = 0;
  Engine.flags = {};
  Engine.seenScenes = new Set();
  closeStorySelect();
  enterGame();
}

/* Event wiring */
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  updateTitleScreen();

  if (hasSave()) continueBtn.removeAttribute("disabled");

  continueBtn.addEventListener("click", continueGame);
  newGameBtn.addEventListener("click", startNewGame);

  document.getElementById("storyselect-btn")?.addEventListener("click", openStorySelect);
  document.getElementById("storyselect-close")?.addEventListener("click", closeStorySelect);

  themeToggleBtn?.addEventListener("click", () => {
    applyTheme(Engine.theme === "light" ? "dark" : "light");
    saveSettings();
  });

  muteBtn.addEventListener("click", () => {
    bgm.muted = !bgm.muted;
    updateMuteIcon();
    saveSettings();
  });

  setupParallax();

  devToggleBtn.addEventListener("click", () => toggleDevConsole());
  devConsoleClose.addEventListener("click", () => toggleDevConsole(false));
  devSkipToEnd.addEventListener("click", () => {
    const s = Scenes[Engine.sceneId || "scene1"];
    Engine.sceneId = s.id;
    Engine.lineIndex = s.lines.length - 1;
    saveGame();
    if (!gameScreen.classList.contains("active")) enterGame();
    toggleDevConsole(false);
    renderDevState();
  });

  $("#dev-console .dev-actions button[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-jump");
      if (Scenes[target]) {
        Engine.sceneId = target;
        Engine.lineIndex = 0;
        saveGame();
        if (!gameScreen.classList.contains("active")) enterGame();
        else showScene(target, { wipe: true, fromStart: true });
        toggleDevConsole(false);
      }
    });
  });
});