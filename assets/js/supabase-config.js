// Supabase Configuration for WhatSupp
const SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL', // Replace with your actual Supabase URL
    key: 'YOUR_SUPABASE_ANON_KEY' // Replace with your actual anon key
};

// Initialize Supabase client
let supabaseClient;

function initializeSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('Supabase library not loaded');
        return null;
    }
    
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    }
    
    return supabaseClient;
}

window.SupabaseConfig = {
    client: () => initializeSupabase(),
    isReady: () => !!supabaseClient
};

$(document).ready(function() {
    initializeSupabase();
});