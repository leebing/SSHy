SSHyClient.settings = function() {
    // Local echo reduces latency on regular key presses to aruond 0.04s compared to ~0.2s without it
    this.localEcho = 0; // 0 - off; 1 - auto; 2 - on

	/* Default the bindings to bash */
	this.fsHintEnter = "\x1b\x5b\x3f\x31";    // seems to be the same for all shells
	this.fsHintLeave = SSHyClient.bashFsHintLeave;

	this.autoEchoState = false;		// false = no echoing ; true = echoing
	this.autoEchoTimeout = 0;		// stores the time of last autoecho change

    this.blockedKeys = [':'];		// while localecho(force-on) don't echo these keys

	this.keepAliveInterval = undefined;  // stores the setInterval() reference

	this.fontSize = 16;

	this.colorTango = true;	// if we've got Tango enabled or not (no css changes needed)
	this.colorCounter = 0; // Stores the current index of the theme loaded in colorSchemes
	this.colorNames = Object.keys(this.colorSchemes); // Stores an array of colorNames

	this.shellString = '';  // Used to buffer shell identifications ie ']0;fish' or 'user@host$'

	this.sidenavElementState = 0; // Stores the state of the sidenav (0 - closed, [x] - true)
	// Caches the DOM elements
 	this.rxElement = document.getElementById('rxTraffic');
	this.txElement = document.getElementById('txTraffic');
	this.autoEchoElement = document.getElementById('autoEchoState');

	this.rsaCheckEnabled = true;
};

SSHyClient.settings.prototype = {
	// All our supported terminal color themes in [bg, color1, .... , color15, cursor, fg]
	colorSchemes: {
		'Tango': function() {
			return true;
		},
		'Solarized': function() {
		    return ["#002b36", "#002b36", "#dc322f", "#859900", "#b58900", "#268bd2", "#6c71c4", "#2aa198", "#93a1a1", "#657b83", "#dc322f", "#859900", "#b58900", "#268bd2", "#6c71c4", "#2aa198", "#fdf6e3", "#93a1a1", "#93a1a1"];
		},
		'Material': function() {
		    return ["#263238", "#263238", "#ff9800", "#8bc34a", "#ffc107", "#03a9f4", "#e91e63", "#009688", "#cfd8dc", "#37474f", "#ffa74d", "#9ccc65", "#ffa000", "#81d4fa", "#ad1457", "#26a69a", "#eceff1", "#eceff1", "#eceff1"];
		},
		'Monokai': function() {
		    return ["#272822", "#272822", "#dc2566", "#8fc029", "#d4c96e", "#55bcce", "#9358fe", "#56b7a5", "#acada1", "#76715e", "#fa2772", "#a7e22e", "#e7db75", "#66d9ee", "#ae82ff", "#66efd5", "#cfd0c2", "#f1ebeb", "#f1ebeb"];
		},
		'Ashes': function() {
		    return ["#1c2023", "#1c2023", "#c7ae95", "#95c7ae", "#aec795", "#ae95c7", "#c795ae", "#95aec7", "#c7ccd1", "#747c84", "#c7ae95", "#95c7ae", "#aec795", "#ae95c7", "#c795ae", "#95aec7", "#f3f4f5", "#c7ccd1", "#c7ccd1"];
		},
		'Google': function() {
		    return ["#ffffff", "#ffffff", "#cc342b", "#198844", "#fba922", "#3971ed", "#a36ac7", "#3971ed", "#c5c8c6", "#969896", "#cc342b", "#198844", "#fba922", "#3971ed", "#a36ac7", "#3971ed", "#ffffff", "#373b41", "#373b41"];
		},
		'Mono Light': function() {
		    return ["#f7f7f7", "#f7f7f7", "#7c7c7c", "#8e8e8e", "#a0a0a0", "#686868", "#747474", "#868686", "#b9b9b9", "#525252", "#7c7c7c", "#8e8e8e", "#a0a0a0", "#686868", "#747474", "#868686", "#f7f7f7", "#464646", "#464646"];
		},
		'Mono Dark': function() {
		    return ["#000000", "#000000", "#6b6b6b", "#c4c4c4", "#b3b3b3", "#999999", "#717171", "#8a8a8a", "#b5cabb", "#202020", "#464646", "#f8f8f8", "#eeeeee", "#7c7c7c", "#adadad", "#c0c0c0", "#99ac9e", "#ffffff", "#ffffff"];
		}
	},

	// Takes a single character and identifies shell type
	testShell: function(r){
		// Check that we're adding the start of a string
		if(r.substring(0,2).indexOf(']') === -1 && (this.shellString.length === 0 || this.shellString.length > ']0;fish'.length)){
			this.shellString = '';
			return;
		}

		this.shellString += r;

		// Don't bother checking if we don't have enough characters for a match
		if(this.shellString.length < 7){
			return;
		}
		// Check for fish
		if(this.shellString.indexOf(']0;fish') !== -1){
			this.shellString = '';
			this.fsHintLeave = SSHyClient.fishFsHintLeave;
			return;
		}

		// Catch all for bash
		if(this.shellString.indexOf('@') !== -1){
			this.shellString = '';
			this.fsHintLeave = SSHyClient.bashFsHintLeave;
			return;
		}
	},
	// Toggles Local Echo on and off
	setLocalEcho: function(dir){
		// Clamp the setting between 0 and 2
		this.localEcho = Math.min(Math.max(this.localEcho += dir, 0), 2);

		// Change the displayed mode to the string at 'this.localEcho' of array
		document.getElementById('currentLEcho').innerHTML = ["Force Off", "Auto", "Force On"][this.localEcho];

		// If we're using auto echo mode, change the auto state tooltiptext
		var element = document.getElementById('autoEchoState');
		if(this.localEcho === 1){
			element.style.visibility = 'visible';
			element.innerHTML = "State: " + (this.autoEchoState === false ? 'Disabled' : 'Enabled');
		} else {
			element.style.visibility = 'hidden';
		}
	},

    // Parses a given message (r) for signs to enable or disable local echo
    parseLocalEcho: function(r) {
		// if we're using auto mode
		if(this.localEcho === 1){
			// Caching this since it takes a long time to get at least twice
			var timeout = performance.now();
			// Don't continue if we've changed state in the previous 0.1s
			if(timeout - this.autoEchoTimeout < 100){
				return;
			}
			// We only need to examine the beginning of most messages so just take the first 64 bytes to improve performance
			r = r.substring(0, 64);
			if(!this.autoEchoState){
				// Search for '@' aswell so we catch on 'user@hostname' aswell
				if(r.indexOf(this.fsHintLeave) != -1 && r.indexOf('@') != -1 ){
					this.autoEchoState = true;
					// Change the Settings UI
					this.autoEchoElement.innerHTML = "State: Enabled";
					this.autoEchoTimeout = timeout;
				}
			} else {
				// check for 'password' incase we are inputting a password
				if(r.indexOf(this.fsHintEnter) != -1 || r.toLowerCase().indexOf('password') != -1){
					this.autoEchoState = false;
					this.autoEchoElement.innerHTML = "State: Disabled";
					this.autoEchoTimeout = timeout;
				}
			}
		}
		return;
    },
    // Parses a keydown event to determine if we can safely echo the key.
    parseKey: function(e) {
		// Don't continue to write the key if auto echoing is disabled
		if(this.localEcho === 1 && this.autoEchoState === false){
			return;
		}
		// Make sure the key isn't a special one eg 'ArrowUp', a blocked key or a control character
        if (e.key.length > 1 || this.blockedKeys.includes(e.key) || (e.altKey || e.ctrlKey || e.metaKey)) {
            return;
        }
		// Incase someone is typing very fast don't echo to perserve servers formatting.
		if(!transport.lastKey){
			term.write(e.key);
		}
        transport.lastKey += e.key;
    },
	// Sets the keep alive iterval or clears a current interval based on 'time'
	setKeepAlive: function(time) {
		// changes 'time' into seconds & floors time to stop 0.00001s ect
		time = time === undefined ? 0 : Math.floor(time) * 1000;
		// if there is an interval setup then clear it
		if(time === 0 || this.keepAliveInterval !== undefined){
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = undefined;
			if(!time){
				return;
			}
		}
		// otherwise create a new interval
		this.keepAliveInterval = setInterval(transport.keepAlive, time);
	},
	// Set xtermjs's color scheme to the given color
	setColorScheme: function(colors, colorName) {
		// Gets a reference to xterm.css
	    var term_style = document.styleSheets[0];
	    var i;
	    // Remove active colour scheme if there is a custom one.
	    if (!this.colorTango) {
	        for (i = 0; i < 37; i++) {
	            term_style.deleteRule(13);
	        }
	    }

		// Tango is the default color scheme so nothing more is needed
		if (colors === true) {
			this.colorTango = true;
			this.getColorSchemeName(true);
			return;
		}

		// Adds terminal cursor, background and html background
	    term_style.insertRule('.terminal .terminal-cursor {background-color: ' + colors[17] + '; color: ' + colors[0] + ' !important;}', 13);
	    term_style.insertRule('.terminal:not(.focus) .terminal-cursor {outline: 1px solid ' + colors[17] + ' !important;}', 13);
	    term_style.insertRule('.terminal .xterm-viewport {background-color: ' + colors[0] + ' !important;}', 13);
	    term_style.insertRule('html, body {background-color: ' + colors[0] + ' !important;}', 13);
		term_style.insertRule('textarea {background-color: ' + colors[0] + ' !important;}', 13);
		term_style.insertRule('.terminal {color: ' + colors[18] + ' !important;}', 13);
		// Changes the sidenav color
	    term_style.insertRule('.sidenav {background-color: ' + modColorPercent(colors[0], -0.2) + ' !important;}', 13);
		// Changes the rx and tx color to 10 and 11
		term_style.insertRule('.sidenav .netTraffic .leftarrow {color: ' + colors[11] + ' !important;}', 13);
		term_style.insertRule('.sidenav .netTraffic .rightarrow {color: ' + colors[12] + ' !important;}', 13);
		// Loop through colors 1 - 15
	    for (i = 1; i < 16; i++) {
	        term_style.insertRule('.terminal .xterm-color-' + (i - 1) + ' {color: ' + colors[i] + ' !important;}', 13);
	        term_style.insertRule('.terminal .xterm-bg-color-' + (i - 1) + ' {background-color: ' + colors[i] + ' !important;}', 13);
	    }

	    this.colorTango = false;

		this.getColorSchemeName(colors, colorName);
	},

	// Sets the color scheme name on the settings menu
	getColorSchemeName: function(colors, colorName){
		if(!colorName){
			colors = colors.toString();
			// loop through colorSchemes and check for colors === colorSchemes[key]
			for(var i = 0, length = this.colorNames.length; i < length; i++){
				if(colors == this.colorSchemes[this.colorNames[i]]().toString()){
					colorName = this.colorNames[i];
					this.colorCounter = i;		// Sets counter equal to the index of the colorSchemes
					break;
				}
			}
		}
		// If no name was found, then set the name to 'custom'
		document.getElementById('currentColor').innerHTML = colorName === undefined ? 'Custom' : colorName;
	},

	importXresources: function() {
		var reader = new FileReader();
		var element = document.getElementById('Xresources').files[0];
		reader.readAsText(element);
		reader.onload = function() {
			var file = reader.result;
		    var lines = file.split("\n");
		    // natural sort the Xresources list to bg, 1 - 15, cur, fg colours
		    lines = lines.sort(new Intl.Collator(undefined, {
		        numeric: true,
		        sensitivity: 'base'
		    }).compare);

		    colorScheme_custom = [];

		    for (var i = 0; i < lines.length; i++) {
				// Regex the line for a color code #xxx or #xxxxxx
				var result = lines[i].match(/#([0-9a-f]{3}){1,2}/ig);
				if(result){
					colorScheme_custom.push(result[0]);
					// If we've added 19 colors then stop and display it?
					if(colorScheme_custom.length >= 19){
						break;
					}
		        }
		    }

			// Make sure the new color scheme has the required amount of colours
			if(colorScheme_custom.length !== 19){
				return alert('Uploaded file could not be parsed correctly.');
			}
		    transport.settings.setColorScheme(colorScheme_custom, element.name === '.Xresources' ? undefined : element.name.split('.')[0]);
		};
	},
	// Cycle the color counter and set the current colors to new index
	cycleColorSchemes: function(dir) {
	    // Cycles through (0 -> colorSchemes.length - 1) where dir = 1 is incrementing and dir = false decrements
		this.colorCounter = dir === 0 ? --this.colorCounter : ++this.colorCounter;
		if(this.colorCounter > this.colorNames.length - 1 || this.colorCounter  < 0){
			this.colorCounter = dir === 1 ? 0 : this.colorNames.length - 1;
		}
		// Set color scheme to (colorList [ colorNames [ counter ]])
		this.setColorScheme(this.colorSchemes[this.colorNames[this.colorCounter]]());
	},
	// Modify the font size of the terminal
	modFontSize: function(sign){
		this.fontSize += sign;
		document.getElementById("terminal").style.fontSize = this.fontSize + 'px';

		// Going to use a minimal version of xtermjs.fit()
		var subjectRow = term.rowContainer.firstElementChild;
		// Store the current text in this row
		var contentBuffer = subjectRow.innerHTML;
		// Transform subjectRow to write a single character 'W'
		subjectRow.style.display = "inline";
		subjectRow.innerHTML = 'W';
		var element = subjectRow.getBoundingClientRect();
		// Revert subjectRow back to original settings
		subjectRow.style.display = '';
		subjectRow.innerHTML = contentBuffer;

		// Recalculate the font width/height based on 'element'
		fontWidth = element.width + 0.15;
		fontHeight = Math.floor(element.height);

		document.getElementById("currentFontSize").innerHTML = transport.settings.fontSize + 'px';

		// Send the new size to the SSH terminal & xtermjs
		resize();
	},

	// Sets the terminal size where id= 0-> cols ; 1-> rows
	modTerm: function(id, newAmount){
		if(!id){
			termCols = newAmount;
		} else {
			termRows = newAmount;
		}

		this.changeTermSize(true);
	},

	// Sends the new size to the SSH server & changes local terminal size
	changeTermSize: function(skip){
		term.resize(termCols, termRows);
		transport.auth.resize_pty(termCols, termRows);
		// For some reason lineHeight isn't correctly calculated by xterm.js
		var element =  document.getElementsByClassName("xterm-rows");
		if(element){
			element[0].style.lineHeight = null;
		}

		// If we're setting this from the settings menu then we don't need to reflect the change
		if(skip === undefined){
			document.getElementById('termCols').value = termCols;
			document.getElementById('termRows').value = termRows;
		}
	},
	// Changes the network traffic setting to reflect transmitted or recieved data
	setNetTraffic: function(value, dir){
		// No point recalculating if the sidenav is closed
		if(!this.sidenavElementState){
			return;
		}
		// Convert the 'value' into the correct units
		switch(true){
			case value < 1024:
				value = value + 'Bytes';
				break;
			case (value >= 1024 && value < 1048576):
				value = (value / 1024).toFixed(3) + 'KB';
				break;
			case (value >= 1048576 && value < 1073741824):
				value = (value / 1048576).toFixed(3) + 'MB';
				break;
			default:
				// Just going to stop at Gb since its unlikely to go above that
				value = (value / 1073741824).toFixed(3) + 'GB';
		}
		// Set the target element we we're going to change.
		element = dir === true ? this.rxElement : this.txElement;
		element.innerHTML = value;
	}
};
