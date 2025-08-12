import { supabase, supabaseDb, usingFallback } from './supabaseClient.js';
import { connectionMonitor, isDatabaseAvailable } from './connectionMonitor.js';
import { dataManager } from './dataManager.js';
import { loadingManager, ErrorHandler, eventBus } from './utils.js';

import { signUp, signIn, signOut } from './auth.js';
import { renderKaderTab } from './kader.js';
import { renderBansTab } from './bans.js';
import { renderMatchesTab } from './matches.js';
import { renderStatsTab } from './stats.js';
import { renderFinanzenTab } from './finanzen.js';
import { renderSpielerTab } from './spieler.js';

// --- NEU: Reset-Functions für alle Module importieren ---
import { resetKaderState } from './kader.js';
import { resetBansState } from './bans.js';
import { resetFinanzenState } from './finanzen.js';
import { resetMatchesState } from './matches.js';
// Falls du sie hast:
import { resetStatsState } from './stats.js';
import { resetSpielerState } from './spieler.js';

let currentTab = "squad";
let liveSyncInitialized = false;
let tabButtonsInitialized = false;
let realtimeChannel = null;
let isAppVisible = true;
let inactivityCleanupTimer = null;

console.log("main.js gestartet");

// --- Connection status indicator ---
function updateConnectionStatus(status) {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    if (status.connected) {
        indicator.textContent = status.reconnected ? 'Verbindung wiederhergestellt' : 'Online';
        indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-green-500 text-white';
        if (status.reconnected) {
            setTimeout(() => {
                indicator.textContent = 'Online';
            }, 3000);
        }
    } else {
        if (status.networkOffline) {
            indicator.textContent = 'Offline';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-gray-500 text-white';
        } else if (status.sessionExpired) {
            indicator.textContent = 'Session abgelaufen – bitte neu anmelden';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-700 text-white';
        } else if (status.reconnecting) {
            indicator.textContent = `Verbinde... (${status.attempt}/5)`;
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-yellow-500 text-white';
        } else if (status.maxAttemptsReached) {
            indicator.textContent = 'Verbindung unterbrochen';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-500 text-white';
        } else {
            indicator.textContent = 'Verbindung verloren';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-500 text-white';
        }
    }
}

// --- Session expiry UI handler (for supabaseClient.js event dispatch) ---
window.addEventListener('supabase-session-expired', () => {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    indicator.textContent = 'Session abgelaufen – bitte neu anmelden';
    indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-700 text-white';
});

// Handle app visibility changes to prevent crashes during inactivity
function handleVisibilityChange() {
    const wasVisible = isAppVisible;
    isAppVisible = !document.hidden;

    if (!isAppVisible && wasVisible) {
        inactivityCleanupTimer = setTimeout(() => {
            cleanupRealtimeSubscriptions();
            connectionMonitor.pauseHealthChecks();
        }, 5 * 60 * 1000);
    } else if (isAppVisible && !wasVisible) {
        if (inactivityCleanupTimer) {
            clearTimeout(inactivityCleanupTimer);
            inactivityCleanupTimer = null;
        }
        connectionMonitor.resumeHealthChecks();
        supabase.auth.getSession().then(({data: {session}}) => {
            if(session) {
                // NEU: Reset aller lokalen Daten-States
				tabButtonsInitialized = false;
                liveSyncInitialized = false;
                if (typeof resetKaderState === "function") resetKaderState();
                if (typeof resetBansState === "function") resetBansState();
                if (typeof resetFinanzenState === "function") resetFinanzenState();
                if (typeof resetMatchesState === "function") resetMatchesState();
                if (typeof resetStatsState === "function") resetStatsState();
                if (typeof resetSpielerState === "function") resetSpielerState();
                setupTabButtons();
                subscribeAllLiveSync();
                renderCurrentTab(); // <-- erzwingt Daten-Reload!
            } else {
                renderLoginArea();
            }
        });
    }
}

function cleanupRealtimeSubscriptions() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
        liveSyncInitialized = false;
    }
}

function showTabLoader(show = true) {
    const loader = document.getElementById('tab-loader');
    if (loader) {
        loader.style.display = show ? "flex" : "none";
    }
    
    // Use centralized loading manager
    if (show) {
        loadingManager.show('tab-loading');
    } else {
        loadingManager.hide('tab-loading');
    }
}

// --- Bottom Navbar Indicator ---
function updateBottomNavActive(tab) {
    try {
        document.querySelectorAll('.nav-indicator').forEach(ind => {
            ind.className = 'nav-indicator';
        });
        
        const navElement = document.getElementById(`nav-${tab}`);
        const indicator = navElement?.querySelector('.nav-indicator');
        if (indicator) {
            indicator.classList.add('active', `indicator-${tab}`);
        }
    } catch (error) {
        console.error('Error updating bottom nav:', error);
    }
}

async function switchTab(tab) {
    try {
        currentTab = tab;
        
        // Update bottom navigation only
        updateBottomNavActive(tab);
        showTabLoader(true);
        
        // Add small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 200));
        
        await renderCurrentTab();
        showTabLoader(false);
    } catch (error) {
        console.error('Error switching tab:', error);
        ErrorHandler.showUserError('Fehler beim Wechseln des Tabs');
        showTabLoader(false);
    }
}

async function renderCurrentTab() {
    const appDiv = document.getElementById("app");
    if (!appDiv) {
        console.error('App container not found');
        return;
    }
    
    try {
        appDiv.innerHTML = "";
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            appDiv.innerHTML = `<div class="text-red-700 text-center py-6">Nicht angemeldet. Bitte einloggen.</div>`;
            return;
        }
        
        console.log("renderCurrentTab mit currentTab:", currentTab);
        
        // Use a more structured approach for tab rendering
        const tabRenderers = {
            'squad': () => renderKaderTab("app"),
            'bans': () => renderBansTab("app"),
            'matches': () => renderMatchesTab("app"),
            'stats': () => renderStatsTab("app"),
            'finanzen': () => renderFinanzenTab("app"),
            'spieler': () => renderSpielerTab("app")
        };
        
        const renderer = tabRenderers[currentTab];
        if (renderer) {
            await renderer();
        } else {
            console.warn(`No renderer found for tab: ${currentTab}`);
            appDiv.innerHTML = `<div class="text-yellow-700 text-center py-6">Unbekannter Tab: ${currentTab}</div>`;
        }
    } catch (error) {
        console.error('Error rendering tab:', error);
        ErrorHandler.handleDatabaseError(error, 'Tab laden');
        appDiv.innerHTML = `<div class="text-red-700 text-center py-6">Fehler beim Laden des Tabs. Bitte versuchen Sie es erneut.</div>`;
    }
}

function setupTabButtons() {
    // Since we're only using bottom navigation, no desktop tab setup needed
    tabButtonsInitialized = true;
}

// Bottom Navigation für Mobile Geräte
function setupBottomNav() {
    document.getElementById("nav-squad")?.addEventListener("click", e => { e.preventDefault(); switchTab("squad"); });
    document.getElementById("nav-matches")?.addEventListener("click", e => { e.preventDefault(); switchTab("matches"); });
    document.getElementById("nav-bans")?.addEventListener("click", e => { e.preventDefault(); switchTab("bans"); });
    document.getElementById("nav-finanzen")?.addEventListener("click", e => { e.preventDefault(); switchTab("finanzen"); });
    document.getElementById("nav-stats")?.addEventListener("click", e => { e.preventDefault(); switchTab("stats"); });
    document.getElementById("nav-spieler")?.addEventListener("click", e => { e.preventDefault(); switchTab("spieler"); });
}
window.addEventListener('DOMContentLoaded', setupBottomNav);

function subscribeAllLiveSync() {
	cleanupRealtimeSubscriptions();
    liveSyncInitialized = false; // <-- redundantes Reset, schadet aber nicht!
    if (liveSyncInitialized || !isAppVisible) return;
    realtimeChannel = supabase
        .channel('global_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bans' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spieler_des_spiels' }, () => renderCurrentTab())
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                liveSyncInitialized = true;
            } else if (status === 'CHANNEL_ERROR') {
                liveSyncInitialized = false;
                if (isAppVisible) setTimeout(() => {
                    if (!liveSyncInitialized && isAppVisible) subscribeAllLiveSync();
                }, 5000);
            } else if (status === 'CLOSED') {
                liveSyncInitialized = false;
                if (isDatabaseAvailable() && isAppVisible) setTimeout(() => {
                    if (isAppVisible) subscribeAllLiveSync();
                }, 2000);
            }
        });
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
			alert('Du wurdest ausgeloggt!');
            await signOut();
            let tries = 0;
            while (tries < 20) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) break;
                await new Promise(res => setTimeout(res, 100));
                tries++;
            }
            // window.location.reload(); // Entfernt!
            liveSyncInitialized = false;
            tabButtonsInitialized = false;
            cleanupRealtimeSubscriptions();
            if (inactivityCleanupTimer) {
                clearTimeout(inactivityCleanupTimer);
                inactivityCleanupTimer = null;
            }
            connectionMonitor.removeListener(updateConnectionStatus);
            renderLoginArea();
        };
    }
}

async function renderLoginArea() {
	console.log("renderLoginArea aufgerufen");
    const loginDiv = document.getElementById('login-area');
    const appContainer = document.querySelector('.app-container');
    if (!loginDiv || !appContainer) {
        document.body.innerHTML = `<div style="color:red;padding:2rem;text-align:center">
          Kritischer Fehler: UI-Container nicht gefunden.<br>
          Bitte Seite neu laden oder Admin kontaktieren.
        </div>`;
        return;
    }
    const logoutBtn = document.getElementById('logout-btn');
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        loginDiv.innerHTML = "";
        appContainer.style.display = '';
        if (logoutBtn) logoutBtn.style.display = "";
        setupLogoutButton();
        setupTabButtons();
        connectionMonitor.addListener(updateConnectionStatus);
        if (!tabButtonsInitialized) {
            switchTab(currentTab);
        } else {
            renderCurrentTab();
        }
        subscribeAllLiveSync();
    } else {
        // Das Loginformular NICHT komplett neu bauen, sondern Felder erhalten!
        let emailValue = "";
        let pwValue = "";
        if (document.getElementById('email')) emailValue = document.getElementById('email').value;
        if (document.getElementById('pw')) pwValue = document.getElementById('pw').value;
        loginDiv.innerHTML = `
            <div class="flex flex-col items-center mb-3">
                <img src="assets/logo.png" alt="Logo" class="w-60 h-60 mb-2" />
            </div>
            <form id="loginform" class="login-area flex flex-col gap-4">
                <input type="email" id="email" required placeholder="E-Mail" class="rounded border px-6 py-3 focus:ring focus:ring-blue-200" value="${emailValue}" />
                <input type="password" id="pw" required placeholder="Passwort" class="rounded border px-6 py-3 focus:ring focus:ring-blue-200" value="${pwValue}" />
				<div class="flex gap-2 w-full">
				  <button
					class="login-btn bg-blue-600 text-white font-bold text-lg md:text-xl py-4 w-full rounded-2xl shadow-lg hover:bg-fuchsia-500 active:scale-95 transition-all duration-150 outline-none ring-2 ring-transparent focus:ring-blue-300"
					style="min-width:180px;">
					<i class="fas fa-sign-in-alt mr-2"></i> Login
				  </button>
				</div>
            </form>
        `;
        appContainer.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = "none";
        liveSyncInitialized = false;
        tabButtonsInitialized = false;
        cleanupRealtimeSubscriptions();
        if (inactivityCleanupTimer) {
            clearTimeout(inactivityCleanupTimer);
            inactivityCleanupTimer = null;
        }
        connectionMonitor.removeListener(updateConnectionStatus);
        const loginForm = document.getElementById('loginform');
        if (loginForm) {
            loginForm.onsubmit = async e => {
                e.preventDefault();
                await signIn(email.value, pw.value);
            };
        }
    }
}

// Nur HIER wird der Render-Flow getriggert!
supabase.auth.onAuthStateChange((_event, _session) => renderLoginArea());
window.addEventListener('DOMContentLoaded', async () => {
	console.log("DOMContentLoaded!");
    
    // Show fallback status if using fallback mode
    if (usingFallback) {
        showFallbackStatus();
    }
    
    await renderLoginArea();
});

// Show fallback status indicator
function showFallbackStatus() {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    indicator.textContent = 'Demo-Modus (Supabase nicht konfiguriert)';
    indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-blue-500 text-white cursor-pointer';
    
    // Add click handler to show configuration help
    indicator.onclick = () => {
        alert(`Demo-Modus aktiv\n\nUm eine echte Supabase-Verbindung zu verwenden:\n\n1. Ersetzen Sie SUPABASE_URL in supabaseClient.js\n2. Ersetzen Sie SUPABASE_ANON_KEY in supabaseClient.js\n3. Stellen Sie sicher, dass die Supabase CDN geladen werden kann\n\nMomentan werden keine echten Daten geladen.`);
    };
}

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', () => {
    cleanupRealtimeSubscriptions();
    if (inactivityCleanupTimer) {
        clearTimeout(inactivityCleanupTimer);
    }
    connectionMonitor.destroy();
});