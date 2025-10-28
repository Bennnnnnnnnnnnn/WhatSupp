// Dynamic Supplement Loader for WhatSupp
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
        this.categories = new Map();
        this.activeCategory = null;
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
            return; // Keep existing hardcoded functionality
        }

        await this.loadSupplements();
        this.enhanceExistingFunctionality();
    }

    async loadSupplements() {
        try {
            console.log('Attempting to load supplements from Supabase...');
            console.log('Supabase URL:', this.supabase.supabaseUrl);
            console.log('Supabase Key exists:', !!this.supabase.supabaseKey);
            console.log('Full Supabase client:', this.supabase);
            
            // Test connection first
            const { data: testData, error: testError } = await this.supabase
                .from('Supplement')
                .select('count', { count: 'exact', head: true });
                
            if (testError) {
                console.error('Connection test failed:', testError);
            } else {
                console.log('Connection test successful, supplement count:', testData);
            }
            
            // Try simple query first without ordering
            console.log('Attempting simple query without ordering...');
            const { data: simpleData, error: simpleError } = await this.supabase
                .from('Supplement')
                .select('*')
                .limit(10);
                
            if (simpleError) {
                console.error('Simple query failed:', simpleError);
            } else {
                console.log('Simple query successful:', simpleData);
                console.log('Number of rows returned:', simpleData?.length);
                if (simpleData?.length === 0) {
                    console.warn('⚠️  ZERO ROWS RETURNED - This is likely a Row Level Security (RLS) issue!');
                    console.warn('Your Supplement table probably has RLS enabled but no policy allowing public read access.');
                    console.warn('To fix this, you need to either:');
                    console.warn('1. Disable RLS: ALTER TABLE "Supplement" DISABLE ROW LEVEL SECURITY;');
                    console.warn('2. Or create a policy: CREATE POLICY "Allow public read" ON "Supplement" FOR SELECT USING (true);');
                }
                if (simpleData?.length > 0) {
                    console.log('First supplement:', simpleData[0]);
                    console.log('Available columns:', Object.keys(simpleData[0]));
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
                    this.showErrorMessage('Database access denied. Please contact the administrator to configure public read access.');
                    return;
                }
                if (error.code === '401' || error.message?.includes('401')) {
                    console.error('Authentication failed - please check your Supabase API key');
                    this.showErrorMessage('Database authentication failed. Please check configuration.');
                    return;
                }
                throw error;
            }

            this.supplements = supplements || [];
            
            if (this.supplements.length === 0) {
                console.warn('⚠️  No supplements loaded - likely Row Level Security blocking access');
                this.showErrorMessage('No supplements found. Database may need Row Level Security configuration for public access.');
                return;
            }
            
            this.processSupplements();
            
            console.log(`Successfully loaded ${this.supplements.length} supplements from database`);
        } catch (error) {
            console.error('Error loading supplements:', error);
            console.error('Error type:', typeof error);
            console.error('Error stack:', error.stack);
            
            // Show user-friendly error in the carousel
            this.showErrorMessage('Failed to load supplements from database. Please check your internet connection.');
        }
    }

    processSupplements() {
        // Group supplements by category
        this.categories.clear();
        
        this.supplements.forEach(supplement => {
            const category = this.getCategoryFromSupplementName(supplement.name);
            if (!this.categories.has(category)) {
                this.categories.set(category, []);
            }
            this.categories.get(category).push({
                ...supplement,
                icon: this.getIconForSupplement(supplement.name, category)
            });
        });
        
        // Populate the carousel with the processed data
        this.populateCarousel();
    }

    populateCarousel() {
        const track = document.querySelector('.carousel-track');
        if (!track) {
            console.error('Carousel track not found');
            return;
        }

        // Clear the loading placeholder
        track.innerHTML = '';

        // Create supplement category items from our database categories
        const categoryNames = {
            creatine: "Creatine Supplements",
            protein: "Protein Supplements", 
            omega3: "Omega-3 Supplements",
            vitamind: "Vitamin D Supplements",
            nootropics: "Nootropic Supplements",
            preworkout: "Pre-Workout Supplements",
            vitamins: "Vitamin Supplements",
            bcaas: "BCAA Supplements"
        };

        this.categories.forEach((supplements, categoryKey) => {
            if (supplements.length > 0) {
                const categoryDisplayName = categoryNames[categoryKey] || `${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)} Supplements`;
                const firstSupplement = supplements[0];
                
                const categoryItem = document.createElement('div');
                categoryItem.className = 'supplement-item';
                categoryItem.setAttribute('data-category', categoryKey);
                categoryItem.innerHTML = `
                    <div class="supplement-icon">${firstSupplement.icon}</div>
                    <span>${categoryDisplayName}</span>
                `;
                
                track.appendChild(categoryItem);
            }
        });

        // No duplicates needed - each category should appear only once

        // Apply appropriate styling based on number of categories
        if (this.categories.size <= 5) {
            track.classList.add('few-items');
        } else {
            track.classList.remove('few-items');
        }

        console.log(`Populated carousel with ${this.categories.size} categories`);
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

    enhanceExistingFunctionality() {
        // Enhance search functionality to use database
        const searchInput = document.getElementById('search');
        if (searchInput && this.supplements.length > 0) {
            this.enhanceSearch();
        }

        // Enhance category clicks to show database supplements
        this.enhanceCategoryFunctionality();

        // Enhance spotlight updates with database data
        this.enhanceSpotlight();
    }

    enhanceSearch() {
        const searchInput = document.getElementById('search');
        const searchDropdown = document.getElementById('search-dropdown');
        
        if (!searchInput) return;

        // Override existing search functionality
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
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
    }

    showSearchDropdown(results, searchTerm) {
        const searchDropdown = document.getElementById('search-dropdown');
        if (!searchDropdown) return;

        searchDropdown.innerHTML = '';
        
        results.forEach(supplement => {
            const category = this.getCategoryFromSupplementName(supplement.name);
            const icon = this.getIconForSupplement(supplement.name, category);
            
            const dropdownItem = document.createElement('div');
            dropdownItem.className = 'search-dropdown-item';
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

    enhanceCategoryFunctionality() {
        const categoryItems = document.querySelectorAll('.supplement-item[data-category]');
        
        categoryItems.forEach(item => {
            const originalClickHandler = item.onclick;
            
            item.addEventListener('click', (e) => {
                const category = e.currentTarget.getAttribute('data-category');
                const supplements = this.categories.get(category);
                
                if (supplements && supplements.length > 0) {
                    this.showCategorySupplements(supplements);
                }
            });
        });
    }

    showCategorySupplements(supplements) {
        const specificTrack = document.getElementById('specific-track');
        const specificCarousel = document.getElementById('specific-carousel');
        
        if (!specificTrack) return;

        // Clear existing content
        specificTrack.innerHTML = '';
        
        supplements.forEach(supplement => {
            const supplementElement = document.createElement('div');
            supplementElement.className = 'specific-supplement-item';
            supplementElement.innerHTML = `
                <div class="supplement-icon">${supplement.icon}</div>
                <span>${supplement.name}</span>
            `;
            
            supplementElement.addEventListener('click', () => {
                // Remove active state from all items
                document.querySelectorAll('.specific-supplement-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Add active state to clicked item
                supplementElement.classList.add('active');
                
                this.updateSpotlightWithSupplement(supplement);
            });
            
            specificTrack.appendChild(supplementElement);
        });

        // No duplicates needed - each supplement should appear only once

        // Apply appropriate styling based on number of supplements
        if (supplements.length <= 5) {
            specificTrack.classList.add('few-items');
        } else {
            specificTrack.classList.remove('few-items');
        }

        if (specificCarousel) {
            specificCarousel.style.display = 'block';
            specificCarousel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    enhanceSpotlight() {
        // This will be called when supplements are clicked
    }

    updateSpotlightWithSupplement(supplement) {
        const spotlight = document.querySelector('.spotlight');
        if (!spotlight) return;

        const image = spotlight.querySelector('.image img');
        const title = spotlight.querySelector('.content h3');
        const description = spotlight.querySelector('.content p');
        const researchLink = spotlight.querySelector('.content a[href*="supplement-template"]');
        const priceList = spotlight.querySelector('.price-section ul');

        // Update content with database data
        if (title) {
            title.textContent = supplement.name;
        }
        
        if (description) {
            description.textContent = supplement.overview || `${supplement.name} - Detailed scientific information and research available.`;
        }

        // Update research link
        if (researchLink) {
            researchLink.href = `supplement-template.html?name=${encodeURIComponent(supplement.name)}`;
        }

        // Update prices with database data if available
        if (priceList && supplement.cost_per_serving) {
            priceList.innerHTML = `
                <li><strong><a href="#">Amazon:</a></strong> Check Price <sup>(${supplement.cost_per_serving}/serving)</sup></li>
            `;
        }

        // Scroll to spotlight
        spotlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    showErrorMessage(message) {
        const track = document.querySelector('.carousel-track');
        if (track) {
            track.innerHTML = `
                <div class="error-message" style="
                    color: #ff6b6b;
                    text-align: center;
                    padding: 2rem;
                    font-size: 1.1rem;
                    background: rgba(255, 107, 107, 0.1);
                    border-radius: 8px;
                    margin: 1rem;
                ">
                    <i class="fa fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
                    ${message}
                </div>
            `;
        }
    }
}