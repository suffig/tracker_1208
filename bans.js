import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { supabase } from './supabaseClient.js';

// --- Helper-Funktion: Spieler für Team laden ---
async function getPlayersByTeam(team) {
    const { data, error } = await supabase.from('players').select('*').eq('team', team);
    if (error) {
        console.warn('Fehler beim Laden der Spieler:', error.message);
        return [];
    }
    return data || [];
}

let bans = [];
let playersCache = [];

const BAN_TYPES = [
    { value: "Gelb-Rote Karte", label: "Gelb-Rote Karte", duration: 1 },
    { value: "Rote Karte", label: "Rote Karte", duration: 2 },
    { value: "Verletzung", label: "Verletzung", duration: 3 }
];
const ALLOWED_BAN_COUNTS = [1, 2, 3, 4, 5, 6];

export async function loadBansAndRender(renderFn = renderBansLists) {
    const [{ data: bansData, error: errorBans }, { data: playersData, error: errorPlayers }] = await Promise.all([
        supabase.from('bans').select('*'),
        supabase.from('players').select('*')
    ]);
    if (errorBans) {
        alert('Fehler beim Laden der Sperren: ' + errorBans.message);
        bans = [];
    } else {
        bans = bansData || [];
    }
    if (errorPlayers) {
        alert('Fehler beim Laden der Spieler: ' + errorPlayers.message);
        playersCache = [];
    } else {
        playersCache = playersData || [];
    }
    renderFn();
}

export function renderBansTab(containerId = "app") {
	console.log("renderBansTab aufgerufen!", { containerId });
    const app = document.getElementById(containerId);

    app.innerHTML = `
        <div class="max-w-2xl mx-auto w-full px-4">
            <!-- Modern Header -->
            <div class="flex flex-col sm:flex-row sm:justify-between items-start mb-6">
                <div class="mb-4 sm:mb-0">
                    <h2 class="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">Sperren</h2>
                    <p class="text-gray-400 font-medium">Verwalte Spielersperren und Sanktionen</p>
                </div>
                <button id="add-ban-btn" class="group relative w-full sm:w-auto bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white px-6 py-4 rounded-2xl text-base flex items-center justify-center gap-3 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-r from-white/0 to-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out"></div>
                    <svg class="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    <span class="relative z-10">Sperre hinzufügen</span>
                </button>
            </div>
            
            <!-- Active Bans Section -->
            <div class="mb-8">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center">
                        <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                        </svg>
                    </div>
                    <h3 class="text-2xl font-bold text-white">Aktive Sperren</h3>
                </div>
                <div id="bans-active-list" class="space-y-4"></div>
            </div>
            
            <!-- Historical Bans Section -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                            <span class="text-white font-bold text-sm">A</span>
                        </div>
                        <h3 class="text-xl font-bold text-blue-400">Vergangene Sperren AEK</h3>
                    </div>
                    <div id="bans-history-aek" class="space-y-3"></div>
                </div>
                <div>
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                            <span class="text-white font-bold text-sm">R</span>
                        </div>
                        <h3 class="text-xl font-bold text-red-400">Vergangene Sperren Real</h3>
                    </div>
                    <div id="bans-history-real" class="space-y-3"></div>
                </div>
            </div>
        </div>
    `;

    loadBansAndRender(renderBansLists);

    document.getElementById('add-ban-btn').onclick = () => openBanForm();
}

function renderBansLists() {
    const activeBans = bans.filter(b => getRestGames(b) > 0);
    renderBanList(activeBans, 'bans-active-list', true);

    // Vergangene Sperren: restGames <= 0, nach Team
    const oldAek = bans.filter(b => getRestGames(b) <= 0 && b.team === "AEK");
    const oldReal = bans.filter(b => getRestGames(b) <= 0 && b.team === "Real");
    renderBanList(oldAek, 'bans-history-aek', false);
    renderBanList(oldReal, 'bans-history-real', false);
}

function getRestGames(ban) {
    return (ban.totalgames || 1) - (ban.matchesserved || 0);
}

function renderBanList(list, containerId, active) {
    const c = document.getElementById(containerId);
    if (!c) return;
    if (!list.length) {
        const message = active ? "Keine aktiven Sperren" : "Keine vergangenen Sperren";
        const icon = active ? 
            `<svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>` :
            `<svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>`;
        
        c.innerHTML = `
            <div class="text-center py-8">
                <div class="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    ${icon}
                </div>
                <p class="text-gray-400 font-medium">${message}</p>
                <p class="text-gray-500 text-sm mt-1">${active ? 'Alle Spieler sind verfügbar' : 'Noch keine abgelaufenen Sperren'}</p>
            </div>
        `;
        return;
    }
    
    c.innerHTML = '';
    list.forEach((ban, index) => {
        const player = playersCache.find(p => p.id === ban.player_id);
        
        // Enhanced team styling
        let teamBadge, gradientClass, borderClass;
        if (!player) {
            teamBadge = `<span class="px-2 py-1 bg-gray-600/20 border border-gray-500/30 text-gray-400 rounded-full text-xs font-medium">Unbekannt</span>`;
            gradientClass = "from-gray-700/40 to-gray-600/30";
            borderClass = "border-gray-500/30";
        } else if (player.team === "Ehemalige") {
            teamBadge = `<span class="px-2 py-1 bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-full text-xs font-medium">EHEMALIG</span>`;
            gradientClass = "from-amber-700/40 to-amber-600/30";
            borderClass = "border-amber-500/30";
        } else if (player.team === "AEK") {
            teamBadge = `<span class="px-2 py-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-full text-xs font-medium">AEK</span>`;
            gradientClass = "from-blue-700/40 to-blue-600/30";
            borderClass = "border-blue-500/30";
        } else {
            teamBadge = `<span class="px-2 py-1 bg-red-600/20 border border-red-500/30 text-red-400 rounded-full text-xs font-medium">REAL</span>`;
            gradientClass = "from-red-700/40 to-red-600/30";
            borderClass = "border-red-500/30";
        }
        
        const restGames = getRestGames(ban);
        const banTypeIcon = getBanTypeIcon(ban.type);
        
        const div = document.createElement('div');
        div.className = `ban-card group relative overflow-hidden bg-gradient-to-br ${gradientClass} backdrop-blur-xl border ${borderClass} rounded-2xl p-5 hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]`;
        
        div.innerHTML = `
            <!-- Background Pattern -->
            <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="white" fill-opacity="0.03"%3E%3Cpath d="M20 20c0-11.046-8.954-20-20-20v20h20z"/%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>
            
            <div class="relative z-10 flex items-center justify-between gap-4">
                <!-- Left Side - Player Info -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-8 h-8 bg-red-600/20 border border-red-500/30 rounded-xl flex items-center justify-center">
                            ${banTypeIcon}
                        </div>
                        <div class="text-xs text-gray-400 font-medium">#${index + 1}</div>
                        ${teamBadge}
                    </div>
                    
                    <h3 class="font-bold text-lg text-white mb-2 truncate">${player ? player.name : "Unbekannter Spieler"}</h3>
                    
                    <div class="space-y-2">
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-400">Typ:</span>
                            <span class="text-sm font-bold text-red-400">${ban.type || "Unbekannt"}</span>
                        </div>
                        
                        <div class="flex items-center gap-4">
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-gray-400">Gesamt:</span>
                                <span class="text-sm font-bold text-white">${ban.totalgames || 1}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-gray-400">Verbleibend:</span>
                                <span class="text-sm font-bold ${restGames > 0 ? 'text-red-400' : 'text-green-400'}">${restGames < 0 ? 0 : restGames}</span>
                            </div>
                        </div>
                        
                        ${ban.reason ? `
                            <div class="mt-2 p-2 bg-slate-900/30 rounded-lg border border-slate-600/20">
                                <span class="text-xs text-gray-400">Grund:</span>
                                <p class="text-sm text-gray-300 mt-1">${ban.reason}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Right Side - Action Buttons -->
                ${active ? `
                    <div class="flex flex-col gap-2">
                        <button class="edit-ban-btn group/edit relative w-12 h-12 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-400/50 text-blue-400 hover:text-blue-300 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Bearbeiten">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
                            </svg>
                        </button>
                        <button class="delete-ban-btn group/delete relative w-12 h-12 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-400/50 text-red-400 hover:text-red-300 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95" title="Löschen">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M10 3h4a2 2 0 012 2v2H8V5a2 2 0 012-2z" />
                            </svg>
                        </button>
                    </div>
                ` : `
                    <div class="flex items-center justify-center w-12 h-12 bg-green-600/20 border border-green-500/30 text-green-400 rounded-xl">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                `}
            </div>
            
            <!-- Hover Effect Overlay -->
            <div class="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out rounded-2xl"></div>
        `;
        
        if (active) {
            div.querySelector('.edit-ban-btn').onclick = () => openBanForm(ban);
            div.querySelector('.delete-ban-btn').onclick = () => deleteBan(ban.id);
        }
        c.appendChild(div);
    });
}

// Helper function to get ban type icon
function getBanTypeIcon(type) {
    switch(type) {
        case "Gelb-Rote Karte":
            return `<svg class="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>`;
        case "Rote Karte":
            return `<svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>`;
        case "Verletzung":
            return `<svg class="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>`;
        default:
            return `<svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
            </svg>`;
    }
}

async function saveBan(ban) {
    if (ban.id) {
        // Update
        const { error } = await supabase
            .from('bans')
            .update({
                player_id: ban.player_id,
                team: ban.team,
                type: ban.type,
                totalgames: ban.totalgames,
                matchesserved: ban.matchesserved,
                reason: ban.reason
            })
            .eq('id', ban.id);
        if (error) alert('Fehler beim Speichern: ' + error.message);
    } else {
        // Insert
        const { error } = await supabase
            .from('bans')
            .insert([{
                player_id: ban.player_id,
                team: ban.team,
                type: ban.type,
                totalgames: ban.totalgames,
                matchesserved: ban.matchesserved || 0,
                reason: ban.reason
            }]);
        if (error) alert('Fehler beim Anlegen: ' + error.message);
    }
}

// --- ASYNCHRONE SPIELERAUSWAHL IM MODAL ---
async function openBanForm(ban = null) {
    const edit = !!ban;
    let team = ban ? ban.team : "AEK";
    // Alle Spieler des gewählten Teams laden
    let spielerArr = await getPlayersByTeam(team);

    function playerOptions(arr, selectedPlayerId = null) {
        return arr.map(p =>
            `<option value="${p.id}"${p.id === selectedPlayerId ? " selected" : ""}>${p.name}</option>`
        ).join('');
    }

    // Typ-Auswahl
    const typeOptions = BAN_TYPES.map(t =>
        `<option value="${t.value}"${ban && ban.type === t.value ? " selected" : ""}>${t.label}</option>`
    ).join('');

    // Gesamtsperrenzahl (dropdown 1-6, außer Gelb-Rote Karte)
    function numberOptions(selectedType, selected, fieldName = "totalgames") {
        if (selectedType === "Gelb-Rote Karte")
            return `<option value="1" selected>1</option>`;
        return ALLOWED_BAN_COUNTS.map(v =>
            `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${v}</option>`
        ).join('');
    }

    const initialType = ban ? ban.type : BAN_TYPES[0].value;
    const initialTotalGames = ban
        ? ban.totalgames
        : BAN_TYPES.find(t => t.value === initialType)?.duration || 1;

    showModal(`
        <form id="ban-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-gray-800 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-white dark:text-white">
            <h3 class="font-bold text-lg mb-2">${edit ? 'Sperre bearbeiten' : 'Sperre hinzufügen'}</h3>
            <div>
                <label class="font-semibold">Team:</label>
                <select name="team" id="ban-team" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100">
                    <option value="AEK"${team === "AEK" ? " selected" : ""}>AEK</option>
                    <option value="Real"${team === "Real" ? " selected" : ""}>Real</option>
                </select>
            </div>
            <div>
                <label class="font-semibold">Spieler:</label>
                <select name="player_id" id="ban-player" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100">
                    ${playerOptions(spielerArr, ban ? ban.player_id : null)}
                </select>
            </div>
            <div>
                <label class="font-semibold">Typ:</label>
                <select name="type" id="ban-type" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100">
                    ${typeOptions}
                </select>
            </div>
            <div>
                <label class="font-semibold">Gesamtsperrenzahl:</label>
                <select name="totalgames" id="ban-totalgames" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" ${initialType === "Gelb-Rote Karte" ? "disabled" : ""}>
                    ${numberOptions(initialType, initialTotalGames, "totalgames")}
                </select>
            </div>
            <div>
                <label class="font-semibold">Grund (optional):</label>
                <input type="text" name="reason" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Grund" value="${ban && ban.reason ? ban.reason : ''}">
            </div>
            <div class="flex gap-2">
                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition flex gap-2 items-center justify-center">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  ${edit ? 'Speichern' : 'Anlegen'}
                </button>
                <button type="button" class="bg-gray-200 dark:bg-gray-700 w-full px-4 py-3 rounded-lg text-base font-semibold" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);

    document.getElementById('ban-team').onchange = async function() {
        const val = this.value;
        const playerSel = document.getElementById('ban-player');
        playerSel.innerHTML = '<option>Lade...</option>';
        const arr = await getPlayersByTeam(val);
        playerSel.innerHTML = playerOptions(arr, null);
    };

    document.getElementById('ban-type').onchange = function() {
        const type = this.value;
        let duration = BAN_TYPES.find(t => t.value === type)?.duration || 1;
        updateTotalGames(type, duration);
    };

    function updateTotalGames(type, val) {
        const totalGamesSel = document.getElementById('ban-totalgames');
        if (type === "Gelb-Rote Karte") {
            totalGamesSel.innerHTML = `<option value="1" selected>1</option>`;
            totalGamesSel.setAttribute("disabled", "disabled");
        } else {
            totalGamesSel.removeAttribute("disabled");
            totalGamesSel.innerHTML = ALLOWED_BAN_COUNTS.map(v =>
                `<option value="${v}"${Number(val) === v ? " selected" : ""}>${v}</option>`
            ).join('');
        }
    }

    document.getElementById('ban-form').onsubmit = async e => {
        e.preventDefault();
        const form = e.target;
        const team = form.team.value;
        const player_id = parseInt(form.player_id.value, 10);
        const type = form.type.value;
        let totalgames = parseInt(form.totalgames.value, 10);
        if (type === "Gelb-Rote Karte") totalgames = 1;
        const reason = form.reason.value.trim();

        if (ban) {
            await saveBan({
                ...ban,
                team,
                player_id,
                type,
                totalgames,
                reason
            });
            showSuccessAndCloseModal("Sperre erfolgreich aktualisiert");
        } else {
            await saveBan({
                team,
                player_id,
                type,
                totalgames,
                matchesserved: 0,
                reason
            });
            showSuccessAndCloseModal("Sperre erfolgreich hinzugefügt");
        }
    };
}

// Hilfsfunktion für andere Module:
export async function decrementBansAfterMatch() {
    const { data: bansData, error } = await supabase.from('bans').select('*');
    if (error) return;
    const updates = [];
    bansData.forEach(ban => {
        if (getRestGames(ban) > 0) {
            updates.push(
                supabase.from('bans').update({ matchesserved: (ban.matchesserved || 0) + 1 }).eq('id', ban.id)
            );
        }
    });
    await Promise.all(updates);
}

// --- RESET-STATE-FUNKTION ---
export function resetBansState() {
    bans = [];
    playersCache = [];
}