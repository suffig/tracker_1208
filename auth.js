import { supabase } from './supabaseClient.js';
import { ErrorHandler, FormValidator } from './utils.js';
import { resetKaderState } from './kader.js';
import { resetBansState } from './bans.js';
import { resetFinanzenState } from './finanzen.js';
import { resetMatchesState } from './matches.js';

export async function signUp(email, password) {
    try {
        // Validate inputs
        FormValidator.validateRequired(email, 'E-Mail');
        FormValidator.validateRequired(password, 'Passwort');
        FormValidator.validateEmail(email);
        
        if (password.length < 6) {
            throw new Error('Passwort muss mindestens 6 Zeichen haben');
        }

        const { error } = await supabase.auth.signUp({ 
            email: FormValidator.sanitizeInput(email), 
            password 
        });
        
        if (error) throw error;
        
        ErrorHandler.showUserError('Bitte bestätige deine Email und logge dich dann ein.', 'success');
    } catch (error) {
        ErrorHandler.handleDatabaseError(error, 'Registrierung');
    }
}

export async function signIn(email, password) {
    try {
        // Validate inputs
        FormValidator.validateRequired(email, 'E-Mail');
        FormValidator.validateRequired(password, 'Passwort');
        FormValidator.validateEmail(email);

        const { error } = await supabase.auth.signInWithPassword({ 
            email: FormValidator.sanitizeInput(email), 
            password 
        });
        
        if (error) throw error;
        
        console.log('Angemeldet!');
        ErrorHandler.showUserError('Erfolgreich angemeldet!', 'success');
    } catch (error) {
        ErrorHandler.handleDatabaseError(error, 'Anmeldung');
    }
}

export async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        // Reset all module states safely
        const resetFunctions = [
            resetKaderState,
            resetBansState, 
            resetFinanzenState,
            resetMatchesState
        ];

        resetFunctions.forEach(resetFn => {
            if (typeof resetFn === "function") {
                try {
                    resetFn();
                } catch (error) {
                    console.error('Error resetting module state:', error);
                }
            }
        });

        ErrorHandler.showUserError('Erfolgreich abgemeldet!', 'success');
    } catch (error) {
        ErrorHandler.handleDatabaseError(error, 'Abmeldung');
    }
}