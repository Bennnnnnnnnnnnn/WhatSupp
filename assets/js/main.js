/*
	Fractal by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

(function($) {

	var	$window = $(window),
		$body = $('body');

	// Breakpoints.
		breakpoints({
			xlarge:   [ '1281px',  '1680px' ],
			large:    [ '981px',   '1280px' ],
			medium:   [ '737px',   '980px'  ],
			small:    [ '481px',   '736px'  ],
			xsmall:   [ '361px',   '480px'  ],
			xxsmall:  [ null,      '360px'  ]
		});

	// Play initial animations on page load.
		$window.on('load', function() {
			window.setTimeout(function() {
				$body.removeClass('is-preload');
			}, 100);
		});

	// Mobile?
		if (browser.mobile)
			$body.addClass('is-mobile');
		else {

			breakpoints.on('>medium', function() {
				$body.removeClass('is-mobile');
			});

			breakpoints.on('<=medium', function() {
				$body.addClass('is-mobile');
			});

		}

	// Scrolly.
		$('.scrolly')
			.scrolly({
				speed: 1500
			});

	// Supplement Filter Functionality
		$('.filter-buttons .button').on('click', function(e) {
			e.preventDefault();
			
			var filter = $(this).data('filter');
			
			// Update active button
			$('.filter-buttons .button').removeClass('active');
			$(this).addClass('active');
			
			// Show/hide supplements based on filter
			if (filter === 'all') {
				$('.supplement-card-horizontal[data-category], .spotlight[data-category]').fadeIn();
			} else {
				$('.supplement-card-horizontal[data-category], .spotlight[data-category]').each(function() {
					var categories = $(this).data('category').split(' ');
					if (categories.includes(filter)) {
						$(this).fadeIn();
					} else {
						$(this).fadeOut();
					}
				});
			}
		});

	// Mobile Navigation Toggle
		$('.nav-toggle').on('click', function() {
			$(this).toggleClass('active');
			$('.nav-links').toggleClass('active');
		});

		// Close mobile menu when clicking on a link
		$('.nav-links a').on('click', function() {
			$('.nav-toggle').removeClass('active');
			$('.nav-links').removeClass('active');
		});

		// Close mobile menu when clicking outside
		$(document).on('click', function(e) {
			if (!$(e.target).closest('#nav').length) {
				$('.nav-toggle').removeClass('active');
				$('.nav-links').removeClass('active');
			}
		});

})(jQuery);