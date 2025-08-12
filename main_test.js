// Test each import individually
console.log('Testing auth.js');
import('./auth.js').then(() => console.log('auth.js OK')).catch(e => console.error('auth.js ERROR:', e));

console.log('Testing kader.js');
import('./kader.js').then(() => console.log('kader.js OK')).catch(e => console.error('kader.js ERROR:', e));

console.log('Testing bans.js');
import('./bans.js').then(() => console.log('bans.js OK')).catch(e => console.error('bans.js ERROR:', e));

console.log('Testing matches.js');
import('./matches.js').then(() => console.log('matches.js OK')).catch(e => console.error('matches.js ERROR:', e));

console.log('Testing stats.js');
import('./stats.js').then(() => console.log('stats.js OK')).catch(e => console.error('stats.js ERROR:', e));

console.log('Testing finanzen.js');
import('./finanzen.js').then(() => console.log('finanzen.js OK')).catch(e => console.error('finanzen.js ERROR:', e));

console.log('Testing spieler.js');
import('./spieler.js').then(() => console.log('spieler.js OK')).catch(e => console.error('spieler.js ERROR:', e));