// ========================================
// Fight Stats Hub — ARKDEMIA
// Pure JavaScript, no frameworks
// ========================================

const SPREADSHEET_IDS = {
    "2xko": "1sPqEeBAqnVfFO-8y4W1n4kCi9SXbAst1VCT4Bqa3pfM",
    sf6: "1sDmKRGTTUhuUhODJ7YmwPuVG9CX4VQmZr8iigeDCdOw",
};

const GAME_META = {
    "2xko": { title: "2XKO", subtitle: "TAG-TEAM CIRCUIT 25/26", icon: "⚡" },
    sf6: { title: "SF6", subtitle: "WORLD WARRIOR CIRCUIT 25/26", icon: "🔥" },
};

// ---- State ----
let currentGame = "2xko";
let currentEventId = null; // null = "Geral"
let eventsCache = {}; // { "2xko": [...], "sf6": [...] }

// ---- DOM References ----
const $ = (id) => document.getElementById(id);

// ---- CSV Parsing ----
function parseCSV(csv) {
    const lines = csv.split("\n").filter((l) => l.trim());
    return lines.map((line) => {
        const result = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    });
}

function imgurToDirectUrl(url) {
    if (!url) return "";
    const match = url.match(/imgur\.com\/(\w+)/);
    if (match) return `https://i.imgur.com/${match[1]}.jpg`;
    return url;
}

// ---- Fetch Sheets ----
async function fetchSheetCSV(spreadsheetId, sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const csv = await res.text();
        if (csv.trimStart().startsWith("<!")) return null;
        const rows = parseCSV(csv);
        if (rows.length < 2) return null;
        return rows;
    } catch {
        return null;
    }
}

function parsePlayersFromRows(rows) {
    return rows
        .slice(1)
        .map((row) => ({
            rank: parseInt(row[0]) || 0,
            name: row[1] || "",
            points: parseInt(row[2]) || 0,
            photoUrl: imgurToDirectUrl(row[4] || ""),
        }))
        .filter((p) => p.name);
}

async function fetchAllEvents(game) {
    // Check session cache
    const cacheKey = `fight-stats-${game}`;
    try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.ts < 5 * 60 * 1000) return data.events;
        }
    } catch { }

    const spreadsheetId = SPREADSHEET_IDS[game];
    const events = [];
    let num = 1;

    while (num <= 20) {
        const rows = await fetchSheetCSV(spreadsheetId, `ETAPA${num}`);
        if (!rows) break;
        events.push({
            id: `${game}-etapa-${num}`,
            name: `Etapa ${String(num).padStart(2, "0")}`,
            sheetName: `ETAPA${num}`,
            players: parsePlayersFromRows(rows),
        });
        num++;
    }

    try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ events, ts: Date.now() }));
    } catch { }

    return events;
}

// ---- Ranking Calculation ----
function calculateRanking(events, eventId) {
    const relevant = eventId ? events.filter((e) => e.id === eventId) : events;
    const map = {};

    for (const event of relevant) {
        for (const p of event.players) {
            map[p.name] = (map[p.name] || 0) + p.points;
        }
    }

    const sorted = Object.entries(map)
        .map(([name, totalPoints]) => ({ name, totalPoints, rank: 0 }))
        .sort((a, b) => b.totalPoints - a.totalPoints);

    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i].totalPoints < sorted[i - 1].totalPoints) {
            currentRank = i + 1;
        }
        sorted[i].rank = currentRank;
    }

    return sorted;
}

// ---- Render Functions ----

function renderGameSelector() {
    $("btn-2xko").classList.toggle("active", currentGame === "2xko");
    $("btn-sf6").classList.toggle("active", currentGame === "sf6");
    document.body.setAttribute("data-game", currentGame);
}

function renderHeader(events) {
    const meta = GAME_META[currentGame];
    $("title-game").textContent = meta.title;
    $("subtitle").innerHTML = `<span class="subtitle-icon">${meta.icon}</span> ${meta.subtitle}`;
    $("etapa-badge").textContent = `Etapa ${String(events.length).padStart(2, "0")}`;
}

function renderEventTabs(events) {
    const nav = $("event-tabs");
    nav.innerHTML = "";

    // "Geral" tab
    const geralBtn = document.createElement("button");
    geralBtn.className = `tab-btn${currentEventId === null ? " active" : ""}`;
    geralBtn.textContent = "Geral";
    geralBtn.addEventListener("click", () => selectEvent(null));
    nav.appendChild(geralBtn);

    events.forEach((event) => {
        const btn = document.createElement("button");
        btn.className = `tab-btn${currentEventId === event.id ? " active" : ""}`;
        btn.textContent = event.name;
        btn.addEventListener("click", () => selectEvent(event.id));
        nav.appendChild(btn);
    });
}

function renderLeaderboard(ranking) {
    const container = $("leaderboard");
    container.innerHTML = "";

    $("points-label").textContent = currentEventId ? "Pontos" : "Total Acumulado";

    ranking.forEach((player) => {
        const row = document.createElement("div");
        row.className = `lb-row${player.rank === 1 ? " rank-1" : ""}`;

        const rankClass =
            player.rank === 1 ? "r1" : player.rank === 2 ? "r2" : player.rank === 3 ? "r3" : "r-default";

        row.innerHTML = `
      <div class="lb-left">
        <span class="rank-badge ${rankClass}">${player.rank}º</span>
        <span class="player-name">${escapeHtml(player.name)}</span>
      </div>
      <div class="lb-right">
        <span class="points-value">${player.totalPoints}</span>
        <span class="points-unit">pts</span>
      </div>
    `;
        container.appendChild(row);
    });

    $("leaderboard-section").style.display = "block";
}

function renderPhotoGallery(events) {
    const gallery = $("photo-gallery");
    const grid = $("gallery-grid");

    if (!currentEventId) {
        gallery.style.display = "none";
        return;
    }

    const event = events.find((e) => e.id === currentEventId);
    if (!event) {
        gallery.style.display = "none";
        return;
    }

    const photosPlayers = event.players.filter((p) => p.photoUrl);
    if (photosPlayers.length === 0) {
        gallery.style.display = "none";
        return;
    }

    $("gallery-title-text").textContent = `Fotos da ${event.sheetName}`;
    grid.innerHTML = "";

    photosPlayers.forEach((player) => {
        const card = document.createElement("button");
        card.className = "gallery-card";
        card.innerHTML = `
      <img src="${player.photoUrl}" alt="Foto de ${escapeHtml(player.name)}" loading="lazy" />
      <div class="gallery-card-label">${escapeHtml(player.name)}</div>
    `;
        card.addEventListener("click", () => openLightbox(player.photoUrl));
        grid.appendChild(card);
    });

    gallery.style.display = "block";
}

function renderStatsFooter(events) {
    if (currentEventId) {
        $("stats-footer").style.display = "none";
        return;
    }

    const ranking = calculateRanking(events, null);
    const leaders = ranking.filter((p) => p.rank === 1).map((p) => p.name);
    const leadersText =
        leaders.length > 2 ? `${leaders[0]} & +${leaders.length - 1}` : leaders.join(" & ");

    $("stat-players").textContent = `${ranking.length} ATIVOS`;
    $("leader-label").textContent = leaders.length > 1 ? "Co-Líderes" : "Líder";
    $("stat-leader").textContent = leadersText || "--";
    $("stat-etapas").textContent = `${events.length} CONCLUÍDAS`;

    $("stats-footer").style.display = "grid";
}

// ---- Lightbox ----
function openLightbox(url) {
    $("lightbox-img").src = url;
    $("lightbox").style.display = "flex";
}

function closeLightbox() {
    $("lightbox").style.display = "none";
    $("lightbox-img").src = "";
}

// ---- Utility ----
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ---- Main Flow ----

async function loadAndRender() {
    $("loading").style.display = "flex";
    $("error").style.display = "none";
    $("leaderboard-section").style.display = "none";
    $("photo-gallery").style.display = "none";
    $("stats-footer").style.display = "none";

    renderGameSelector();

    try {
        if (!eventsCache[currentGame]) {
            eventsCache[currentGame] = await fetchAllEvents(currentGame);
        }

        const events = eventsCache[currentGame];

        $("loading").style.display = "none";

        renderHeader(events);
        renderEventTabs(events);

        const ranking = calculateRanking(events, currentEventId);
        renderLeaderboard(ranking);
        renderPhotoGallery(events);
        renderStatsFooter(events);
    } catch (err) {
        console.error(err);
        $("loading").style.display = "none";
        $("error").style.display = "block";
    }
}

function selectGame(game) {
    currentGame = game;
    currentEventId = null;
    loadAndRender();
}

function selectEvent(eventId) {
    currentEventId = eventId;
    const events = eventsCache[currentGame] || [];
    renderEventTabs(events);
    const ranking = calculateRanking(events, currentEventId);
    renderLeaderboard(ranking);
    renderPhotoGallery(events);
    renderStatsFooter(events);
    // Update points label
    $("points-label").textContent = currentEventId ? "Pontos" : "Total Acumulado";
}

// ---- Event Listeners ----
document.addEventListener("DOMContentLoaded", () => {
    $("btn-2xko").addEventListener("click", () => selectGame("2xko"));
    $("btn-sf6").addEventListener("click", () => selectGame("sf6"));

    $("lightbox").addEventListener("click", closeLightbox);
    $("lightbox-close").addEventListener("click", closeLightbox);
    $("lightbox-img").addEventListener("click", (e) => e.stopPropagation());

    loadAndRender();
});
