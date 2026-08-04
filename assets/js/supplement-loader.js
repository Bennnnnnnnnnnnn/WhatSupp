// Dynamic Supplement Loader for WhatSupp
const DEBUG = false;

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

function debugWarn(...args) {
    if (DEBUG) {
        console.warn(...args);
    }
}

function getSupplementAffiliateLink(supplement) {
    if (!supplement || typeof supplement !== 'object') return '';
    debugLog('getSupplementAffiliateLink() called with supplement keys:', Object.keys(supplement));

    const candidateFields = [
        'link',
        'links',
        'affiliate_link',
        'affiliatelink',
        'affiliate_url',
        'affiliateurl',
        'amazon_affiliate_link',
        'amazonaffiliatelink',
        'amazon_link',
        'amazonlink',
        'amazon_url',
        'amazonurl',
        'shop_now_link',
        'shopnowlink',
        'shop_link',
        'shop_url',
        'shopurl',
        'store_url',
        'storeurl',
        'product_link',
        'productlink',
        'product_url',
        'producturl',
        'purchase_link',
        'purchaseurl',
        'purchase_url',
        'buy_link',
        'buyurl',
        'buy_url',
        'buy_now_link',
        'buynowlink',
        'buy_now_url',
        'buynowurl',
        'external_url',
        'externalurl',
        'checkout_url',
        'checkouturl',
        'url'
    ];

    // Build a case-insensitive lookup so column naming differences still work.
    const keyLookup = {};
    Object.keys(supplement).forEach(key => {
        keyLookup[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = key;
    });

    for (const field of candidateFields) {
        const normalizedField = field.toLowerCase().replace(/[^a-z0-9]/g, '');
        const sourceKey = keyLookup[normalizedField] || field;
        const value = supplement[sourceKey];
        if (typeof value === 'string' && value.trim()) {
            debugLog('Found affiliate link in field:', sourceKey, 'value:', value);
            return normalizeExternalUrl(value);
        }
    }

    // Final fallback: first likely affiliate/url-like key.
    const fuzzyKey = Object.keys(supplement).find(key => {
        const val = supplement[key];
        const isLikelyLinkField = /(affiliate|amazon|shop|buy|product|store|checkout|external).*(link|url)|(link|url)/i.test(key);
        const hasValidValue = typeof val === 'string' && val.trim();
        return isLikelyLinkField && hasValidValue;
    });
    debugLog('Fuzzy fallback key matched:', fuzzyKey, 'value:', fuzzyKey ? supplement[fuzzyKey] : 'N/A');
    if (fuzzyKey && typeof supplement[fuzzyKey] === 'string' && supplement[fuzzyKey].trim()) {
        debugLog('Using fuzzy matched field:', fuzzyKey);
        return normalizeExternalUrl(supplement[fuzzyKey]);
    }

    debugLog('No affiliate link found for supplement');
    return '';
}

function normalizeExternalUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return '';

    let cleaned = rawUrl.trim().replace(/^['"]|['"]$/g, '');
    if (!cleaned) return '';

    // Block obviously unsafe pseudo-links.
    if (/^javascript:/i.test(cleaned)) return '';

    // Support URLs entered as plain text in DB (without protocol).
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
        cleaned = `https://${cleaned}`;
    }

    return cleaned;
}

function applyExternalLink(anchor, url) {
    if (!anchor) return;

    if (url) {
        anchor.setAttribute('href', url);
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer sponsored nofollow');
    } else {
        anchor.setAttribute('href', '#');
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
    }
}

class SupplementLoader {
    constructor() {
        this.supabase = null;
        this.currentSupplement = null;
        this.init();
    }

    async init() {
        // Wait for Supabase to be ready
        let attempts = 0;
        while (attempts < 10) {
            if (typeof SupabaseConfig !== 'undefined' && SupabaseConfig.isReady()) {
                this.supabase = SupabaseConfig.client();
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }

        if (!this.supabase) {
            this.showError('Database connection failed');
            return;
        }

        await this.loadSupplementFromURL();
    }

    getURLParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        const param = urlParams.get(name);
        // Properly decode URL parameters and handle plus signs
        return param ? decodeURIComponent(param.replace(/\+/g, ' ')) : null;
    }

    async loadSupplementFromURL() {
        try {
            const supplementId = this.getURLParameter('id');
            const supplementSlug = this.getURLParameter('slug') || this.getURLParameter('name');
            
            if (supplementId) {
                await this.loadSupplementById(parseInt(supplementId));
            } else if (supplementSlug) {
                await this.loadSupplementByName(supplementSlug);
            } else {
                await this.loadDefaultSupplement();
            }
        } catch (error) {
            console.error('Error loading supplement:', error);
            this.showError('Failed to load supplement data');
        }
    }

    async loadSupplementById(id) {
        try {
            const { data, error } = await this.supabase
                .from('Supplement')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                this.currentSupplement = data;
                await this.populateTemplate();
            }
        } catch (error) {
            this.showError('Supplement not found');
        }
    }

    async loadSupplementByName(nameOrSlug) {
        try {
            // Clean and normalize the input - handle URL encoding properly
            let cleanName = nameOrSlug;
            
            // First decode any URL encoding
            try {
                cleanName = decodeURIComponent(cleanName);
            } catch (e) {
                // If decoding fails, use original
            }
            
            // Replace plus signs and hyphens with spaces, then trim
            cleanName = cleanName.replace(/\+/g, ' ').replace(/-/g, ' ').trim();
            
            // Try case-insensitive text search first (most reliable)
            let { data, error } = await this.supabase
                .from('Supplement')
                .select('*')
                .textSearch('name', `"${cleanName}"`, {
                    type: 'websearch'
                })
                .limit(1)
                .single();

            // If not found, try partial name search using contains
            if (!data && (error?.code === 'PGRST116' || !error)) {
                const searchTerms = cleanName.toLowerCase().split(' ');
                let query = this.supabase
                    .from('Supplement')
                    .select('*');
                
                // Search for supplements containing all words
                for (const term of searchTerms) {
                    query = query.ilike('name', `%${term}%`);
                }
                
                ({ data, error } = await query
                    .limit(1)
                    .single());
            }

            if (error && error.code !== 'PGRST116') throw error;

            if (data) {
                this.currentSupplement = data;
                await this.populateTemplate();
            } else {
                throw new Error('Supplement not found');
            }
        } catch (error) {
            console.error('Error in loadSupplementByName:', error);
            this.showError(`Supplement "${nameOrSlug}" not found`);
        }
    }

    async loadDefaultSupplement() {
        try {
            const { data, error } = await this.supabase
                .from('Supplement')
                .select('*')
                .limit(1)
                .single();

            if (error) throw error;
            if (data) {
                this.currentSupplement = data;
                await this.populateTemplate();
            }
        } catch (error) {
            this.showError('No supplement data available');
        }
    }

    async populateTemplate() {
        if (!this.currentSupplement) return;

        this.updatePageMetadata();
        this.setBackgroundImage();
        this.updateShopNowButton();
        this.populateInfoBox();
        this.populateOverview();
        this.populateBenefits();
        this.populateResearch();
        this.populateDosage();
        this.populateSafety();
        this.populateCombinations();
        this.populateReferences();
    }

    updatePageMetadata() {
        const supplement = this.currentSupplement;
        document.title = `${supplement.name} - Scientific Evidence | WhatSupp`;
    }

    setBackgroundImage() {
        const defaultImages = ['images/MuscleMAn.png', 'images/muscleGirl.png'];
        const randomImage = defaultImages[Math.floor(Math.random() * defaultImages.length)];
        $('body').css('background-image', 'url(' + randomImage + ')');
    }

    updateShopNowButton() {
        const affiliateLink = getSupplementAffiliateLink(this.currentSupplement);
        const shopNowLinks = document.querySelectorAll('.nav-links a.button.primary.small');

        shopNowLinks.forEach(link => {
            if (/shop now/i.test(link.textContent || '')) {
                applyExternalLink(link, affiliateLink);
            }
        });
    }

    populateInfoBox() {
        const s = this.currentSupplement;
        
        $('.info-box-header h4').text(s.name || 'Unknown Supplement');
        
        const infoContent = `
            <div class="info-row">
                <div class="info-label">Chemical Formula</div>
                <div class="info-value">${s.chemical_formula || 'N/A'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Molar Mass</div>
                <div class="info-value">${s.molar_mass || 'N/A'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Evidence Level</div>
                <div class="info-value ${this.getEvidenceClass(s.evidence_level)}">${s.evidence_level || 'Unknown'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Safety Rating</div>
                <div class="info-value ${this.getSafetyClass(s.safety_rating)}">${s.safety_rating || 'Unknown'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Standard Dose</div>
                <div class="info-value">${s.standard_dose || 'Varies'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Timing</div>
                <div class="info-value">${s.timing || 'Anytime'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Loading Phase</div>
                <div class="info-value">${s.loading_phase || 'N/A'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Cost/Serving</div>
                <div class="info-value highlight">${s.cost_per_serving || 'Unknown'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Primary Uses</div>
                <div class="info-value">${s.primary_uses || 'General health'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Contraindications</div>
                <div class="info-value warning">${s.contraindications || 'None known'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Drug Interactions</div>
                <div class="info-value highlight">${s.drug_interactions || 'None known'}</div>
            </div>
            <div class="info-row">
                <div class="info-label">Studies</div>
                <div class="info-value">${s.studies_count || 0}+ published</div>
            </div>
        `;
        
        $('.info-box-content').html(infoContent);
    }

    populateOverview() {
        const s = this.currentSupplement;
        
        const overviewText = s.overview || 'No overview available for this supplement.';
        $('#overview p').first().text(overviewText);
        
        // Handle mechanism data
        let mechanismData = this.parseJSON(s.mechanism);
        if (mechanismData && Array.isArray(mechanismData)) {
            let mechanismHTML = '<h4>How It Works:</h4><ul>';
            mechanismData.forEach(item => {
                Object.entries(item).forEach(([key, value]) => {
                    mechanismHTML += `<li><strong>${key}:</strong> ${value}</li>`;
                });
            });
            mechanismHTML += '</ul>';
            
            $('#overview h4, #overview ul').remove();
            $('#overview').append(mechanismHTML);
        }
    }

    populateBenefits() {
        const s = this.currentSupplement;
        let benefits = this.parseJSON(s.benefits);
        
        if (benefits && Array.isArray(benefits)) {
            let benefitsHTML = '';
            benefits.forEach(benefit => {
                benefitsHTML += `
                    <div class="study-card">
                        <div class="study-title">${benefit.title || 'Benefit'}</div>
                        <div class="study-meta">${benefit.confidence || 'Evidence Available'}</div>
                        <p>${benefit.description || 'No description available.'}</p>
                        <div class="study-result">
                            <strong>Effect Size:</strong> ${benefit.effect_size || 'Variable effects observed'}
                        </div>
                    </div>
                `;
            });
            $('#benefits .studies-grid').html(benefitsHTML);
        }
    }

    populateResearch() {
        const s = this.currentSupplement;
        let studies = this.parseJSON(s.key_studies);
        
        if (studies && Array.isArray(studies)) {
            let researchHTML = '';
            studies.forEach(study => {
                researchHTML += `
                    <div class="study-card">
                        <div class="study-title">"${study.title || 'Research Study'}"</div>
                        <div class="study-meta">${study.authors || 'Authors not specified'}</div>
                        <p>${study.description || 'Study details not available.'}</p>
                        <div class="study-result">
                            <strong>Findings:</strong> Positive outcomes observed
                        </div>
                    </div>
                `;
            });
            $('#research .studies-grid').html(researchHTML);
        }
    }

    populateDosage() {
        const s = this.currentSupplement;
        let dosageTable = this.parseJSON(s.dosage_table);
        
        if (dosageTable && Array.isArray(dosageTable)) {
            let tableHTML = `
                <thead>
                    <tr><th>Protocol</th><th>Dosage</th><th>Duration</th><th>Notes</th></tr>
                </thead>
                <tbody>
            `;
            
            dosageTable.forEach(row => {
                tableHTML += `
                    <tr>
                        <td><strong>${row.protocol || 'Standard'}</strong></td>
                        <td>${row.dosage || s.standard_dose || 'As needed'}</td>
                        <td>${row.duration || 'Ongoing'}</td>
                        <td>${row.notes || ''}</td>
                    </tr>
                `;
            });
            
            tableHTML += '</tbody>';
            $('.dosage-table').html(tableHTML);
        }
    }

    populateSafety() {
        const s = this.currentSupplement;
        let safetyNotes = this.parseJSON(s.safety_notes);
        
        if (safetyNotes && Array.isArray(safetyNotes)) {
            let safetyHTML = '<h4>Safety Considerations:</h4><ul>';
            safetyNotes.forEach(note => {
                safetyHTML += `<li>${note.note || note}</li>`;
            });
            safetyHTML += '</ul>';
            
            const safetySection = $('#safety');
            safetySection.find('h4:contains("Safety Considerations:")').remove();
            safetySection.find('ul').remove();
            safetySection.append(safetyHTML);
        }
    }

    populateCombinations() {
        const s = this.currentSupplement;
        let combinations = this.parseJSON(s.combinations);
        
        if (combinations && Array.isArray(combinations)) {
            let combosHTML = '';
            combinations.forEach(combo => {
                combosHTML += `
                    <div class="study-card">
                        <div class="study-title">${s.name} + ${combo.combo || 'Other Supplement'}</div>
                        <div class="study-meta">${combo.effect || 'Supplement Combination'}</div>
                        <p>Combining ${s.name} with ${combo.combo || 'other supplements'} may provide enhanced benefits.</p>
                        <div class="study-result">
                            <strong>Interaction:</strong> ${combo.effect || 'Generally safe to combine'}
                        </div>
                    </div>
                `;
            });
            $('#combinations .studies-grid').html(combosHTML);
        }
    }

    populateReferences() {
        const s = this.currentSupplement;
        let references = this.parseJSON(s.references);
        
        if (references && Array.isArray(references)) {
            let referencesHTML = '';
            references.forEach(ref => {
                const citation = ref.citation || ref;
                referencesHTML += `<li>${citation}</li>`;
            });
            $('.reference-list ol').html(referencesHTML);
        }
    }

    parseJSON(field) {
        if (!field) return null;
        if (typeof field === 'string') {
            try { return JSON.parse(field); } catch { return null; }
        }
        return field;
    }

    getEvidenceClass(level) {
        if (!level) return '';
        const levelLower = level.toLowerCase();
        if (levelLower.includes('very high') || levelLower.includes('high')) {
            return 'highlight';
        } else if (levelLower.includes('low')) {
            return 'warning';
        }
        return '';
    }

    getSafetyClass(rating) {
        if (!rating) return '';
        const ratingLower = rating.toLowerCase();
        if (ratingLower.includes('very safe') || ratingLower.includes('safe')) {
            return 'highlight';
        } else if (ratingLower.includes('caution')) {
            return 'warning';
        } else if (ratingLower.includes('unsafe')) {
            return 'danger';
        }
        return '';
    }

    showError(message) {
        const errorHTML = `
            <div class="wiki-section" style="text-align: center; margin-top: 2rem;">
                <h3>⚠️ ${message}</h3>
                <p>Unable to load supplement information.</p>
                <p><a href="index.html" class="button">← Return to Home</a></p>
            </div>
        `;
        $('.wiki-content').html(errorHTML);
    }
}

$(document).ready(function() {
    // Check which page we're on and initialize accordingly
    if (window.location.pathname.includes('supplement-template.html') || 
        document.querySelector('.wiki-content')) {
        // Initialize supplement template loader
        setTimeout(() => {
            window.supplementLoader = new SupplementLoader();
        }, 1000);
    } else if (window.location.pathname.includes('index.html') || 
               window.location.pathname === '/' ||
               document.querySelector('.supplement-carousel')) {
        // Initialize index page supplement functionality
        setTimeout(() => {
            window.indexSupplementManager = new IndexSupplementManager();
        }, 1000);
    }
});

// Index page supplement management class
class IndexSupplementManager {
    constructor() {
        this.supabase = null;
        this.supplements = [];
        this.activeCloudFilter = 'all';
        this.init();
    }

    async init() {
        // Wait for Supabase to be ready
        let attempts = 0;
        while (attempts < 10) {
            if (typeof SupabaseConfig !== 'undefined' && SupabaseConfig.isReady()) {
                this.supabase = SupabaseConfig.client();
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }

        if (!this.supabase) {
            console.error('Database connection failed for index page');
			this.showWordCloudMessage('Supplement list is unavailable right now.');
            return; // Keep existing hardcoded functionality
        }

        await this.loadSupplements();
        this.enhanceExistingFunctionality();
    }

    async loadSupplements() {
        try {
            debugLog('Attempting to load supplements from Supabase...');
            debugLog('Supabase URL:', this.supabase.supabaseUrl);
            debugLog('Supabase Key exists:', !!this.supabase.supabaseKey);
            debugLog('Full Supabase client:', this.supabase);
            
            // Test connection first
            const { data: testData, error: testError } = await this.supabase
                .from('Supplement')
                .select('count', { count: 'exact', head: true });
                
            if (testError) {
                console.error('Connection test failed:', testError);
            } else {
                debugLog('Connection test successful, supplement count:', testData);
            }
            
            // Try simple query first without ordering
            debugLog('Attempting simple query without ordering...');
            const { data: simpleData, error: simpleError } = await this.supabase
                .from('Supplement')
                .select('*')
                .limit(10);
                
            if (simpleError) {
                console.error('Simple query failed:', simpleError);
            } else {
                debugLog('Simple query successful:', simpleData);
                debugLog('Number of rows returned:', simpleData?.length);
                if (simpleData?.length === 0) {
                    debugWarn('⚠️  ZERO ROWS RETURNED - This is likely a Row Level Security (RLS) issue!');
                    debugWarn('Your Supplement table probably has RLS enabled but no policy allowing public read access.');
                    debugWarn('To fix this, you need to either:');
                    debugWarn('1. Disable RLS: ALTER TABLE "Supplement" DISABLE ROW LEVEL SECURITY;');
                    debugWarn('2. Or create a policy: CREATE POLICY "Allow public read" ON "Supplement" FOR SELECT USING (true);');
                }
                if (simpleData?.length > 0) {
                    debugLog('First supplement:', simpleData[0]);
                    debugLog('Available columns:', Object.keys(simpleData[0]));
                }
            }
            
            // Now try with ordering (might fail if 'name' column doesn't exist)
            const { data: supplements, error } = await this.supabase
                .from('Supplement')
                .select('*')
                .order('name');

            if (error) {
                console.error('Supabase error details:', error);
                if (error.code === 'PGRST116' || error.message?.includes('permission denied')) {
                    console.error('Permission denied - the supplements table might have Row Level Security enabled without public read access');
					this.showWordCloudMessage('Supplement list is unavailable right now.');
                    return;
                }
                if (error.code === '401' || error.message?.includes('401')) {
                    console.error('Authentication failed - please check your Supabase API key');
					this.showWordCloudMessage('Supplement list is unavailable right now.');
                    return;
                }
                throw error;
            }

            this.supplements = supplements || [];
            
            if (this.supplements.length === 0) {
                debugWarn('⚠️  No supplements loaded - likely Row Level Security blocking access');
				this.showWordCloudMessage('No supplements are available yet.');
                return;
            }

			this.renderWordCloud();

            // Keep initial spotlight and commerce CTAs in sync with database content.
            if (this.supplements[0]) {
                this.updateSpotlightWithSupplement(this.supplements[0], false);
            }
            
            debugLog(`Successfully loaded ${this.supplements.length} supplements from database`);
        } catch (error) {
            console.error('Error loading supplements:', error);
            console.error('Error type:', typeof error);
            console.error('Error stack:', error.stack);
			this.showWordCloudMessage('Supplement list is unavailable right now.');
        }
    }

    getCategoryFromSupplementName(name) {
        const nameLower = name.toLowerCase();
        
        // Protein category
        if (nameLower.includes('protein') || nameLower.includes('whey') || nameLower.includes('casein') || 
            nameLower.includes('isolate') || nameLower.includes('concentrate')) {
            return 'protein';
        }
        
        // Creatine category
        if (nameLower.includes('creatine')) {
            return 'creatine';
        }
        
        // Omega-3 category
        if (nameLower.includes('omega') || nameLower.includes('fish oil') || nameLower.includes('dha') || 
            nameLower.includes('epa') || nameLower.includes('krill')) {
            return 'omega3';
        }
        
        // Vitamin D category
        if (nameLower.includes('vitamin d') || nameLower.includes('cholecalciferol') || nameLower.includes('d3')) {
            return 'vitamind';
        }
        
        // Pre-workout category
        if (nameLower.includes('caffeine') || nameLower.includes('citrulline') || nameLower.includes('beta-alanine') ||
            nameLower.includes('pre-workout') || nameLower.includes('pre workout')) {
            return 'preworkout';
        }
        
        // BCAA category
        if (nameLower.includes('bcaa') || nameLower.includes('amino') || nameLower.includes('leucine') ||
            nameLower.includes('isoleucine') || nameLower.includes('valine')) {
            return 'bcaas';
        }
        
        // Nootropics category
        if (nameLower.includes('alpha-gpc') || nameLower.includes('lion') || nameLower.includes('bacopa') ||
            nameLower.includes('rhodiola') || nameLower.includes('phosphatidyl') || nameLower.includes('nootropic')) {
            return 'nootropics';
        }
        
        // Vitamins category (catch-all for vitamins)
        if (nameLower.includes('vitamin') || nameLower.includes('multi') || nameLower.includes('magnesium') ||
            nameLower.includes('zinc') || nameLower.includes('iron') || nameLower.includes('calcium')) {
            return 'vitamins';
        }
        
        // Default to vitamins category
        return 'vitamins';
    }

    getIconForSupplement(name, category) {
        const nameLower = name.toLowerCase();
        
        // Specific icons based on supplement name
        if (nameLower.includes('creatine')) return '💊';
        if (nameLower.includes('whey') || nameLower.includes('protein')) return '🥛';
        if (nameLower.includes('fish oil') || nameLower.includes('omega')) return '🐟';
        if (nameLower.includes('vitamin d')) return '☀️';
        if (nameLower.includes('caffeine')) return '☕';
        if (nameLower.includes('bcaa') || nameLower.includes('amino')) return '⚡';
        if (nameLower.includes('multi')) return '🌈';
        if (nameLower.includes('magnesium')) return '⚪';
        if (nameLower.includes('vitamin c')) return '🍊';
        if (nameLower.includes('alpha-gpc') || nameLower.includes('nootropic')) return '🧠';
        if (nameLower.includes('lion')) return '🍄';
        if (nameLower.includes('citrulline')) return '💪';
        
        // Category-based fallback icons
        const categoryIcons = {
            'creatine': '💊',
            'protein': '🥛', 
            'omega3': '🐟',
            'vitamind': '☀️',
            'preworkout': '💪',
            'bcaas': '⚡',
            'nootropics': '🧠',
            'vitamins': '🌿'
        };
        
        return categoryIcons[category] || '💊';
    }

    showWordCloudMessage(message) {
        const container = document.getElementById('word-cloud');
        if (!container) return;

        const status = document.createElement('p');
        status.className = 'word-cloud-status';
        status.textContent = message;
        container.replaceChildren(status);
    }

    renderWordCloud(animate = false) {
        const container = document.getElementById('word-cloud');
        const pins = document.getElementById('word-cloud-pins');
        const pinList = pins ? pins.querySelector('.word-cloud-pin-list') : null;
        if (!container) return;

        const uniqueSupplements = new Map();
        this.supplements.forEach(supplement => {
            const name = (supplement.name || '').trim();
            if (name && !uniqueSupplements.has(name)) {
                uniqueSupplements.set(name, supplement);
            }
        });

        if (uniqueSupplements.size === 0) {
            this.showWordCloudMessage('No supplements are available yet.');
            return;
        }

        const rankedSupplements = Array.from(uniqueSupplements.entries())
            .map(([name, supplement]) => ({
                name,
                supplement,
                score: this.getWordCloudScore(supplement)
            }))
            .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name));

        const isFiltered = this.activeCloudFilter !== 'all';
        const pinnedMatches = isFiltered ? rankedSupplements.filter(item => item.score >= 0.7).slice(0, 3) : [];
        const pinnedNames = new Set(pinnedMatches.map(item => item.name));
        const cloudSupplements = isFiltered
            ? rankedSupplements.filter(item => !pinnedNames.has(item.name))
            : rankedSupplements;

        container.classList.toggle('is-clustered', isFiltered);
        if (pins && pinList) {
            pins.hidden = pinnedMatches.length === 0;
            pinList.replaceChildren();
            pinnedMatches.forEach(({ name, supplement }) => {
                const pin = this.createWordCloudLink(name, supplement, 'word-cloud-pin');
                pinList.appendChild(pin);
            });
        }

        const words = document.createDocumentFragment();
        cloudSupplements.forEach(({ name, supplement, score }, index) => {
            const isMatch = this.activeCloudFilter === 'all' || score >= 0.7;
            const word = this.createWordCloudLink(name, supplement, `word-cloud-item ${this.getWordCloudWeightClass(score)} ${isMatch ? 'match-strong' : score >= 0.35 ? 'match-medium' : 'match-light'} ${this.getWordCloudOrientationClass(score, index)}`);
            if (animate) {
                word.classList.add('cloud-enter');
                word.style.setProperty('--reveal-delay', `${Math.min(index, 16) * 24}ms`);
                word.addEventListener('animationend', () => {
                    word.classList.remove('cloud-enter');
                    word.style.removeProperty('--reveal-delay');
                }, { once: true });
            }
            words.appendChild(word);
        });

        container.replaceChildren(words);
        this.initializeWordCloudInteractions(document.querySelector('.supplement-word-cloud'));
        if (animate) {
            window.setTimeout(() => container.classList.remove('is-transitioning'), 800);
        } else {
            container.classList.remove('is-transitioning');
        }
    }

    createWordCloudLink(name, supplement, className) {
        const word = document.createElement('a');
        word.className = className;
        word.href = this.getSupplementDetailUrl(name);
        word.textContent = this.getWordCloudLabel(name);
        word.title = name;
        word.dataset.cloudName = name;
        word.dataset.cloudPreview = this.getWordCloudPreview(supplement);
        return word;
    }

    getWordCloudPreview(supplement) {
        const source = supplement.overview || supplement.primary_uses || supplement.description || 'Explore the research and practical guidance for this supplement.';
        const plainText = String(source).replace(/\s+/g, ' ').trim();
        return plainText.length > 150 ? `${plainText.slice(0, 147).trimEnd()}...` : plainText;
    }

    initializeWordCloudInteractions(container) {
        const preview = document.getElementById('word-cloud-preview');
        const previewTitle = preview ? preview.querySelector('.word-cloud-preview-title') : null;
        const previewCopy = preview ? preview.querySelector('.word-cloud-preview-copy') : null;
        const magneticZone = container ? container.querySelector('.word-cloud') : null;
        const magneticRadius = 220;
        const magneticStrength = 9;
        const magneticEase = 0.16;
        let magneticFrame = null;
        const showPreview = word => {
            if (!preview || !previewTitle || !previewCopy) return;
            previewTitle.textContent = word.dataset.cloudName || word.textContent;
            previewCopy.textContent = word.dataset.cloudPreview || '';
            preview.hidden = false;
        };
        const hidePreview = () => {
            if (preview) preview.hidden = true;
        };

        const magneticState = new Map();
        const getMagneticState = word => {
            if (!magneticState.has(word)) {
                magneticState.set(word, {
                    currentX: 0,
                    currentY: 0,
                    targetX: 0,
                    targetY: 0
                });
            }
            return magneticState.get(word);
        };

        const animateMagnet = () => {
            let needsAnotherFrame = false;
            magneticState.forEach((state, word) => {
                if (!word.isConnected) return;

                state.currentX += (state.targetX - state.currentX) * magneticEase;
                state.currentY += (state.targetY - state.currentY) * magneticEase;
                word.style.setProperty('--magnetic-x', `${state.currentX.toFixed(2)}px`);
                word.style.setProperty('--magnetic-y', `${state.currentY.toFixed(2)}px`);

                if (Math.abs(state.targetX - state.currentX) > 0.05 || Math.abs(state.targetY - state.currentY) > 0.05) {
                    needsAnotherFrame = true;
                }
            });

            magneticFrame = needsAnotherFrame ? window.requestAnimationFrame(animateMagnet) : null;
        };

        const scheduleMagnet = () => {
            if (magneticFrame === null) {
                magneticFrame = window.requestAnimationFrame(animateMagnet);
            }
        };

        const clearMagnet = words => {
            words.forEach(word => {
                const state = getMagneticState(word);
                state.targetX = 0;
                state.targetY = 0;
            });
            scheduleMagnet();
        };

        const applyMagneticField = (event, words) => {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            words.forEach(word => {
                const bounds = word.getBoundingClientRect();
                const centerX = bounds.left + bounds.width / 2;
                const centerY = bounds.top + bounds.height / 2;
                const deltaX = event.clientX - centerX;
                const deltaY = event.clientY - centerY;
                const distance = Math.hypot(deltaX, deltaY);
                const state = getMagneticState(word);

                if (distance > magneticRadius || distance === 0) {
                    state.targetX = 0;
                    state.targetY = 0;
                    return;
                }

                const influence = 1 - distance / magneticRadius;
                const pull = influence * magneticStrength;
                state.targetX = (deltaX / distance) * pull;
                state.targetY = (deltaY / distance) * pull;
            });
            scheduleMagnet();
        };

        const allWords = Array.from(container.querySelectorAll('.word-cloud-item, .word-cloud-pin'));
        if (magneticZone) {
            magneticZone.addEventListener('pointermove', event => applyMagneticField(event, allWords));
            magneticZone.addEventListener('pointerleave', () => clearMagnet(allWords));
        }

        container.querySelectorAll('.word-cloud-item, .word-cloud-pin').forEach(word => {
            word.addEventListener('pointerenter', event => {
                showPreview(word);
            });
            word.addEventListener('pointerleave', () => {
                hidePreview();
            });
            word.addEventListener('focus', () => showPreview(word));
            word.addEventListener('blur', hidePreview);
        });
    }

    initializeWordCloudFilters() {
        const filters = document.querySelectorAll('.word-cloud-filter');
        filters.forEach(filter => {
            filter.addEventListener('click', () => {
                this.activeCloudFilter = filter.dataset.cloudFilter || 'all';
                filters.forEach(button => {
                    const isActive = button === filter;
                    button.classList.toggle('is-active', isActive);
                    button.classList.toggle('primary', isActive);
                    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });
                const container = document.getElementById('word-cloud');
                if (container) container.classList.add('is-transitioning');
                window.setTimeout(() => this.renderWordCloud(true), 140);
            });
        });
    }

    getWordCloudScore(supplement) {
        if (this.activeCloudFilter === 'all') return 0.5;

        const name = (supplement.name || '').toLowerCase();
        const category = this.getCategoryFromSupplementName(supplement.name || '');
        const evidence = String(supplement.evidence_level || supplement.evidence || '').toLowerCase();
        let score = 0.12;

        if (this.activeCloudFilter === 'muscle-performance' && ['creatine', 'protein', 'preworkout', 'bcaas'].includes(category)) {
            score = 0.9;
        } else if (this.activeCloudFilter === 'general-health' && ['vitamins', 'vitamind', 'omega3'].includes(category)) {
            score = 0.9;
        } else if (this.activeCloudFilter === 'cognitive-focus' && (category === 'nootropics' || /theanine|tyrosine|alpha-gpc|bacopa|lion|citicoline|caffeine/.test(name))) {
            score = 0.9;
        } else if (this.activeCloudFilter === 'high-evidence') {
            if (/very high|strong|high/.test(evidence)) score = 0.9;
            else if (/moderate/.test(evidence)) score = 0.55;
            else if (/low/.test(evidence)) score = 0.25;
        }

        if (getSupplementAffiliateLink(supplement)) score += 0.05;
        return Math.min(score, 1);
    }

    getWordCloudWeightClass(score) {
        if (this.activeCloudFilter === 'all') return 'size-md';
        if (score >= 0.8) return 'size-xl';
        if (score >= 0.55) return 'size-lg';
        if (score >= 0.35) return 'size-md';
        return 'size-sm';
    }

    getWordCloudLabel(name) {
        return name
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s*\/.*$/, '')
            .trim();
    }

    getWordCloudOrientationClass(score, index) {
        return 'orient-flat';
    }

    enhanceExistingFunctionality() {
        this.initializeWordCloudFilters();
        // Enhance search functionality to use database
        const searchInput = document.getElementById('search');
        if (searchInput && this.supplements.length > 0) {
            this.enhanceSearch();
        }
    }

    enhanceSearch() {
        const searchInput = document.getElementById('search');
        const searchDropdown = document.getElementById('search-dropdown');
        const searchForm = searchInput ? searchInput.closest('form') : null;
        
        if (!searchInput) return;

        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
            });
        }

        // Override existing search functionality
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        newSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
            if (e.key === 'Escape' && searchDropdown) {
                searchDropdown.style.display = 'none';
            }
        });
        
        newSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (!searchTerm) {
                if (searchDropdown) searchDropdown.style.display = 'none';
                return;
            }

            const results = this.supplements.filter(supplement => 
                supplement.name.toLowerCase().includes(searchTerm)
            );

            this.showSearchDropdown(results.slice(0, 8), searchTerm);
        });

        document.addEventListener('click', (e) => {
            if (!searchDropdown) return;
            if (!e.target.closest('.search-container')) {
                searchDropdown.style.display = 'none';
            }
        });
    }

    showSearchDropdown(results, searchTerm) {
        const searchDropdown = document.getElementById('search-dropdown');
        if (!searchDropdown) return;

        searchDropdown.innerHTML = '';
        
        results.forEach(supplement => {
            const category = this.getCategoryFromSupplementName(supplement.name);
            const icon = this.getIconForSupplement(supplement.name, category);
            const detailUrl = this.getSupplementDetailUrl(supplement.name);
            
            const dropdownItem = document.createElement('div');
            dropdownItem.className = 'search-dropdown-item';
            dropdownItem.setAttribute('role', 'button');
            dropdownItem.setAttribute('tabindex', '0');
            dropdownItem.setAttribute('data-detail-url', detailUrl);
            dropdownItem.innerHTML = `
                <span class="supplement-icon">${icon}</span>
                <span class="supplement-name">${supplement.name}</span>
            `;
            
            dropdownItem.addEventListener('click', () => {
                document.getElementById('search').value = supplement.name;
                searchDropdown.style.display = 'none';
                this.updateSpotlightWithSupplement(supplement);
            });
            
            searchDropdown.appendChild(dropdownItem);
        });
        
        searchDropdown.style.display = 'block';
    }

    getSupplementDetailUrl(name) {
        return `supplement-template.html?name=${encodeURIComponent(name || '')}`;
    }

    getSpotlightImageForSupplement(supplement) {
        const name = (supplement?.name || '').toLowerCase();
        const category = this.getCategoryFromSupplementName(supplement?.name || '');

        if (name.includes('creatine') || category === 'creatine') return 'images/pic01.jpg';
        if (name.includes('protein') || name.includes('whey') || category === 'protein') return 'images/pic02.jpg';
        if (name.includes('vitamin d') || category === 'vitamind') return 'images/pic03.jpg';
        if (name.includes('caffeine') || name.includes('fish oil') || name.includes('omega') || category === 'omega3') return 'images/pic04.jpg';
        if (name.includes('beta-alanine') || name.includes('beta alanine') || category === 'preworkout') return 'images/pic05.jpg';

        return 'images/SupplementBag.png';
    }

    updateSpotlightWithSupplement(supplement, shouldScroll = true) {
        debugLog('=== updateSpotlightWithSupplement called for:', supplement?.name);
        const spotlight = document.querySelector('.spotlight');
        debugLog('Spotlight element found:', !!spotlight);
        if (!spotlight) {
            debugWarn('Spotlight element not found - early return');
            return;
        }

        const title = spotlight.querySelector('.content h3');
        const description = spotlight.querySelector('.content p');
        const researchLink = spotlight.querySelector('.content a[href*="supplement-template"]');
        const dealsLink = Array.from(spotlight.querySelectorAll('.content a.button.small')).find(link => /(find deals|shop now)/i.test(link.textContent || ''));
        const priceList = spotlight.querySelector('.price-section ul');
        const addToCartLink = spotlight.querySelector('.price-section a.button.small');
        debugLog('dealsLink found:', !!dealsLink, 'addToCartLink found:', !!addToCartLink);
        debugLog('supplement object keys:', Object.keys(supplement || {}));
        const affiliateLink = getSupplementAffiliateLink(supplement);
        debugLog('Affiliate link resolved for', supplement?.name, '=', affiliateLink || '(empty)');

        // Update content with database data
        if (title) {
            title.textContent = supplement.name;
        }

        const spotlightImage = spotlight.querySelector('.image img');
        if (spotlightImage) {
            spotlightImage.src = this.getSpotlightImageForSupplement(supplement);
            spotlightImage.alt = supplement.name || 'Supplement';
        }
        
        if (description) {
            description.textContent = supplement.overview || `${supplement.name} - Detailed scientific information and research available.`;
        }

        // Update research link
        if (researchLink) {
            researchLink.href = `supplement-template.html?name=${encodeURIComponent(supplement.name)}`;
        }

        // Update commerce CTAs to use affiliate links from the database.
        debugLog('Applying external links...');
        applyExternalLink(dealsLink, affiliateLink);
        applyExternalLink(addToCartLink, affiliateLink);
        debugLog('Links applied. dealsLink href:', dealsLink?.getAttribute('href'), 'addToCartLink href:', addToCartLink?.getAttribute('href'));

        // Update prices with database data if available
        if (priceList) {
            const externalAttrs = affiliateLink
                ? 'target="_blank" rel="noopener noreferrer sponsored nofollow"'
                : '';

            priceList.innerHTML = `
                <li><strong><a href="${affiliateLink || '#'}" ${externalAttrs}>Amazon:</a></strong> Check Price <sup>(${supplement.cost_per_serving || 'N/A'}/serving)</sup></li>
            `;
        }

        // Scroll to spotlight
        if (shouldScroll) {
            spotlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

}