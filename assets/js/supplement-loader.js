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
        return urlParams.get(name);
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
                .from('supplements')
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
            // Try exact name match first
            let { data, error } = await this.supabase
                .from('supplements')
                .select('*')
                .ilike('name', nameOrSlug.replace(/-/g, ' '))
                .single();

            // If not found, try partial match
            if (!data && !error) {
                ({ data, error } = await this.supabase
                    .from('supplements')
                    .select('*')
                    .ilike('name', `%${nameOrSlug}%`)
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
            this.showError(`Supplement "${nameOrSlug}" not found`);
        }
    }

    async loadDefaultSupplement() {
        try {
            const { data, error } = await this.supabase
                .from('supplements')
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
    setTimeout(() => {
        window.supplementLoader = new SupplementLoader();
    }, 1000);
});