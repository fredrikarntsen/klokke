/* TIDSREISEN: KLOKKEMESTEREN - Versjon 3.0 (Fixed Rotation) */

// --- KONFIGURASJON ---

const LEVELS = {
    1: { name: "Hel og Halv", minutes: [0, 30], type: "analog" },
    2: { name: "Kvart over/på", minutes: [0, 15, 30, 45], type: "analog" },
    3: { name: "5 minutter", minutes: [0, 5, 10, 20, 25, 35, 40, 50, 55], type: "analog" },
    4: { name: "Nøtteknekkeren", minutes: [20, 25, 35, 40], type: "analog" }, // Rundt halv
    5: { name: "Minuttmester", minutes: "all", type: "analog" },
    6: { name: "Digital Ekspert", minutes: "all", type: "mixed" }
};

const EPOCHS = [
    { id: "stone", name: "Steinalderen", bgClass: "epoch-stone", req: 5 },
    { id: "middle", name: "Middelalderen", bgClass: "epoch-middle", req: 5 },
    { id: "modern", name: "Nåtiden", bgClass: "epoch-modern", req: 5 },
    { id: "future", name: "Fremtiden", bgClass: "epoch-future", req: 10 }
];

const SHOP_ITEMS = [
    { id: "face_default", type: "clockface", name: "Standard", cost: 0, cssClass: "" },
    { id: "face_space", type: "clockface", name: "Romfart", cost: 100, cssClass: "skin-space" },
    { id: "face_soccer", type: "clockface", name: "Fotball", cost: 150, cssClass: "skin-soccer" },
    { id: "hand_default", type: "hands", name: "Standard", cost: 0, color: "#e94560" },
    { id: "hand_gold", type: "hands", name: "Gullvisere", cost: 200, color: "#ffd700" },
    { id: "hand_blue", type: "hands", name: "Laserblå", cost: 150, color: "#00ffff" },
    { id: "bg_default", type: "background", name: "Standard", cost: 0, cssClass: "" },
];

// --- STATE ---
let state = {
    crystals: 0,
    ownedItems: ["face_default", "hand_default", "bg_default"],
    equipped: { clockface: "face_default", hands: "hand_default", background: "bg_default" },
    currentLevel: 1,
    currentEpochIndex: 0,
    questionsAnsweredInEpoch: 0,
    currentTask: null
};

// --- DOM ELEMENTER ---
const screens = {
    menu: document.getElementById('main-menu'),
    shop: document.getElementById('shop-view'),
    game: document.getElementById('game-view')
};

const ui = {
    crystalDisplays: [document.getElementById('crystal-count'), document.getElementById('menu-crystal-count')],
    levelGrid: document.getElementById('level-grid'),
    shopGrid: document.getElementById('shop-grid'),
    epochName: document.getElementById('current-epoch-name'),
    progressBar: document.getElementById('level-progress'),
    feedback: document.getElementById('feedback-msg'),
    questionText: document.getElementById('question-text'),
    digitalDisplay: document.getElementById('digital-display'),
    
    // Klokke deler
    // Merk: Vi roterer gruppene (<g>) som inneholder viserne
    hourHand: document.getElementById('hour-hand-group'),
    minuteHand: document.getElementById('minute-hand-group'),
    clockFace: document.getElementById('clock-face-circle'),
    clockNumbersGroup: document.getElementById('clock-numbers'),
    
    interactionArea: {
        quiz: document.getElementById('quiz-buttons'),
        controls: document.getElementById('clock-controls'),
        digital: document.getElementById('digital-input-area')
    },
    inputs: { h: document.getElementById('inp-hour'), m: document.getElementById('inp-min') }
};

// --- INIT ---
function init() {
    loadSaveData();
    renderLevelGrid();
    setupEventListeners();
    updateCurrencyUI();
    applyEquippedItems();
    drawClockFace(); // Tegner tallene
}

// --- TEGN TALL PÅ KLOKKA ---
function drawClockFace() {
    ui.clockNumbersGroup.innerHTML = "";
    const centerX = 150;
    const centerY = 150;
    const radius = 120; // Litt innenfor kanten (r=140)

    for (let i = 1; i <= 12; i++) {
        // 30 grader per tall. Minus 90 grader for å starte på toppen (kl 12).
        const angle = (i * 30 - 90) * (Math.PI / 180);
        
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x);
        text.setAttribute("y", y); // Sentreres via CSS dominant-baseline
        text.setAttribute("class", "clock-number");
        text.textContent = i;
        
        ui.clockNumbersGroup.appendChild(text);
    }
}

// --- VISER-ROTASJON (DEN KRITISKE FIKSEN) ---
function updateClockHands(h, m) {
    // Minuttviser: 360 grader / 60 min = 6 grader per minutt
    const mDeg = m * 6;
    
    // Timeviser: 360 grader / 12 timer = 30 grader per time.
    // Pluss 0.5 grader per minutt (30 grader / 60 min) for glidende bevegelse.
    const hDeg = (h * 30) + (m * 0.5);
    
    // VIKTIG: rotate(grader, senterX, senterY)
    // Senter er hardkodet til 150, 150 fordi viewBox er 300x300.
    ui.hourHand.setAttribute('transform', `rotate(${hDeg}, 150, 150)`);
    ui.minuteHand.setAttribute('transform', `rotate(${mDeg}, 150, 150)`);
}


// --- SPILL LOGIKK ---

function startGame(levelId) {
    state.currentLevel = levelId;
    state.currentEpochIndex = 0;
    state.questionsAnsweredInEpoch = 0;
    switchScreen('game');
    updateEpochUI();
    nextQuestion();
}

function nextQuestion() {
    const currentEpochConfig = EPOCHS[state.currentEpochIndex];
    
    // Sjekk progresjon
    if (state.questionsAnsweredInEpoch >= currentEpochConfig.req) {
        state.currentEpochIndex++;
        state.questionsAnsweredInEpoch = 0;
        if (state.currentEpochIndex >= EPOCHS.length) {
            endGame();
            return;
        }
        showFeedback("Ny Tidsalder!", true);
        updateEpochUI();
    }
    
    // Generer ny tid
    const targetTime = generateTimeForLevel(state.currentLevel);
    
    // Velg oppgavetype
    let taskType = "quiz";
    const rand = Math.random();
    
    if (state.currentLevel === 6) {
        if (rand < 0.33) taskType = "setClock";
        else if (rand < 0.66) taskType = "quiz";
        else taskType = "digitalInput";
    } else {
        taskType = rand > 0.5 ? "setClock" : "quiz";
    }

    state.currentTask = {
        targetTime: targetTime,
        type: taskType,
        userTime: { ...targetTime }
    };
    
    // Hvis oppgaven er å stille klokka, start med tilfeldig feil tid
    if (taskType === "setClock") {
        state.currentTask.userTime = { 
            h: Math.floor(Math.random() * 12) + 1, 
            m: Math.floor(Math.random() * 60) 
        };
    }

    renderQuestionUI();
}

function generateTimeForLevel(lvl) {
    const config = LEVELS[lvl];
    let h = Math.floor(Math.random() * 12) + 1;
    let m = 0;

    if (config.minutes === "all") {
        m = Math.floor(Math.random() * 60);
    } else if (Array.isArray(config.minutes)) {
        const r = Math.floor(Math.random() * config.minutes.length);
        m = config.minutes[r];
    }
    return { h, m };
}

function renderQuestionUI() {
    const task = state.currentTask;
    const timeText = timeToNorwegianText(task.targetTime.h, task.targetTime.m);
    
    // Skjul alt først
    ui.interactionArea.quiz.classList.add('hidden');
    ui.interactionArea.controls.classList.add('hidden');
    ui.interactionArea.digital.classList.add('hidden');
    ui.digitalDisplay.classList.add('hidden');

    // Oppdater klokka visuelt
    if (task.type === "setClock") {
        updateClockHands(task.userTime.h, task.userTime.m);
        ui.questionText.innerText = `Still klokka til: ${timeText}`;
        ui.interactionArea.controls.classList.remove('hidden');
        
    } else {
        // For quiz og digital input viser vi fasiten på klokka
        updateClockHands(task.targetTime.h, task.targetTime.m);
        
        if (task.type === "quiz") {
            ui.questionText.innerText = "Hva er klokka?";
            ui.interactionArea.quiz.classList.remove('hidden');
            generateQuizButtons(timeText);
        } else if (task.type === "digitalInput") {
            ui.questionText.innerText = "Skriv klokkeslettet digitalt:";
            ui.interactionArea.digital.classList.remove('hidden');
            ui.inputs.h.value = "";
            ui.inputs.m.value = "";
            ui.inputs.h.focus();
        }
    }
}

function generateQuizButtons(correctText) {
    ui.interactionArea.quiz.innerHTML = "";
    let answers = [correctText];
    while (answers.length < 3) {
        let fakeH = Math.floor(Math.random() * 12) + 1;
        let fakeM = Math.floor(Math.random() * 60);
        // Prøv å lag troverdige feil svar basert på nivået
        if (Array.isArray(LEVELS[state.currentLevel].minutes)) {
             let opts = LEVELS[state.currentLevel].minutes;
             fakeM = opts[Math.floor(Math.random() * opts.length)];
        }
        let fakeText = timeToNorwegianText(fakeH, fakeM);
        if (!answers.includes(fakeText)) answers.push(fakeText);
    }
    answers.sort(() => Math.random() - 0.5);
    answers.forEach(ans => {
        const btn = document.createElement('button');
        btn.className = "quiz-btn";
        btn.innerText = ans;
        btn.onclick = () => checkAnswer(ans === correctText);
        ui.interactionArea.quiz.appendChild(btn);
    });
}

function checkAnswer(isCorrect) {
    if (isCorrect) {
        showFeedback("Riktig! +10 💎", false);
        addCrystals(10);
        state.questionsAnsweredInEpoch++;
        updateProgressUI();
        // Vent litt før neste spørsmål så man ser at man svarte rett
        setTimeout(nextQuestion, 1500);
    } else {
        showFeedback("Prøv igjen!", false);
    }
}

// --- KNAPPER OG LOGIKK ---

// Knapp: Svar på "Still klokka"
document.getElementById('submit-clock-btn').onclick = () => {
    const target = state.currentTask.targetTime;
    const user = state.currentTask.userTime;
    
    let userH = user.h; 
    let targetH = target.h;
    
    // Tillat presis match (siden vi bruker knapper er det mulig)
    if (userH === targetH && user.m === target.m) {
        checkAnswer(true);
    } else {
        showFeedback("Feil tid. Prøv igjen!", false);
    }
};

// Knapp: Svar på "Digital input"
document.getElementById('submit-digital-btn').onclick = () => {
    const hInput = parseInt(ui.inputs.h.value);
    const mInput = parseInt(ui.inputs.m.value);
    const target = state.currentTask.targetTime;
    
    // Sjekk både 12t og 24t format (f.eks. kl 1 kan være 01 eller 13)
    let targetH = target.h;
    let targetH24 = target.h + 12; 
    
    // Spesialtilfelle: Klokka 12 kan være 00 eller 12
    const correctHour = (
        hInput === targetH || 
        hInput === targetH24 || 
        (targetH === 12 && hInput === 0)
    );
    
    if (correctHour && mInput === target.m) {
        checkAnswer(true);
    } else {
        showFeedback("Feil tall. Prøv igjen!", false);
    }
};

// Logikk for +/- knappene
window.adjustTime = function(addH, addM) {
    let t = state.currentTask.userTime;
    
    t.m += addM;
    // Rullering av minutter
    if (t.m >= 60) { t.m -= 60; t.h++; }
    if (t.m < 0) { t.m += 60; t.h--; }
    
    // Juster time hvis minutter rullet over
    t.h += addH; // (Hvis knappen var +/- time)
    
    // Rullering av timer (1-12)
    if (t.h > 12) t.h = 1;
    if (t.h < 1) t.h = 12;
    
    // Oppdater viserne visuelt
    updateClockHands(t.h, t.m);
};

// --- NORSK TEKST GENERATOR ---
function timeToNorwegianText(h, m) {
    let nextHour = h + 1;
    if (nextHour > 12) nextHour = 1;
    
    if (m === 0) return `Klokka er ${h}`;
    if (m === 15) return `Kvart over ${h}`;
    if (m === 30) return `Halv ${nextHour}`;
    if (m === 45) return `Kvart på ${nextHour}`;
    
    if (m < 20) return `${m} over ${h}`;
    
    // "På halv" sonen
    if (m >= 20 && m < 30) {
        let diff = 30 - m;
        return `${diff} på halv ${nextHour}`;
    }
    // "Over halv" sonen
    if (m > 30 && m <= 40) {
        let diff = m - 30;
        return `${diff} over halv ${nextHour}`;
    }
    
    // "På neste time" sonen
    if (m > 40) {
        let diff = 60 - m;
        return `${diff} på ${nextHour}`;
    }
    
    return `${h}:${m}`;
}

// --- BUTIKK & MENY ---
function renderLevelGrid() {
    ui.levelGrid.innerHTML = "";
    for (const [id, data] of Object.entries(LEVELS)) {
        const btn = document.createElement('div');
        btn.className = "level-btn";
        btn.innerHTML = `<strong>Nivå ${id}</strong><span>${data.name}</span>`;
        btn.onclick = () => startGame(parseInt(id));
        ui.levelGrid.appendChild(btn);
    }
}

function renderShop(category) {
    ui.shopGrid.innerHTML = "";
    const items = SHOP_ITEMS.filter(item => item.type === category);
    items.forEach(item => {
        const isOwned = state.ownedItems.includes(item.id);
        const isEquipped = state.equipped[category] === item.id;
        const div = document.createElement('div');
        div.className = `shop-item ${isOwned ? 'owned' : ''} ${isEquipped ? 'selected' : ''}`;
        div.innerHTML = `
            <div class="item-preview ${item.cssClass || ''}" style="background-color: ${item.color || '#fff'}"></div>
            <span>${item.name}</span>
            <span class="price-tag">${isOwned ? (isEquipped ? 'Valgt' : 'Eier') : item.cost + ' 💎'}</span>
        `;
        div.onclick = () => handleShopClick(item);
        ui.shopGrid.appendChild(div);
    });
}

function handleShopClick(item) {
    if (state.ownedItems.includes(item.id)) {
        state.equipped[item.type] = item.id;
        saveData();
        renderShop(item.type);
        applyEquippedItems();
    } else {
        if (state.crystals >= item.cost) {
            state.crystals -= item.cost;
            state.ownedItems.push(item.id);
            state.equipped[item.type] = item.id;
            saveData();
            updateCurrencyUI();
            renderShop(item.type);
            applyEquippedItems();
            showFeedback("Kjøpt!", false);
        } else {
            showFeedback("Ikke nok krystaller!", false);
        }
    }
}

function applyEquippedItems() {
    const faceItem = SHOP_ITEMS.find(i => i.id === state.equipped.clockface);
    if (faceItem) ui.clockFace.className.baseVal = "clock-face " + (faceItem.cssClass || "");
    
    const handItem = SHOP_ITEMS.find(i => i.id === state.equipped.hands);
    if (handItem && handItem.color) document.querySelector('.minute-hand').style.fill = handItem.color;
}

function updateEpochUI() {
    const epoch = EPOCHS[state.currentEpochIndex];
    document.body.className = epoch.bgClass;
    ui.epochName.innerText = epoch.name;
    updateProgressUI();
}

function updateProgressUI() {
    const epoch = EPOCHS[state.currentEpochIndex];
    const pct = (state.questionsAnsweredInEpoch / epoch.req) * 100;
    ui.progressBar.style.width = `${pct}%`;
}

function addCrystals(amount) {
    state.crystals += amount;
    updateCurrencyUI();
    saveData();
}

function updateCurrencyUI() {
    ui.crystalDisplays.forEach(el => el.innerText = state.crystals);
}

function showFeedback(msg, isBigEvent) {
    ui.feedback.innerText = msg;
    ui.feedback.classList.remove('hidden');
    setTimeout(() => ui.feedback.classList.add('hidden'), 1500);
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    document.getElementById('top-bar').classList.remove('hidden');
    if (screenName === 'menu') {
        screens.menu.classList.remove('hidden');
        document.getElementById('top-bar').classList.add('hidden');
        document.body.className = "";
    } else if (screenName === 'shop') {
        screens.shop.classList.remove('hidden');
        renderShop('clockface');
    } else if (screenName === 'game') {
        screens.game.classList.remove('hidden');
        drawClockFace(); 
    }
}

function endGame() {
    showFeedback("BRETT FULLFØRT!", true);
    setTimeout(() => switchScreen('menu'), 3000);
}

// --- LAGRING ---
function saveData() {
    localStorage.setItem('klokkemester_save', JSON.stringify({
        crystals: state.crystals,
        ownedItems: state.ownedItems,
        equipped: state.equipped
    }));
}

function loadSaveData() {
    const data = localStorage.getItem('klokkemester_save');
    if (data) {
        const parsed = JSON.parse(data);
        state.crystals = parsed.crystals || 0;
        state.ownedItems = parsed.ownedItems || [];
        state.equipped = parsed.equipped || state.equipped;
    }
}

function setupEventListeners() {
    document.getElementById('shop-btn').onclick = () => switchScreen('shop');
    document.getElementById('home-btn').onclick = () => switchScreen('menu');
    document.getElementById('back-from-shop').onclick = () => switchScreen('menu');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderShop(e.target.dataset.category);
        };
    });
}

// Start appen
init();
