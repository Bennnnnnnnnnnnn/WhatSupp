// Supabase Configuration for WhatSupp
const SUPABASE_CONFIG = {
    url: 'https://zwmacqoaycjrgemmhevu.supabase.co',
    key: 'sb_publishable_mMPJTpWFY4Ig1L-gpnDwBw_5sxnWcAy'
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