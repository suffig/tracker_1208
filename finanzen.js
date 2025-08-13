import { showModal, hideModal, showSuccessAndCloseModal } from './modal.js';
import { supabase } from './supabaseClient.js';
import { matches } from './matches.js';

let finances = {
    aekAthen: { balance: 0, debt: 0 },
    realMadrid: { balance: 0, debt: 0 }
};
let transactions = [];

// Lädt alle Finanzen und Transaktionen und ruft das Rendern auf
async function loadFinancesAndTransactions(renderFn = renderFinanzenTabInner) {
    const { data: finData, error: finError } = await supabase.from('finances').select('*');
    if (finError) {
        alert("Fehler beim Laden der Finanzen: " + finError.message);
    }
    if (finData && finData.length) {
        finances = {
            aekAthen: finData.find(f => f.team === "AEK") || { balance: 0, debt: 0 },
            realMadrid: finData.find(f => f.team === "Real") || { balance: 0, debt: 0 }
        };
    } else {
        finances = {
            aekAthen: { balance: 0, debt: 0 },
            realMadrid: { balance: 0, debt: 0 }
        };
    }

    const { data: transData, error: transError } = await supabase.from('transactions').select('*').order('id', { ascending: false });
    if (transError) {
        alert("Fehler beim Laden der Transaktionen: " + transError.message);
    }
    transactions = transData || [];
    console.log('Loaded transactions:', transactions.length, transactions);
    renderFn("app");
}

// Transaktion in die DB schreiben und Finanzen aktualisieren
async function saveTransaction(trans) {
    trans.amount = parseInt(trans.amount, 10) || 0;
    const { error: insertError } = await supabase.from('transactions').insert([{
        date: trans.date,
        type: trans.type,
        team: trans.team,
        amount: trans.amount,
        info: trans.info || null,
        match_id: trans.match_id || null
    }]);
    if (insertError) {
        alert("Fehler beim Speichern der Transaktion: " + insertError.message);
        return;
    }
    const teamKey = trans.team === "AEK" ? "aekAthen" : "realMadrid";
    let updateObj = {};
    if (trans.type === "Echtgeld-Ausgleich") {
        updateObj.debt = (finances[teamKey].debt || 0) + trans.amount;
    } else {
        let newBalance = (finances[teamKey].balance || 0) + trans.amount;
        if (newBalance < 0) newBalance = 0;
        updateObj.balance = newBalance;
    }
    const { error: updateError } = await supabase.from('finances').update(updateObj).eq('team', trans.team);
    if (updateError) {
        alert("Fehler beim Aktualisieren der Finanzen: " + updateError.message);
    }
}

export async function renderFinanzenTab(containerId = "app") {
	console.log("renderFinanzenTab aufgerufen!", { containerId });
    await loadFinancesAndTransactions(renderFinanzenTabInner);
}

function renderFinanzenTabInner(containerId = "app") {
    const app = document.getElementById(containerId);
    app.innerHTML = `
        <div class="mb-4">
            <h2 class="text-lg font-semibold dark:text-white">Finanzen</h2>
        </div>
        <div class="flex flex-col sm:flex-row sm:space-x-8 space-y-2 sm:space-y-0 mb-6">
            <div class="bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-200 rounded-lg p-4 flex-1 min-w-0">
                <b>AEK</b><br>
                Kontostand: <span class="font-bold">${(finances.aekAthen.balance || 0).toLocaleString('de-DE')} €</span><br>
                Echtgeldschulden: <span class="font-bold">${(finances.aekAthen.debt || 0).toLocaleString('de-DE')} €</span>
            </div>
            <div class="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-200 rounded-lg p-4 flex-1 min-w-0">
                <b>Real</b><br>
                Kontostand: <span class="font-bold">${(finances.realMadrid.balance || 0).toLocaleString('de-DE')} €</span><br>
                Echtgeldschulden: <span class="font-bold">${(finances.realMadrid.debt || 0).toLocaleString('de-DE')} €</span>
            </div>
        </div>
        <div class="mb-4 flex flex-col sm:flex-row sm:justify-between items-stretch gap-2">
            <h3 class="text-md font-semibold dark:text-white">Transaktionen</h3>
            <button id="add-trans-btn" class="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto px-4 py-3 rounded-lg text-base flex items-center justify-center gap-2 font-semibold transition shadow">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Transaktion hinzufügen</span>
            </button>
        </div>
        <div class="overflow-x-auto w-full" style="max-width:100vw;">
          <div id="transactions-list" class="space-y-2"></div>
        </div>
    `;

    document.getElementById("add-trans-btn").onclick = openTransForm;
    renderTransactions();
}

let transactionGroups = [];
let selectedDateIdx = 0;

function groupTransactionsByDate(transactions) {
    const groups = {};
    for (const t of transactions) {
        // Handle both old (created_at) and new (date) field names
        const dateField = t.date || t.created_at;
        if (!dateField) continue;
        if (!groups[dateField]) groups[dateField] = [];
        // Normalize transaction structure for consistent rendering
        const normalizedTransaction = {
            ...t,
            date: dateField,
            info: t.info || t.description || 'Keine Beschreibung',
            type: t.type || 'Sonstiges'
        };
        groups[dateField].push(normalizedTransaction);
    }
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => ({
        date,
        items: groups[date]
    }));
}

function renderTransactions() {
    const container = document.getElementById('transactions-list');
    console.log('renderTransactions called with:', transactions.length, 'transactions');
    if (!transactions.length) {
        container.innerHTML = `<div class="text-gray-400 text-sm">Keine Transaktionen vorhanden.</div>`;
        return;
    }

    transactionGroups = groupTransactionsByDate(transactions);
    console.log('Transaction groups created:', transactionGroups.length, transactionGroups);
    if (selectedDateIdx >= transactionGroups.length) selectedDateIdx = 0;
    if (selectedDateIdx < 0) selectedDateIdx = 0;

    // Check if we have any valid transaction groups (transactions with dates)
    if (transactionGroups.length === 0) {
        container.innerHTML = `<div class="text-gray-400 text-sm">Keine gültigen Transaktionen mit Datum vorhanden.</div>`;
        return;
    }

    const { date, items } = transactionGroups[selectedDateIdx];

    // Matches sortieren wie Übersicht (neueste oben)
    let matchOrder = [];
    if (typeof matches !== "undefined" && Array.isArray(matches)) {
        matchOrder = matches.slice().sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    }

    function getAppMatchNumber(matchId) {
        const idx = matchOrder.findIndex(m => m.id == matchId);
        return idx >= 0 ? matchOrder.length - idx : null;
    }

    // Gruppiere Transaktionen nach match_id
    const matchGroups = [];
    const nonMatchTransactions = [];
    for (const match of matchOrder) {
        const matchTx = items.filter(t => t.match_id == match.id);
        if (matchTx.length) {
            matchGroups.push({ match, txs: matchTx });
        }
    }
    const matchIds = new Set(matchOrder.map(m => m.id));
    items.forEach(t => {
        if (!t.match_id || !matchIds.has(t.match_id)) {
            nonMatchTransactions.push(t);
        }
    });

    let html = "";

    function getCellBgClass(team) {
        if (team === "AEK") return "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 border-l-4 border-blue-500";
        if (team === "Real") return "bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 border-l-4 border-red-500";
        return "bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100";
    }

    // Match-Transaktionen
    matchGroups.forEach(({ match, txs }) => {
        const appNr = getAppMatchNumber(match.id);
        const matchInfo = match ? ` - AEK ${match.goalsa || 0}:${match.goalsb || 0} Real (${new Date(match.date).toLocaleDateString('de-DE')})` : '';
        html += `
        <div class="border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-900 rounded-lg mb-4 p-3 shadow-lg">
            <div class="font-bold text-yellow-800 dark:text-yellow-300 pl-2 mb-2 text-lg">
                Match #${appNr}${matchInfo}
            </div>
            <div class="overflow-x-auto">
                <!-- Desktop Table View -->
                <table class="hidden md:table w-full text-sm dark:bg-gray-800 dark:text-gray-100 bg-white rounded-lg overflow-hidden shadow">
                    <thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th class="p-3 text-left font-semibold">Datum</th>
                            <th class="p-3 text-left font-semibold">Typ</th>
                            <th class="p-3 text-left font-semibold">Team</th>
                            <th class="p-3 text-left font-semibold">Info</th>
                            <th class="p-3 text-left font-semibold">Betrag (€)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        txs.forEach(t => {
            html += `
                <tr class="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td class="p-3 ${getCellBgClass(t.team)}">${new Date(t.date).toLocaleDateString('de-DE')}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.type}</td>
                    <td class="p-3 ${getCellBgClass(t.team)} font-semibold">${t.team}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.info || '-'}</td>
                    <td class="p-3 font-bold ${getCellBgClass(t.team)} ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                        ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}
                    </td>
                </tr>
            `;
        });
        html += `
                    </tbody>
                </table>
                
                <!-- Mobile Card View -->
                <div class="md:hidden space-y-3">
        `;
        txs.forEach(t => {
            html += `
                <div class="bg-white dark:bg-gray-700 rounded-lg p-4 shadow border-l-4 ${t.team === 'AEK' ? 'border-blue-500' : t.team === 'Real' ? 'border-red-500' : 'border-gray-400'}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-sm text-gray-500 dark:text-gray-400">${new Date(t.date).toLocaleDateString('de-DE')}</div>
                        <div class="text-lg font-bold ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}€
                        </div>
                    </div>
                    <div class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">${t.type}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 mb-1">Team: <span class="font-semibold ${t.team === 'AEK' ? 'text-blue-600 dark:text-blue-400' : t.team === 'Real' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}">${t.team}</span></div>
                    ${t.info ? `<div class="text-sm text-gray-600 dark:text-gray-300">${t.info}</div>` : ''}
                </div>
            `;
        });
        html += `
                </div>
            </div>
        </div>
        `;
    });

    // Normale Transaktionen (ohne Match)
    if (nonMatchTransactions.length) {
        html += `
        <div class="border-2 border-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4 p-3 shadow-lg">
            <div class="font-bold text-gray-800 dark:text-gray-200 pl-2 mb-2 text-lg">
                Sonstige Transaktionen
            </div>
            <div class="overflow-x-auto">
                <!-- Desktop Table View -->
                <table class="hidden md:table w-full text-sm dark:bg-gray-700 dark:text-gray-100 bg-white rounded-lg overflow-hidden shadow">
                    <thead class="bg-gray-100 dark:bg-gray-600">
                        <tr>
                            <th class="p-3 text-left font-semibold">Datum</th>
                            <th class="p-3 text-left font-semibold">Typ</th>
                            <th class="p-3 text-left font-semibold">Team</th>
                            <th class="p-3 text-left font-semibold">Info</th>
                            <th class="p-3 text-left font-semibold">Betrag (€)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        nonMatchTransactions.forEach(t => {
            html += `
                <tr class="border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <td class="p-3 ${getCellBgClass(t.team)}">${new Date(t.date).toLocaleDateString('de-DE')}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.type}</td>
                    <td class="p-3 ${getCellBgClass(t.team)} font-semibold">${t.team}</td>
                    <td class="p-3 ${getCellBgClass(t.team)}">${t.info || '-'}</td>
                    <td class="p-3 font-bold ${getCellBgClass(t.team)} ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                        ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}
                    </td>
                </tr>
            `;
        });
        html += `
                    </tbody>
                </table>
                
                <!-- Mobile Card View -->
                <div class="md:hidden space-y-3">
        `;
        nonMatchTransactions.forEach(t => {
            html += `
                <div class="bg-white dark:bg-gray-700 rounded-lg p-4 shadow border-l-4 ${t.team === 'AEK' ? 'border-blue-500' : t.team === 'Real' ? 'border-red-500' : 'border-gray-400'}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-sm text-gray-500 dark:text-gray-400">${new Date(t.date).toLocaleDateString('de-DE')}</div>
                        <div class="text-lg font-bold ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}€
                        </div>
                    </div>
                    <div class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">${t.type}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 mb-1">Team: <span class="font-semibold ${t.team === 'AEK' ? 'text-blue-600 dark:text-blue-400' : t.team === 'Real' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}">${t.team}</span></div>
                    ${t.info ? `<div class="text-sm text-gray-600 dark:text-gray-300">${t.info}</div>` : ''}
                </div>
            `;
        });
        html += `
                </div>
            </div>
        </div>`;
    }

    // Navigation Buttons
    html += `<div class="flex gap-3 mt-6 justify-center">`;
    if (selectedDateIdx < transactionGroups.length - 1) {
        html += `<button id="older-trans-btn" class="bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors">
            <i class="fas fa-chevron-left mr-2"></i>Ältere Transaktionen
        </button>`;
    }
    if (selectedDateIdx > 0) {
        html += `<button id="newer-trans-btn" class="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-colors">
            Neuere Transaktionen<i class="fas fa-chevron-right ml-2"></i>
        </button>`;
    }
    html += `</div>`;

    container.innerHTML = html;

    if (selectedDateIdx < transactionGroups.length - 1) {
        document.getElementById('older-trans-btn').onclick = () => {
            selectedDateIdx++;
            renderTransactions();
        };
    }
    if (selectedDateIdx > 0) {
        document.getElementById('newer-trans-btn').onclick = () => {
            selectedDateIdx--;
            renderTransactions();
        };
    }
}

function openTransForm() {
    showModal(`
        <form id="trans-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-white dark:bg-gray-800 rounded-lg text-black dark:text-white">
            <h3 class="font-bold text-lg mb-2">Transaktion hinzufügen</h3>
            <select name="team" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required>
                <option value="">Team wählen</option>
                <option value="AEK">AEK</option>
                <option value="Real">Real</option>
            </select>
            <select name="type" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required>
                <option value="Sonstiges">Sonstiges</option>
                <option value="Spielerkauf">Spielerkauf</option>
                <option value="Spielerverkauf">Spielerverkauf</option>
                <option value="Echtgeld-Ausgleich">Echtgeld-Ausgleich</option>
            </select>
            <input type="number" step="any" name="amount" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required placeholder="Betrag (negativ für Abzug)">
            <input type="text" name="info" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Zusatzinfo (Spielername, Kommentar)">
            <div class="flex gap-2">
                <button type="submit" class="bg-green-600 hover:bg-green-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition flex gap-2 items-center justify-center">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  Speichern
                </button>
                <button type="button" class="bg-gray-200 dark:bg-gray-700 w-full px-4 py-3 rounded-lg text-base font-semibold" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);

    document.getElementById("trans-form").onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const team = f.team.value;
        const type = f.type.value;
        const amount = parseInt(f.amount.value, 10) || 0;
        const now = new Date().toISOString().slice(0,10);
        const info = f.info.value?.trim() || "";

        await saveTransaction({
            date: now,
            type, team, amount, info
        });

        const transactionText = amount >= 0 ? "Einnahme" : "Ausgabe";
        showSuccessAndCloseModal(`${transactionText} erfolgreich hinzugefügt`);
    };
}

export function resetFinanzenState() {
    finances = {
        aekAthen: { balance: 0, debt: 0 },
        realMadrid: { balance: 0, debt: 0 }
    };
    transactions = [];
}