(function ($, Drupal, window, document, undefined) {jQuery(document).ready(function() {

	// some globals to keep track of stuff
	var tm_global_search_url_base = "/search";
	var tm_global_search_from_filter = false;
	var tm_global_search_page_number = 1;
	var tm_global_search_enable_events = true;
	var tm_global_search_query_stack = Array();
	var tm_global_search_from_back_button = false;
	var tm_global_search_load_more_clicked = false;
	var tm_global_search_query_timer;
	var tm_global_search_query_timeout;
	var tm_global_search_query_timeout_seconds = 10000; // 10 seconds
	var tm_global_search_query_delay_seconds = 500; // delay filter search
	var tm_page_first_load = true;
	var tm_page_last_search_tip = null;
	var tm_page_last_search_query = null;

	// make it happen
	onPageLoad = function() {
		$(".page__title.title").remove(); // hide page title 
		$(".search.welcome").fadeIn(); // show welcome message
		initSearchQuery();
		initSearchFilter();
		doSearch(false);
		tm_page_first_load = false;
	}

	// perform the search
	doSearch = function() {

		// ignore empty search
		if ($("#search-query").val().trim() == "") {
			if (!tm_page_first_load) {
				$(".search.welcome").hide();
				$(".search.tips").hide();
				$(".search.empty_query").fadeIn();
			}
			return;
		}

		// UI setup
		//$(".search.tips").hide();
		hideError(); // hide if there was an error message
		$(".search.noresults").hide(); // hide no search results
		$(".search.timeout").hide();
		$(".pager.pager-load-more").hide();
		$(".search.welcome").hide();
		$(".search.empty_query").hide();
		if (!tm_global_search_from_filter) {
			$(".search.tips").hide();
			$(".search.spinner").show();
			$("#search-results-text").hide();
			$(".search.filters").hide();
			$(".search.results").hide();
			$("#search-results").html("");
		}
		
		// reset page count
		tm_global_search_page_number = 1;

		// set the browser URL from the UI state
		if (!tm_global_search_from_back_button) {
			window.history.pushState(null, null, makeSearchQueryString());
		}

		// fetch the search results
		loadSearchResults();

	};

	// load the search results
	loadSearchResults = function() {

		// Step 1. Cancel previous searches that might be active
		cancelAllSearches();
		$("#search-results-loading-more").hide();

		// Step 2. Check that at least one filter is enabled
		if (!checkNoFilters()) {
			$("#search-results-text").show().text("Please select a search filter");
			$(".search.results").hide();
			return false;
		}

		// Step 3. Configure UI state
		if (tm_global_search_page_number == 1) {
			if (tm_global_search_from_filter) {
				// If user clicked a filter, keep exising results
				$(".pager.pager-load-more").hide();
				$("#search-results-text").hide();
				$("#search-results-loading-more").show();
			} else {
				// Searching for the first time
				$("#search-submit").text("Searching...");
			}
		} else {
			// Loading an extra page of search result
			$(".pager.pager-load-more").show();
			$(".search.load-more-spinner").show();
			$("#search-load-more").text("Loading...");
		}

		// Step 4. Perform ajax query to search api
		clearTimeout(tm_global_search_query_timeout);
		tm_global_search_query_timeout = setTimeout(searchTimeout, tm_global_search_query_timeout_seconds);
		
		xhr = $.ajax({
			url: tm_global_search_url_base + "/results",
			data: { 

				// search query
				"query": $("#search-query").val().trim(),
				"page": tm_global_search_page_number,

				// filter options
				"filter_people": $("#search-filter-people").is(":checked"),
				"filter_events": $("#search-filter-events").is(":checked"),
				"filter_past_events": $("#search-filter-past-events").is(":checked"),
				"filter_chapters": $("#search-filter-chapters").is(":checked"),
				"filter_companies": $("#search-filter-companies").is(":checked"),
			},
			type: "GET",
			success: function(response) {

				clearTimeout(tm_global_search_query_timeout);

				// Remove existing meta data
				$("#search-results-meta").remove(); // remove meta-data

				// Step 5. Handle insertion of results
				if (tm_global_search_from_filter) {
					// Clear results prior to update if updating from filter
					$("#search-results").html("");
					tm_global_search_from_filter = false;
				}		

				// Keep track of current page
				tm_global_search_page_number = tm_global_search_page_number + 1;

				// UI updates
				showSearchTip();
				tm_global_search_load_more_clicked = false;
				$(".search.spinner").hide();
				$(".search.load-more-spinner").hide();
				$("#search-results").append(response);
				$(".search.results").show();
				$(".search.placeholder").addClass("has-results");
				$(".search.filters").show();
				$(".search-help").show();
				$("#search-results-loading-more").hide();
				$("#search-load-more").text("Show more");
				$("#search-submit").text("Search");
				showNumSearchResults();
				if ($("#search-results-last-page").val() == "true") {
					$(".pager.pager-load-more").hide();
				} else {
					$(".pager.pager-load-more").show();
				}

				// Check for errors
				// We search for meta data field, since we're inserting html
				if (!($("#search-results-total").length)) {
					showError();
				} else { 
					hideTimeout();
				}

				// blur results if user not logged in
				checkAnonymousUser(); 
				
			},
			error: function(xhr) {
				// This is also reached when we cancel the xhr request
			}
		});

		// Step 6 (note: this is async). Push xhr request to stack
		tm_global_search_query_stack.push(xhr);

	}

	// show number of search results
	showNumSearchResults = function() {
		var num_results = $("#search-results-total").val();
		var num_results_text = "Found " + num_results + " result";
		if (num_results != 1) {
			num_results_text = "Found " + num_results + " results";
		}

		var seconds_text = "seconds";
		if ($("#search-results-time").val() == "1") {
			seconds_text = "second";
		}
		num_results_text = num_results_text + " <span class='search-results-time'>(" + $("#search-results-time").val() + " " + seconds_text + ")</span>";
		$("#search-results-text").show().html(num_results_text).show();

		// check for no results
		checkNoResults();

	}

	// check no results
	checkNoResults = function() {
		if ($("#search-results-total").val() == 0) {
			//$(".search.tips").hide();
			$(".search.results").hide();
			$(".search.noresults").show();
			$(".search-help").hide();
		}
	}

	// check that filters are enabled
	checkNoFilters = function() {
		if (!($("#search-filter-people").is(":checked"))
		&& !($("#search-filter-events").is(":checked"))
		&& !($("#search-filter-past-events").is(":checked"))
		&& !($("#search-filter-chapters").is(":checked"))
		&& !($("#search-filter-companies").is(":checked"))) {
			return false;
		} else {
			return true;
		}
	}

	// generate a public search query string for browser
	makeSearchQueryString = function() {

		// note: replace spaces with + in query for cleaner url
		var query_string = tm_global_search_url_base + "?query=" + $("#search-query").val().replace(/ /g,'+');

		if ($("#search-filter-people").is(":checked")) {
			query_string = query_string + "|people";
		}
		if ($("#search-filter-events").is(":checked")) {
			query_string = query_string + "|events";
		}
		if ($("#search-filter-past-events").is(":checked")) {
			query_string = query_string + "|past-events";
		}
		if ($("#search-filter-chapters").is(":checked")) {
			query_string = query_string + "|chapters";
		}
		if ($("#search-filter-companies").is(":checked")) {
			query_string = query_string + "|companies";
		}
		return query_string;
	}

	// initialise the search filter from the browser query
	// ie: |people|events|companies
	initSearchFilter = function() {

		var query = window.location.search;

		if (query == "") { 
			enableAllFilters();
		}

		if (query.indexOf("|people") > -1) {
			$("#search-filter-people").prop("checked", true);
		}

		if (query.indexOf("|events") > -1) {
			$("#search-filter-events").prop("checked", true);
		}

		if (query.indexOf("|past-events") > -1) {
			$("#search-filter-past-events").prop("checked", false);
		}

		if (query.indexOf("|chapters") > -1) {
			$("#search-filter-chapters").prop("checked", true);
		}

		if (query.indexOf("|companies") > -1) {
			$("#search-filter-companies").prop("checked", true);
		}

		if (!checkNoFilters()) {
			tm_global_search_enable_events = false;
			enableAllFilters();
			tm_global_search_enable_events = true;
		}

	}

	// abort all existing xhr queries user might have caused
	cancelAllSearches = function() {
		for(i = 0; i < tm_global_search_query_stack.length; i++) {
			tm_global_search_query_stack[i].abort();
		}
		tm_global_search_query_stack = Array();
		clearTimeout(tm_global_search_query_timeout);
	}

	// enable all the filters
	enableAllFilters = function() {
		setAllFilters(true);
	}

	// enable all the filters
	disableAllFilters = function() {
		setAllFilters(false);
	}

	// enable all the filters
	setAllFilters = function(checked) {
		tm_global_search_enable_events = false;
		$("#search-filter-people").prop("checked", checked);
		$("#search-filter-events").prop("checked", checked);
		//$("#search-filter-past-events").prop("checked", checked);
		$("#search-filter-chapters").prop("checked", checked);
		$("#search-filter-companies").prop("checked", checked);
		tm_global_search_enable_events = true;
	}

	// initialise the search query from the browser
	// ie: ?query=sydney|people|events
	initSearchQuery = function() {
		var query = window.location.search.trim();
		if (query != "") {

			var query_string = "";
			var query_parts = decodeURIComponent(query).match("/\?query=(.*)");
			if (query_parts != null) {
				query_string = query_parts[1].split('|')[0];
			}

			//var query_string = decodeURIComponent(query).match("/\?query=(.*)")[1].split('|')[0];
			var query_string_clean = query_string.replace(/<(?:.|\n)*?>/gm, '');
			var query_string_clean = query_string.replace(/\+/g,' ');
			$("#search-query").val(query_string_clean);
		}
	}

	// delay the search (useful for UI actions that might fire multiple events)
	doSearchDelayed = function() {
	  clearTimeout(tm_global_search_query_timer);
	  tm_global_search_query_timer = setTimeout(doSearch, tm_global_search_query_delay_seconds);
	};

	// show a random search tip
	showSearchTip = function() {
		$(".search.welcome").hide();

		// get random search tip
		// Try not to choose previous search tip
		var random = Math.floor(Math.random() * $('.search.tip').length);
		for (var i = 0; i < 10; i++) {
			if (random == tm_page_last_search_tip) {
				random = Math.floor(Math.random() * $('.search.tip').length);
			}
		}

		tm_page_last_search_tip = random;

		$('.search.tip').hide().eq(random).fadeIn();
		$(".search.tips").show();
	}

	// show login box
	checkAnonymousUser = function() {
		// show login box if logged out
		if (Drupal.settings.currentUser == 0) {
      		
    		// improvements for IE support
		    // clone the form and update ids
		    // add event listener to login button to submit the form via js
		    html = $("#account-menu-blk").clone(false).find("*[id]").andSelf().each(function() { $(this).attr("id", $(this).attr("id") + "-cloned"); }).html();
		    message = '<div id="account-menu-blk">' + html + '</div>';
		    
    		$.prompt(message, {
    			buttons: {}, 
    			 loaded: function() { 
    			 	$("#main").addClass("tm-blur-filter");
    			 	$("#edit-submit-cloned").click(function(e) {
    			 		e.preventDefault();
		          		$("#user-login-form-cloned")[0].submit();
		        	});
		        },
          		close: function() { 
          			$("#main").removeClass("tm-blur-filter");
          			$(".pager.pager-load-more").hide();
          			$(".search.tips").hide();
          			$(".search.info").hide();
          			$(".search.results").hide();
          			$(".search.filters").hide();
          			$(".search.login_message").show();
          		}
          	});
    	}
	}

	// timeout handler
	searchTimeout = function() {
		//$(".search.spinner").hide();
		$(".search.tips").hide();
		$(".search.timeout").show();
		//$("#search-submit").text("Search");
		showTimeout();
	}

	// get search keywords from search meta data
	getSearchKeywordsFromResults = function() {
		return JSON.parse($("#search-results-query-no-options").val());
	}

	// show an error message
	showError = function() {
		// Show timeout message
		hideEverything();
		enableAllFilters();
		$(".search.error-message").show();
		return;
	}

	// hide the error message
	hideError = function() {
		$(".search.error-message").hide();
	}

	// show an timeout message
	showTimeout = function() {
		// Show timeout message
		$(".search.timeout").show();
		return;
	}

	// hide the error message
	hideTimeout = function() {
		$(".search.timeout").hide();
	}

	// shortcut to hide UI elements
	hideEverything = function() {
		$(".search.timeout").hide();
		$("#search-submit").text("Search");
		$(".search.spinner").hide();
		$(".search.load-more-spinner").hide();
		$(".search.tips").hide();
		$("#search-results").html("");
		$(".search.filters").hide();
		$(".pager.pager-load-more").hide();
		$("#search-results-text").hide();
	}

	// handle going back
	window.onpopstate = function(event) {
    	initSearchQuery();
    	disableAllFilters();
    	initSearchFilter();
    	tm_global_search_page_number = 1;
    	tm_global_search_from_filter = false;
    	tm_global_search_from_back_button = true;
    	doSearch();
    	tm_global_search_from_back_button = false;
	};

	// event handler for enter key in search query box
	$('#search-query').keydown(function (e){
    	if(e.keyCode == 13){
    		tm_global_search_from_filter = false;
    		tm_global_search_page_number = 1;
        	doSearch();
    	}
	})

	// event handler for click search button
	$("#search-submit").click(function() {

		// check we aren't in the middle of a search
		// todo: set a state so we can check if we are searching
		if ($("#search-submit").text() == "Searching...") {
			if (tm_page_last_search_query == $("#search-query").val()) {
				return;
			}
		}

		tm_global_search_from_filter = false;
		tm_global_search_page_number = 1;
		doSearch();

		// record last search
		tm_page_last_search_query = $("#search-query").val();

	});

	// event handler for load more button
	$("#search-load-more").click(function() {
		
		if (!tm_global_search_load_more_clicked) {
			loadSearchResults();
		}

		tm_global_search_load_more_clicked = true;
		
	});

	// do search if filters are changed
	$("input[type='checkbox']").change(function() {
		if (tm_global_search_enable_events) {
			tm_global_search_from_filter = true;
			doSearchDelayed();
		}
	});

	// search external blog
	$(".search-external-blog").click(function(e) {
		e.preventDefault();
		// /blog/?s=example
		var blog_path = "blog";
		if (typeof Drupal.settings.tm_search.blog_path !== 'undefined') {
			blog_path = Drupal.settings.tm_search.blog_path;
		}
		window.location = "/" + blog_path + "/?s=" + encodeURI(getSearchKeywordsFromResults());
	});

	// search external jobs
	$(".search-external-jobs").click(function(e) {
		e.preventDefault();
		// /jobs/search/example
		var marketplace_path = "marketplace";
		if (typeof Drupal.settings.tm_search.marketplace_path !== 'undefined') {
			marketplace_path = Drupal.settings.tm_search.marketplace_path;
		}
		window.location = "/" + marketplace_path + "/search/" + encodeURI(getSearchKeywordsFromResults());
	});

	// search external forum
	$(".search-external-qa").click(function(e) {
		e.preventDefault();
		// /forum/search?q=example
		var forum_path = "/forum";
		if (typeof Drupal.settings.tm_search.forum_path !== 'undefined') {
			forum_path = Drupal.settings.tm_search.forum_path;
		}
		window.location = forum_path + "/search?q=" + encodeURI(getSearchKeywordsFromResults());
	});

	// search external google
	// todo: refer to a js setting
	$(".search-external-google").click(function(e) {
		e.preventDefault();
		// /https://www.google.com/#q=travelmassive%20
		var site_name = "";
		if (typeof Drupal.settings.tm_search.site_name !== 'undefined') {
			site_name = Drupal.settings.tm_search.site_name;
		}
		window.location  = "https://www.google.com/#q=" + encodeURI(site_name) + "%20" + encodeURI(getSearchKeywordsFromResults());
	});			

	// example searches
	$(".search-example").click(function(e) {
		e.preventDefault(); // disable href
		enableAllFilters(); // turn filters back on
		var example_text = $(this).data("search-example");
		$('#search-query').val(example_text);
		doSearch();
		window.scrollTo(0, 0);
	});

	// paged loaded
	onPageLoad();


});})(jQuery, Drupal, this, this.document);
