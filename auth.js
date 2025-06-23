import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Please verify these values carefully from your Supabase project's API settings.
const supabaseUrl = 'https://argfftfjsojipfoquple.supabase.co';      // <-- PASTE YOUR PROJECT URL HERE
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZ2ZmdGZqc29qaXBmb3F1cGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMTkxODEsImV4cCI6MjA2NDc5NTE4MX0.wweqEwfg0UDQZJD3KfcqTzsV3HdrWVm9pAWfriuGFas'; // <-- PASTE YOUR ANON KEY HERE

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Export for use in other modules
export { supabaseUrl, supabaseAnonKey };

/**
 * Signs up a new user.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    if (error) {
        console.error('Error signing up:', error.message);
        alert(`Sign-up Error: ${error.message}`);
    }
    return { data, error };
}

/**
 * Logs in an existing user.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function logIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (error) {
        console.error('Error logging in:', error.message);
        alert(`Login Error: ${error.message}`);
    } else if (data.user) {
        window.location.href = '/dashboard.html'; // Redirect on successful login
    }
    return { data, error };
}

/**
 * Logs out the current user.
 */
export async function logOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error logging out:', error.message);
    } else {
        window.location.href = '/'; // Redirect to home on successful logout
    }
}

/**
 * Checks if a user is currently logged in and redirects them if not.
 * @param {string} redirectTo - The page to redirect to if not authenticated.
 * @returns {Promise<User|null>}
 */
export async function protectPage() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = `/?redirect=${window.location.pathname}`;
    }
    return user;
}

/**
 * Gets the current logged-in user.
 * @returns {Promise<User|null>}
 */
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function handleLogin(email) {
    // ... existing code ...
} 