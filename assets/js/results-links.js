// Resolve results page supplement links from Supabase data.
(function () {
    function normalizeName(value) {
        return (value || '')
            .toString()
            .toLowerCase()
            .replace(/\(.*?\)/g, ' ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function normalizeExternalUrl(rawUrl) {
        if (typeof rawUrl !== 'string') return '';

        var cleaned = rawUrl.trim().replace(/^['\"]|['\"]$/g, '');
        if (!cleaned) return '';
        if (/^javascript:/i.test(cleaned)) return '';
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
            cleaned = 'https://' + cleaned;
        }

        return cleaned;
    }

    function getSupplementAffiliateLink(supplement) {
        if (!supplement || typeof supplement !== 'object') return '';

        var candidateFields = [
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

        var keyLookup = {};
        Object.keys(supplement).forEach(function (key) {
            keyLookup[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = key;
        });

        for (var i = 0; i < candidateFields.length; i += 1) {
            var normalizedField = candidateFields[i].toLowerCase().replace(/[^a-z0-9]/g, '');
            var sourceKey = keyLookup[normalizedField] || candidateFields[i];
            var value = supplement[sourceKey];

            if (typeof value === 'string' && value.trim()) {
                return normalizeExternalUrl(value);
            }
        }

        return '';
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

    function findSupplementByCardName(cardName, supplements) {
        var cardKey = normalizeName(cardName);
        if (!cardKey) return null;

        var exact = supplements.find(function (item) {
            return normalizeName(item.name) === cardKey;
        });
        if (exact) return exact;

        return supplements.find(function (item) {
            var dbName = normalizeName(item.name);
            return dbName && (dbName.indexOf(cardKey) !== -1 || cardKey.indexOf(dbName) !== -1);
        }) || null;
    }

    async function waitForSupabase(attempts) {
        var maxAttempts = typeof attempts === 'number' ? attempts : 10;

        for (var i = 0; i < maxAttempts; i += 1) {
            if (window.SupabaseConfig && typeof window.SupabaseConfig.client === 'function') {
                var client = window.SupabaseConfig.client();
                if (client) return client;
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise(function (resolve) {
                setTimeout(resolve, 300);
            });
        }

        return null;
    }

    async function wireResultsLinks() {
        var client = await waitForSupabase(12);
        if (!client) return;

        var response = await client
            .from('Supplement')
            .select('*');

        if (response.error || !Array.isArray(response.data) || response.data.length === 0) {
            return;
        }

        var supplements = response.data;
        var cards = document.querySelectorAll('.supplement-card-horizontal');

        cards.forEach(function (card) {
            var titleEl = card.querySelector('.supplement-header h3');
            if (!titleEl) return;

            var supplement = findSupplementByCardName(titleEl.textContent, supplements);
            if (!supplement) return;

            var affiliateLink = getSupplementAffiliateLink(supplement);
            var learnMoreLink = card.querySelector('.actions a.button:not(.primary)');
            var addToCartLink = card.querySelector('.actions a.button.primary');

            // Keep research links pointing to the supplement details page.
            if (learnMoreLink) {
                learnMoreLink.setAttribute('href', 'supplement-template.html?name=' + encodeURIComponent(supplement.name || titleEl.textContent.trim()));
            }

            // Route commerce CTA to affiliate URL from the Supplement table.
            applyExternalLink(addToCartLink, affiliateLink);

            var titleAnchor = titleEl.querySelector('a');
            if (!titleAnchor) {
                titleAnchor = document.createElement('a');
                titleAnchor.textContent = titleEl.textContent;
                titleEl.textContent = '';
                titleEl.appendChild(titleAnchor);
            }
            applyExternalLink(titleAnchor, affiliateLink);
        });

        var navShopNow = document.querySelector('.nav-links a.button.primary.small');
        if (navShopNow) {
            var firstCardTitle = document.querySelector('.supplement-card-horizontal .supplement-header h3');
            var firstSupplement = firstCardTitle
                ? findSupplementByCardName(firstCardTitle.textContent, supplements)
                : supplements[0];
            applyExternalLink(navShopNow, getSupplementAffiliateLink(firstSupplement));
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        wireResultsLinks().catch(function () {
            // Keep static links as fallback when DB is unavailable.
        });
    });
}());
