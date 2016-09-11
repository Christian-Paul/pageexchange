var menu = $('.user-interface');

// toggle menu when clicking on the menu icon
menu.on('click', function() {
	menu.toggleClass('triggered');
});

// when the document is clicked, check if the target is user-interface or a descendent
// if the target is not the UI, close the ui
$(document).on('click', function(event) {
	if (!$(event.target).closest(menu).length) {
		menu.removeClass('triggered');
	}
});