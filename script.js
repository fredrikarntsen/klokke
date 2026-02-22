/* TIDSREISEN: KLOKKEMESTEREN
   Hovedlogikk for spillet
*/

// --- KONFIGURASJON ---

// Definisjon av de 6 pedagogiske nivåene
const LEVELS = {
    1: { name: "Hel og Halv", minutes: [0, 30], type: "analog" },
    2: { name: "Kvart over/på", minutes: [0, 15, 30, 45], type: "analog" },
    3: { name: "5 minutter", minutes: [0, 5, 10, 20, 25, 35, 40, 50, 55], type: "analog" }, // Unngår kvart/halv sonene litt
    4: { name: "Nøtteknekkeren", minutes: [20, 25, 35, 40], type: "analog" }, // Fokus på "på halv" og "over halv"
    5: { name: "Minuttmester", minutes: "all", type: "analog" }, // Alle minutter 0-59
    6: { name: "Digital Ekspert", minutes: "all", type: "mixed" } // Blanding av oppgaver
};

// Epoker (Tidsreisen)
const EPOCHS = [
    { id: "stone", name: "Steinalderen", bgClass: "epoch-stone", req: 5 },
    { id: "middle", name: "Middelalderen", bgClass: "epoch-middle", req: 5 },
    { id: "modern", name: "Nåtiden", bgClass: "epoch-modern", req: 5 },
    { id: "future", name: "Fremtiden", bgClass: "epoch-future", req: 10 } // Boss level!
];

// Butikk-innhold
const SHOP_ITEMS = [
    // Urskiver
    { id: "face_default", type: "clockface", name: "Standard", cost: 0, cssClass: "" },
    { id: "face_space", type: "clockface", name: "Romfart", cost: 100, cssClass: "skin-space" },
    { id: "face_soccer", type: "clockface", name: "Fotball", cost: 150, cssClass: "skin-soccer" },
    
    // Visere
    { id: "hand_default", type: "hands", name: "Standard", cost: 0, color: "#e94560" },
    { id: "hand_gold", type: "hands", name: "Gullvisere", cost: 200, color: "#ffd700" },
    { id: "hand_blue", type: "hands", name: "Laserblå", cost: 150, color: "#00ffff" },

    // Bakgrunner (Disse overstyrer epoke-bakgrunn i menyen, men epoke styrer i spillet)
    { id: "bg_default", type: "background", name: "Standard", cost: 0, cssClass: "" },
];

// --- TILSTAND (STATE) ---
let state = {
    crystals: 0,
    ownedItems: ["face_default", "hand_default", "bg_default"],
    equipped: {
        clockface: "face_default",
        hands: "hand_default",
        background: "bg_default"
    },
    currentLevel: 1,
    currentEpochIndex: 0,
    questionsAnsweredInEpoch: 0,
    currentTask: null // { targetTime: {h, m}, type: 'setClock'|'quiz' }
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
    hourHand: document.getElementById('hour-hand-group'),
    minuteHand: document.getElementById('minute-hand-group'),
    clockFace: document.getElementById('clock-face-circle'),
    
    // Interaksjon
    interactionArea: {
        quiz: document.getElementById('quiz-buttons'),
        controls: document.getElementById('clock-controls'),
        digital: document.getElementById('digital-input-area')
    },
    
    inputs: {
        h: document.getElementById('inp-hour'),
        m: document.getElementById('inp-min')
    }
};

// --- INITIALISERING ---
function init() {
    loadSaveData();
    renderLevelGrid();
    setupEventListeners();
    updateCurrencyUI();
    applyEquippedItems();
}

// --- SPILL LOGIKK: STARTE OG STOPPE ---

function startGame(levelId) {
    state.currentLevel = levelId;
    state.currentEpochIndex = 0;
    state.questionsAnsweredInEpoch = 0;
    
    switchScreen('game');
    updateEpochUI();
    nextQuestion();
}

function nextQuestion() {
    // 1. Sjekk om epoke er ferdig
    const currentEpochConfig = EPOCHS[state.currentEpochIndex];
    
    if (state.questionsAnsweredInEpoch >= currentEpochConfig.req) {
        // Gå til neste epoke
        state.currentEpochIndex++;
        state.questionsAnsweredInEpoch = 0;
        
        if (state.currentEpochIndex >= EPOCHS.length) {
            endGame(true); // Seier!
            return;
        }
        showFeedback("Ny Tidsalder!", true);
        updateEpochUI();
    }
    
    // 2. Generer tidspunkt basert på nivå
    const targetTime = generateTimeForLevel(state.currentLevel);
    
    // 3. Velg oppgavetype
    let taskType = "quiz"; // Default
    const levelConfig = LEVELS[state.currentLevel];
    
    // Logikk for å variere oppgavetyper
    const rand = Math.random();
    if (state.currentLevel === 6) {
        if (rand < 0.33) taskType = "setClock";
        else if (rand < 0.66) taskType = "quiz";
        else taskType = "digitalInput";
    } else {
        // For lavere nivåer, mest still klokka eller quiz
        taskType = rand > 0.5 ? "setClock" : "quiz";
    }

    // Lagre oppgaven i state
    state.currentTask = {
        targetTime: targetTime,
        type: taskType,
        userTime: { ...targetTime } // Brukes hvis oppgaven er "still klokka"
    };
    
    // Hvis "Still klokka", start viserne på tilfeldig sted (ikke riktig svar)
    if (taskType === "setClock") {
        state.currentTask.userTime = { 
            h: Math.floor(Math.random() * 12), 
            m: Math.floor(Math.random() * 60) 
        };
    }

    renderQuestionUI();
}

function generateTimeForLevel(lvl) {
    const config = LEVELS[lvl];
    let h = Math.floor(Math.random() * 12) + 1; // 1-12
    let m = 0;

    if (config.minutes === "all") {
        m = Math.floor(Math.random() * 60);
    } else if (Array.isArray(config.minutes)) {
        const r = Math.floor(Math.random() * config.minutes.length);
        m = config.minutes[r];
    }
    
    return { h, m };
}

// --- UI RENDERING AV OPPGAVER ---

function renderQuestionUI() {
    const task = state.currentTask;
    const timeText = timeToNorwegianText(task.targetTime.h, task.targetTime.m);
    
    // Skjul alle interaksjonsområder først
    ui.interactionArea.quiz.classList.add('hidden');
    ui.interactionArea.controls.classList.add('hidden');
    ui.interactionArea.digital.classList.add('hidden');
    ui.digitalDisplay.classList.add('hidden');

    // Reset visning
    updateClockHands(task.targetTime.h, task.targetTime.m); // Vis fasit på klokka som default (overskrives under hvis nødvendig)

    if (task.type === "quiz") {
        ui.questionText.innerText = "Hva er klokka?";
        ui.interactionArea.quiz.classList.remove('hidden');
        generateQuizButtons(timeText);
        
    } else if (task.type === "setClock") {
        ui.questionText.innerText = `Still klokka til: ${timeText}`;
        ui.interactionArea.controls.classList.remove('hidden');
        // Vis "feil" tid på klokka som spilleren skal rette
        updateClockHands(task.userTime.h, task.userTime.m);
        
    } else if (task.type === "digitalInput") {
        ui.questionText.innerText = "Skriv klokkeslettet digitalt:";
        ui.interactionArea.digital.classList.remove('hidden');
        ui.inputs.h.value = "";
        ui.inputs.m.value = "";
        ui.inputs.h.focus();
    }
}

function generateQuizButtons(correctText) {
    ui.interactionArea.quiz.innerHTML = "";
    
    // Generer 2 feil svar
    let answers = [correctText];
    while (answers.length < 3) {
        let fakeH = Math.floor(Math.random() * 12) + 1;
        let fakeM = Math.floor(Math.random() * 60);
        // Forenkle feil svar basert på nivå (om nødvendig)
        if (LEVELS[state.currentLevel].minutes !== "all" && Array.isArray(LEVELS[state.currentLevel].minutes)) {
             let opts = LEVELS[state.currentLevel].minutes;
             fakeM = opts[Math.floor(Math.random() * opts.length)];
        }
        
        let fakeText = timeToNorwegianText(fakeH, fakeM);
        if (!answers.includes(fakeText)) {
            answers.push(fakeText);
        }
    }
    
    // Stokk om svarene
    answers.sort(() => Math.random() - 0.5);
    
    answers.forEach(ans => {
        const btn = document.createElement('button');
        btn.className = "quiz-btn";
        btn.innerText = ans;
        btn.onclick = () => checkAnswer(ans === correctText);
        ui.interactionArea.quiz.appendChild(btn);
    });
}

// --- SJEKK SVAR LOGIKK ---

function checkAnswer(isCorrect) {
    if (isCorrect) {
        showFeedback("Riktig! +10 💎", false);
        addCrystals(10);
        state.questionsAnsweredInEpoch++;
        updateProgressUI();
        setTimeout(nextQuestion, 1500);
    } else {
        showFeedback("Prøv igjen!", false);
        // Ved feil: Vis fasit eller la dem prøve igjen.
        // For pedagogisk verdi lar vi dem prøve igjen i Quiz, men viser fasit i SetClock?
        // Enklest: Ingen straff, bare prøv igjen.
    }
}

// Sjekk funksjon for "Still klokka"
document.getElementById('submit-clock-btn').onclick = () => {
    const target = state.currentTask.targetTime;
    const user = state.currentTask.userTime;
    
    // Vi tillater +/- 2 minutters unøyaktighet hvis det er vanskelig nivå
    // Men siden vi bruker knapper, bør det være nøyaktig.
    
    // Normaliser brukerens tid (håndter 12 vs 0)
    let userH = user.h === 0 ? 12 : user.h;
    let targetH = target.h === 0 ? 12 : target.h;
    
    if (userH === targetH && user.m === target.m) {
        checkAnswer(true);
    } else {
        showFeedback("Nesten... Prøv igjen!", false);
    }
};

// Sjekk funksjon for "Digital Input"
document.getElementById('submit-digital-btn').onclick = () => {
    const hInput = parseInt(ui.inputs.h.value);
    const mInput = parseInt(ui.inputs.m.value);
    const target = state.currentTask.targetTime;
    
    // Konverter target til både 12t og 24t format for sjekk
    // (Enkel versjon: Godta 12-timers input for nå, siden analog er 12t)
    let targetH = target.h;
    let targetH24 = target.h + 12; 

    // Sjekk om input matcher enten AM eller PM tid
    const correctHour = (hInput === targetH || hInput === targetH24 || (targetH===12 && hInput===0)); // 12 kan være 00
    
    if (correctHour && mInput === target.m) {
        checkAnswer(true);
    } else {
        showFeedback("Feil tall. Prøv igjen!", false);
    }
};


// --- NORSK TID-TEKST GENERATOR ---
function timeToNorwegianText(h, m) {
    // Juster time for "på halv", "halv", "over halv", "på neste time"
    let nextHour = h + 1;
    if (nextHour > 12) nextHour = 1;
    
    // Håndter spesielle norske uttrykk
    if (m === 0) return `Klokka er ${h}`;
    if (m === 15) return `Kvart over ${h}`;
    if (m === 30) return `Halv ${nextHour}`;
    if (m === 45) return `Kvart på ${nextHour}`;
    
    if (m < 20) return `${m} over ${h}`;
    
    // Den vanskelige sonen: 20 - 40 (Rundt halv)
    if (m >= 20 && m < 30) {
        let diff = 30 - m;
        return `${diff} på halv ${nextHour}`;
    }
    if (m > 30 && m <= 40) {
        let diff = m - 30;
        return `${diff} over halv ${nextHour}`;
    }
    
    // Nærmer seg neste time
    if (m > 40) {
        let diff = 60 - m;
        return `${diff} på ${nextHour}`;
    }
    
    return `${h}:${m}`; // Fallback
}


// --- KLOKKE VISUALISERING ---

function updateClockHands(h, m) {
    // Timeviser: 360 grader / 12 timer = 30 grader per time.
    // Pluss: 30 grader * (minutter / 60) for å bevege seg jevnt.
    const hDeg = (h * 30) + (m * 0.5);
    const mDeg = m * 6;
    
    ui.hourHand.style.transform = `translate(100px, 100px) rotate(${hDeg}deg)`;
    ui.minuteHand.style.transform = `translate(100px, 100px) rotate(${mDeg}deg)`;
}

// Funksjon for knapper som justerer klokka
window.adjustTime = function(addH, addM) {
    let t = state.currentTask.userTime;
    
    t.m += addM;
    if (t.m >= 60) { t.m -= 60; t.h++; }
    if (t.m < 0) { t.m += 60; t.h--; }
    
    t.h += addH;
    if (t.h > 12) t.h = 1;
    if (t.h < 1) t.h = 12;
    
    updateClockHands(t.h, t.m);
};


// --- BUTIKK & MENY SYSTEM ---

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
        
        // Simuler bilde/preview med CSS klasser
        let previewClass = item.cssClass || "";
        
        div.innerHTML = `
            <div class="item-preview ${previewClass}" style="background-color: ${item.color || '#fff'}"></div>
            <span>${item.name}</span>
            <span class="price-tag">${isOwned ? (isEquipped ? 'Valgt' : 'Eier') : item.cost + ' 💎'}</span>
        `;
        
        div.onclick = () => handleShopClick(item);
        ui.shopGrid.appendChild(div);
    });
}

function handleShopClick(item) {
    if (state.ownedItems.includes(item.id)) {
        // Equip
        state.equipped[item.type] = item.id;
        saveData();
        renderShop(item.type);
        applyEquippedItems();
    } else {
        // Buy
        if (state.crystals >= item.cost) {
            state.crystals -= item.cost;
            state.ownedItems.push(item.id);
            state.equipped[item.type] = item.id; // Auto-equip ved kjøp
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
    // Urskive
    const faceItem = SHOP_ITEMS.find(i => i.id === state.equipped.clockface);
    if (faceItem) {
        ui.clockFace.className.baseVal = "clock-face " + (faceItem.cssClass || "");
    }
    
    // Visere (Fargeendring)
    const handItem = SHOP_ITEMS.find(i => i.id === state.equipped.hands);
    if (handItem && handItem.color) {
        document.querySelector('.minute-hand').style.fill = handItem.color;
    }
}


// --- HJELPEFUNKSJONER ---

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
    setTimeout(() => {
        ui.feedback.classList.add('hidden');
    }, 1500);
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    document.getElementById('top-bar').classList.remove('hidden');
    
    if (screenName === 'menu') {
        screens.menu.classList.remove('hidden');
        document.getElementById('top-bar').classList.add('hidden'); // Skjul top bar i menyen hvis ønskelig
        document.body.className = ""; // Reset bakgrunn i meny
    } else if (screenName === 'shop') {
        screens.shop.classList.remove('hidden');
        renderShop('clockface'); // Start med urskiver
    } else if (screenName === 'game') {
        screens.game.classList.remove('hidden');
    }
}

function endGame() {
    showFeedback("BRETT FULLFØRT!", true);
    setTimeout(() => {
        switchScreen('menu');
    }, 3000);
}

// --- LAGRING (LOCAL STORAGE) ---
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
    
    // Shop tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderShop(e.target.dataset.category);
        };
    });
}

// Start alt
init();
