import { POSITIONEN, savePlayer as dataSavePlayer, deletePlayer as dataDeletePlayer } from './data.js';
import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { supabaseDb, supabase } from './supabaseClient.js';
import { isDatabaseAvailable } from './connectionMonitor.js';

let aekAthen = [];
let realMadrid = [];
let ehemalige = [];
let finances = {
    aekAthen: { balance: 0 },
    realMadrid: { balance: 0 }
};
let transactions = [];

const POSITION_ORDER = {
    "TH": 0, "IV": 1, "LV": 2, "RV": 3, "ZDM": 4, "ZM": 5,
    "ZOM": 6, "LM": 7, "RM": 8, "LF": 9, "RF": 10, "ST": 11
};

// --- NEU: Accordion-Zustand ---
let openPanel = null; // "aek", "real", "ehemalige" oder null

// --- Hilfsfunktion: Positionsfarbe (Dark Theme optimiert) ---
function getPositionColor(pos) {
    // Defensiv: Blau, Mittelfeld: Grün, Angriff: Orange/Rot
	const th  = ["TH"];
    const def = ["IV", "LV", "RV", "ZDM"];
    const mid = ["ZM", "ZOM", "LM", "RM"];
    const att = ["LF", "RF", "ST"];
	if (th.includes(pos)) return "bg-green-800 text-green-200 border-green-600 dark:bg-green-900 dark:text-green-300 dark:border-green-700";
    if (def.includes(pos)) return "bg-blue-800 text-blue-200 border-blue-600 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700";
    if (mid.includes(pos)) return "bg-yellow-800 text-yellow-200 border-yellow-600 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700";
    if (att.includes(pos)) return "bg-red-800 text-red-200 border-red-600 dark:bg-red-900 dark:text-red-300 dark:border-red-700";
    return "bg-gray-700 text-gray-200 border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
}


async function loadPlayersAndFinances(renderFn = renderPlayerLists) {
    try {
        const loadingDiv = document.createElement('div');
        loadingDiv.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Lade Daten...</div>';
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.appendChild(loadingDiv);

        const [playersResult, finResult, transResult] = await Promise.allSettled([
            supabaseDb.select('players', '*'),
            supabaseDb.select('finances', '*'),
            supabaseDb.select('transactions', '*', { 
                order: { column: 'id', ascending: false } 
            })
        ]);

        if (playersResult.status === 'fulfilled' && playersResult.value.data) {
            const players = playersResult.value.data;
            aekAthen = players.filter(p => p.team === "AEK");
            realMadrid = players.filter(p => p.team === "Real");
            ehemalige = players.filter(p => p.team === "Ehemalige");
        }
        if (finResult.status === 'fulfilled' && finResult.value.data) {
            const finData = finResult.value.data;
            finances = {
                aekAthen: finData.find(f => f.team === "AEK") || { balance: 0 },
                realMadrid: finData.find(f => f.team === "Real") || { balance: 0 }
            };
        }
        if (transResult.status === 'fulfilled' && transResult.value.data) {
            transactions = transResult.value.data;
        }

        if (loadingDiv.parentNode) {
            loadingDiv.parentNode.removeChild(loadingDiv);
        }

        renderFn();
    } catch (error) {
        console.error('Error loading data:', error);
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
                <strong>Fehler beim Laden der Daten.</strong> 
                ${isDatabaseAvailable() ? 'Bitte versuchen Sie es erneut.' : 'Keine Datenbankverbindung.'}
                <button onclick="this.parentElement.remove()" class="float-right font-bold text-red-700 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100">×</button>
            </div>
        `;
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.insertBefore(errorDiv, appDiv.firstChild);
        renderFn();
    }
}

export function renderKaderTab(containerId = "app") {
    const app = document.getElementById(containerId);
    loadPlayersAndFinances(renderPlayerLists);

    app.innerHTML = `
        <div class="max-w-2xl mx-auto w-full px-4">
            <!-- Modern Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start mb-6">
                <div>
                    <h2 class="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">Team-Kader</h2>
                    <p class="text-gray-400 font-medium">Verwalte deine Spieler und Teams</p>
                </div>
            </div>
            
            <!-- Modern Team Cards -->
            <div class="space-y-6">
                ${accordionPanelHtml('AEK Athen', 'aek', 'from-blue-600/20 to-blue-800/20', 'text-blue-400', 'border-blue-500/30')}
                ${accordionPanelHtml('Real Madrid', 'real', 'from-red-600/20 to-red-800/20', 'text-red-400', 'border-red-500/30')}
                ${accordionPanelHtml('Ehemalige Spieler', 'ehemalige', 'from-gray-600/20 to-gray-800/20', 'text-gray-400', 'border-gray-500/30')}
            </div>
        </div>
    `;
    ['aek', 'real', 'ehemalige'].forEach(team => {
        document.getElementById(`panel-toggle-${team}`)?.addEventListener('click', () => {
            openPanel = openPanel === team ? null : team;
            renderKaderTab(containerId); // Neu rendern, damit Panel-Inhalt sichtbar wird
        });
    });
}

function accordionPanelHtml(team, key, gradientClass, textClass, borderClass) {
    const isOpen = openPanel === key;
    return `
        <div class="modern-card group relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradientClass} backdrop-blur-xl border ${borderClass} hover:shadow-2xl transition-all duration-500">
            <!-- Background Pattern -->
            <div class="absolute inset-0 bg-gradient-to-br ${gradientClass} opacity-50"></div>
            <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="white" fill-opacity="0.05"%3E%3Cpath d="M0 0h20v20H0V0zm10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
            
            <!-- Header Button -->
            <button id="panel-toggle-${key}" class="relative z-10 flex justify-between items-center w-full px-6 py-5 ${textClass} font-bold text-lg transition-all duration-300 group-hover:px-7">
                <div class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full bg-current opacity-60"></div>
                    <span>${team}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-sm font-medium opacity-70">${isOpen ? 'Schließen' : 'Öffnen'}</span>
                    <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </button>
            
            <!-- Content Panel -->
            <div id="panel-content-${key}" class="relative z-10 transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}" style="overflow: hidden;">
                <div class="px-6 pb-6">
                    <!-- Add Player Button -->
                    <button id="add-player-${key}" class="group/btn relative w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white px-6 py-4 rounded-xl text-base flex items-center justify-center gap-3 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] mb-4 overflow-hidden">
                        <div class="absolute inset-0 bg-gradient-to-r from-white/0 to-white/20 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 ease-out"></div>
                        <svg class="h-5 w-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        <span class="relative z-10">Spieler hinzufügen</span>
                    </button>
                    
                    <!-- Players Container -->
                    <div id="team-${key}-players" class="space-y-3"></div>
                    
                    <!-- Market Value Display -->
                    ${team !== 'Ehemalige Spieler' ? `
                        <div class="mt-4 p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium ${textClass} opacity-80">Gesamter Marktwert:</span>
                                <span id="${key}-marktwert" class="text-lg font-bold ${textClass}">Lade...</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderPlayerLists() {
    if (openPanel === 'aek' && document.getElementById('team-aek-players')) {
        renderPlayerList('team-aek-players', aekAthen, "AEK");
        const mwSpan = document.getElementById('aek-marktwert');
        if (mwSpan) mwSpan.innerText = getKaderMarktwert(aekAthen).toLocaleString('de-DE') + "M €";
    }
    if (openPanel === 'real' && document.getElementById('team-real-players')) {
        renderPlayerList('team-real-players', realMadrid, "Real");
        const mwSpan = document.getElementById('real-marktwert');
        if (mwSpan) mwSpan.innerText = getKaderMarktwert(realMadrid).toLocaleString('de-DE') + "M €";
    }
    if (openPanel === 'ehemalige' && document.getElementById('team-ehemalige-players')) {
        renderEhemaligeList('team-ehemalige-players');
    }
    // Add Player-Button Handler nur im offenen Panel
    if (openPanel === 'aek' && document.getElementById('add-player-aek')) document.getElementById('add-player-aek').onclick = () => openPlayerForm('AEK');
    if (openPanel === 'real' && document.getElementById('add-player-real')) document.getElementById('add-player-real').onclick = () => openPlayerForm('Real');
    if (openPanel === 'ehemalige' && document.getElementById('add-player-ehemalige')) document.getElementById('add-player-ehemalige').onclick = () => openPlayerForm('Ehemalige');
}

// --- MODERN PLAYER CARDS with Enhanced Mobile Design ---
function renderPlayerList(containerId, arr, team) {
    const c = document.getElementById(containerId);
    if (!c) return;
    arr = arr.slice().sort((a, b) => {
        const posA = POSITION_ORDER[a.position] ?? 99;
        const posB = POSITION_ORDER[b.position] ?? 99;
        return posA - posB;
    });
    c.innerHTML = "";
    arr.forEach((player, index) => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        // Enhanced Position Badge with modern styling
        const posBadge = player.position
            ? `<div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getPositionColor(player.position)} shadow-sm">${player.position}</div>`
            : "";

        const d = document.createElement("div");
        d.className = "player-card group relative overflow-hidden bg-gradient-to-br from-slate-800/60 to-slate-700/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:bg-gradient-to-br hover:from-slate-800/80 hover:to-slate-700/60";
        d.innerHTML = `
            <!-- Background Pattern -->
            <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="white" fill-opacity="0.03"%3E%3Cpath d="M20 20c0-11.046-8.954-20-20-20v20h20z"/%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>
            
            <div class="relative z-10 flex items-center gap-4">
                <!-- Action Buttons Left -->
                <div class="flex flex-col gap-2">
                    <button class="edit-btn group/edit relative w-12 h-12 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-400/50 text-blue-400 hover:text-blue-300 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Bearbeiten">
                        <div class="absolute inset-0 bg-gradient-to-r from-blue-500/0 to-blue-500/20 rounded-xl opacity-0 group-hover/edit:opacity-100 transition-opacity duration-300"></div>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
                        </svg>
                    </button>
                </div>
                
                <!-- Player Info Center -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-3">
                        ${posBadge}
                        <div class="text-xs text-gray-400 font-medium">#${index + 1}</div>
                    </div>
                    <h3 class="font-bold text-lg text-white mb-1 truncate">${player.name}</h3>
                    <div class="flex items-center gap-2">
                        <div class="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                            ${marktwert}M
                        </div>
                        <div class="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded-full">
                            Marktwert
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons Right -->
                <div class="flex flex-col gap-2">
                    <button class="move-btn group/move relative w-12 h-12 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 hover:border-orange-400/50 text-orange-400 hover:text-orange-300 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Zu Ehemalige">
                        <div class="absolute inset-0 bg-gradient-to-r from-orange-500/0 to-orange-500/20 rounded-xl opacity-0 group-hover/move:opacity-100 transition-opacity duration-300"></div>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Hover Effect Overlay -->
            <div class="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out rounded-2xl"></div>
        `;
        
        d.querySelector('.edit-btn').onclick = () => openPlayerForm(team, player.id);
        d.querySelector('.move-btn').onclick = () => movePlayerWithTransaction(player.id, "Ehemalige");
        c.appendChild(d);
    });
}


function renderEhemaligeList(containerId = "ehemalige-players") {
    const c = document.getElementById(containerId);
    if (!c) return;
    const sorted = ehemalige.slice().sort((a, b) => {
        const posA = POSITION_ORDER[a.position] ?? 99;
        const posB = POSITION_ORDER[b.position] ?? 99;
        return posA - posB;
    });
    c.innerHTML = "";
    sorted.forEach((player, index) => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        // Enhanced Position Badge
        const posBadge = player.position
            ? `<div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getPositionColor(player.position)} shadow-sm">${player.position}</div>`
            : "";

        // Modern Former Player Card
        const d = document.createElement("div");
        d.className = "player-card group relative overflow-hidden bg-gradient-to-br from-slate-800/60 to-slate-700/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:bg-gradient-to-br hover:from-slate-800/80 hover:to-slate-700/60";
        d.innerHTML = `
            <!-- Background Pattern -->
            <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="white" fill-opacity="0.03"%3E%3Cpath d="M20 20c0-11.046-8.954-20-20-20v20h20z"/%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>
            
            <div class="relative z-10 flex items-center gap-4">
                <!-- Left Action Buttons -->
                <div class="flex flex-col gap-2">
                    <button class="edit-btn group/edit relative w-10 h-10 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-400/50 text-blue-400 hover:text-blue-300 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Bearbeiten">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
                        </svg>
                    </button>
                    <button class="delete-btn group/delete relative w-10 h-10 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-400/50 text-red-400 hover:text-red-300 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Löschen">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M10 3h4a2 2 0 012 2v2H8V5a2 2 0 012-2z" />
                        </svg>
                    </button>
                </div>
                
                <!-- Player Info Center -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-2">
                        ${posBadge}
                        <div class="text-xs text-gray-400 font-medium">#${index + 1}</div>
                        <div class="px-2 py-1 bg-amber-600/20 border border-amber-500/30 text-amber-400 text-xs font-bold rounded-full">
                            EHEMALIG
                        </div>
                    </div>
                    <h3 class="font-bold text-lg text-white mb-1 truncate">${player.name}</h3>
                    ${marktwert ? `
                        <div class="flex items-center gap-2">
                            <div class="text-xl font-bold bg-gradient-to-r from-gray-400 to-gray-300 bg-clip-text text-transparent">
                                ${marktwert}M
                            </div>
                            <div class="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded-full">
                                Marktwert
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Right Action Buttons -->
                <div class="flex flex-col gap-2">
                    <button class="move-aek-btn group/aek relative w-10 h-10 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-400/50 text-blue-400 hover:text-blue-300 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Zu AEK">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <button class="move-real-btn group/real relative w-10 h-10 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-400/50 text-red-400 hover:text-red-300 rounded-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Zu Real">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Hover Effect Overlay -->
            <div class="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out rounded-2xl"></div>
        `;
        
        d.querySelector('.edit-btn').onclick = () => openPlayerForm('Ehemalige', player.id);
        d.querySelector('.delete-btn').onclick = () => deletePlayerDb(player.id);
        d.querySelector('.move-aek-btn').onclick = () => movePlayerWithTransaction(player.id, 'AEK');
        d.querySelector('.move-real-btn').onclick = () => movePlayerWithTransaction(player.id, 'Real');
        c.appendChild(d);
    });
}

function getKaderMarktwert(arr) {
    return arr.reduce((sum, p) => {
        let v = (typeof p.value === "number" ? p.value : (p.value ? parseFloat(p.value) : 0));
        return sum + v;
    }, 0);
}

async function savePlayer(player) {
    try {
        await dataSavePlayer(player);
    } catch (error) {
        alert(error.message);
        throw error;
    }
}

async function deletePlayerDb(id) {
    try {
        await dataDeletePlayer(id);
    } catch (error) {
        alert(error.message);
        throw error;
    }
}

async function movePlayerWithTransaction(id, newTeam) {
    let all = [...aekAthen, ...realMadrid, ...ehemalige];
    const player = all.find(p => p.id === id);
    if (!player) return;

    const oldTeam = player.team;
    const value = typeof player.value === "number" ? player.value : parseFloat(player.value) || 0;
    const abloese = value * 1000000;
    const now = new Date().toISOString().slice(0, 10);

    // Von TEAM zu Ehemalige: VERKAUF
    if ((oldTeam === "AEK" || oldTeam === "Real") && newTeam === "Ehemalige") {
        await supabase.from('transactions').insert([{
            date: now,
            type: "Spielerverkauf",
            team: oldTeam,
            amount: abloese,
            info: `Verkauf von ${player.name} (${player.position})`
        }]);
        let finKey = oldTeam === "AEK" ? "aekAthen" : "realMadrid";
        await supabase.from('finances').update({
            balance: (finances[finKey].balance || 0) + abloese
        }).eq('team', oldTeam);
        await movePlayerToTeam(id, newTeam);
        return;
    }

    // Von Ehemalige zu TEAM: KAUF
    if (oldTeam === "Ehemalige" && (newTeam === "AEK" || newTeam === "Real")) {
        let finKey = newTeam === "AEK" ? "aekAthen" : "realMadrid";
        const konto = finances[finKey].balance || 0;
        if (konto < abloese) {
            alert("Kontostand zu gering für diesen Transfer!");
            return;
        }
        await supabase.from('transactions').insert([{
            date: now,
            type: "Spielerkauf",
            team: newTeam,
            amount: -abloese,
            info: `Kauf von ${player.name} (${player.position})`
        }]);
        await supabase.from('finances').update({
            balance: konto - abloese
        }).eq('team', newTeam);
        await movePlayerToTeam(id, newTeam);
        return;
    }

    // Innerhalb Teams oder Ehemalige zu Ehemalige: Nur Move
    await movePlayerToTeam(id, newTeam);
}

async function movePlayerToTeam(id, newTeam) {
    const { error } = await supabase.from('players').update({ team: newTeam }).eq('id', id);
    if (error) alert('Fehler beim Verschieben: ' + error.message);
}

async function saveTransactionAndFinance(team, type, amount, info = "") {
    const now = new Date().toISOString().slice(0, 10);
    await supabase.from('transactions').insert([{ date: now, type, team, amount, info }]);
    const finKey = team === "AEK" ? "aekAthen" : "realMadrid";
    let updateObj = {};
    updateObj.balance = (finances[finKey].balance || 0) + amount;
    await supabase.from('finances').update(updateObj).eq('team', team);
}

function openPlayerForm(team, id) {
    let player = null;
    let edit = false;
    if (id) {
        let all = [...aekAthen, ...realMadrid, ...ehemalige];
        player = all.find(p => p.id === id);
        if (player) edit = true;
    }
    showModal(`
        <form id="player-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-gray-800 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-white dark:text-white">
            <h3 class="font-bold text-lg mb-2">${edit ? "Spieler bearbeiten" : "Spieler hinzufügen"} <span class="text-xs">${team}</span></h3>
            <input type="text" name="name" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Name" value="${player ? player.name : ""}" required>
            <select name="position" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required>
                <option value="">Position wählen</option>
                ${POSITIONEN.map(pos => `<option${player && player.position === pos ? " selected" : ""}>${pos}</option>`).join("")}
            </select>
            <input type="number" min="0" step="0.1" name="value" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Marktwert (M)" value="${player && player.value !== undefined ? player.value : ""}" required>
            <div class="flex gap-2">
                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition flex gap-2 items-center justify-center">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  ${edit ? "Speichern" : "Anlegen"}
                </button>
                <button type="button" class="bg-gray-200 dark:bg-gray-700 w-full px-4 py-3 rounded-lg text-base font-semibold" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);
    document.getElementById("player-form").onsubmit = (e) => submitPlayerForm(e, team, player ? player.id : null);
}

async function submitPlayerForm(event, team, id) {
    event.preventDefault();
    const form = event.target;
    const name = form.name.value;
    const position = form.position.value;
    const value = parseFloat(form.value.value);

    try {
        if (!id && (team === "AEK" || team === "Real")) {
            let fin = team === "AEK" ? finances.aekAthen : finances.realMadrid;
            if (fin.balance < value * 1000000) {
                alert("Kontostand zu gering!");
                return;
            }
            try {
                await saveTransactionAndFinance(team, "Spielerkauf", -value * 1000000, `Kauf von ${name} (${position})`);
            } catch (error) {
                console.warn("Transaction save failed (demo mode):", error);
                // Continue with player save even if transaction fails in demo mode
            }
        }
        if (id) {
            await savePlayer({ id, name, position, value, team });
            showSuccessAndCloseModal(`Spieler ${name} erfolgreich aktualisiert`);
        } else {
            await savePlayer({ name, position, value, team });
            showSuccessAndCloseModal(`Spieler ${name} erfolgreich hinzugefügt`);
        }
    } catch (error) {
        console.error("Error submitting player form:", error);
        alert("Fehler beim Speichern des Spielers: " + error.message);
    }
}

export { deletePlayerDb };

export function resetKaderState() {
    aekAthen = [];
    realMadrid = [];
    ehemalige = [];
    finances = { aekAthen: { balance: 0 }, realMadrid: { balance: 0 } };
    transactions = [];
    openPanel = null;
}