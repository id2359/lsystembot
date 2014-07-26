var fs = require('fs'), util = require('util');
var Canvas = require('canvas');
var CanvasWrapper = require('./canvasWrapper.js');
var Twitter = require('./twitter.js');
var debug = process.argv[2] === 'debug';


var post = function(msg, image, callback) {
	callback = callback || function(){};
	if(debug) return callback();
	var api = new Twitter(JSON.parse(fs.readFileSync('./creds.json')));
	api.post(msg, image,
	function(error, response) {
		if(error) {
			console.log(error);
		} else {
			//console.log(response.body);
			console.log(new Date() + ' posted tweet with image: ' + msg);
			callback();
		}
	});
};

var randInt = function(n) {
	n = (n || 1) | 0;
	return Math.floor(Math.random() * n);
};

var pickRandom = function(elements) {
	return elements[randInt(elements.length)];
};

var generateCurve = function() {

	var maxChars = 140 - 23 - 19;
	var imageSize = 23;
	var objectSize = 19;
	var ruleSize = 5;
	
	var caps = 'ABCDEGHIJKLMNOPQRSTUVWXYZ'.split('');
	var count = randInt(4)+1;
	var nodeSymbols = ['F'];
	var controlSymbols = ['F', 'F', '+', '-'];
	var start = '';
	var rules = {};
	var rule = '';
	var i = 0, j = 0, count = 0, index = 0;

	console.log('available characters:', maxChars);

	// select some symbols to use as nodes
	count = randInt(5)+1;
	for(i = 0; i < count; i++) {
		index = randInt(caps.length);
		nodeSymbols.push(caps.splice(index, 1)[0]);
	}
	maxChars -= (5 * nodeSymbols.length);
	console.log('symbols:', nodeSymbols, 'left:', maxChars);

	// generate random start symbol (small)
	count = randInt(6)+1;
	maxChars -= count;
	for(i = 0; i < count; i++) {
		start += pickRandom(nodeSymbols);
	}
	console.log('start:', start, 'left:', maxChars);

	var avgLength = maxChars / nodeSymbols.length;
	// generate a rule for each symbol
	for(i = 0; i < nodeSymbols.length && maxChars > 0; i++) {
		rule = '';

		// insert random node or control symbols
		count = randInt(Math.min(avgLength, maxChars));
		for(j = 0; j < count; j++) {
			rule += Math.random() > 0.5 ?
				pickRandom(nodeSymbols) :
				pickRandom(controlSymbols);
		}

		// insert push/pop symbols, which need to be matched
		if(rule.length > 1) {
			count = randInt(rule.length / 8);
			for(j = 0; j < count; j++) {
				index = randInt(rule.length-1);
				rule = rule.substring(0, index) + '[' + rule.substring(index+1);
				index += 2;
				index = index + randInt(rule.length-index);
				rule = rule.substring(0, index) + ']' + rule.substring(index+1);
			}
		}

		rules[nodeSymbols[i]] = rule;
		maxChars -= rule.length;
		console.log('rule:', rule, 'left:', maxChars);
	}

	// post process
	// remove empty push/pop

	return {
		'start': start,
		'rules': rules
	};
};

var expandCurve = function(start, rules, iterations) {
	var curve = start;
	var i = 0;
	for(; i<iterations; i++) {
		curve = Array.prototype.map.call(curve, function(char) {
			if(rules[char]) {
				return rules[char];
			} else {
				return char;
			}
		}).join('');
	}
	return curve;
};

var render = function(curveData, callback, errorCallback) {
	var start = curveData.start;
	var rules = curveData.rules;
	var startWidth = 5000, startHeight = 5000;
	var canvas = new Canvas(startWidth, startHeight);
	var ctx = new CanvasWrapper(canvas.getContext('2d'));
	var iterations = randInt(3)+2;
	var angle = Math.PI / (randInt(4)+2);
	var length = 20;

	var curve = expandCurve(start, rules, iterations);
	var bounds = {
		xmin:Infinity,
		xmax:-Infinity,
		ymin:Infinity,
		ymax:-Infinity
	};
	var addBounds = function(pt) {
		bounds.xmin = pt.x < bounds.xmin ? pt.x : bounds.xmin;
		bounds.xmax = pt.x > bounds.xmax ? pt.x : bounds.xmax;
		bounds.ymin = pt.y < bounds.ymin ? pt.y : bounds.ymin;
		bounds.ymax = pt.y > bounds.ymax ? pt.y : bounds.ymax;
	};

	var hue = randInt(360);
	var r = randInt(60) + 40;
	var sat = randInt(60) + 40;
	var lit = randInt(60) + 40;
	var color1 = 'rgb(' + r + ',' + sat + ',' + lit + ')';
	
	ctx.strokeStyle = color1;
	console.log('stroke: ' + ctx.strokeStyle);

	ctx.lineWidth = 4;
	ctx.translate(startWidth / 2 + 0.5, startHeight / 2 + 0.5);
	ctx.beginPath();
	console.log('rendering path: ' + curve.length);
	Array.prototype.map.call(curve, function(cmd) {
		switch(cmd) {
			case 'F': ctx.translate(0, -length); ctx.lineTo(0, 0); break;
			case 'f': ctx.translate(0, -length); ctx.moveTo(0, 0); break;
			case '-': ctx.rotate(-angle); break;
			case '+': ctx.rotate(+angle); break;
			case '[': ctx.save(); break;
			case ']': ctx.restore(); ctx.moveTo(0,0); break;
		}
		addBounds(ctx.getCoords(0,0));
	});
	ctx.stroke();

	bounds.xmin -= 5;
	bounds.xmax += 5;
	bounds.ymin -= 5;
	bounds.ymax += 5;
	console.log('bounds: ' + bounds.xmin + ',' + bounds.xmax + ',' + bounds.ymin + ',' + bounds.ymax);
	var width = bounds.xmax - bounds.xmin;
	var height = bounds.ymax - bounds.ymin;
	if(bounds.xmin  < 0 || bounds.max > startWidth || bounds.ymin < 0 || bounds.ymax  > startHeight) {
		console.log('drew outside of bounds');
		errorCallback();
		return;
	}

	var cropCanvas = new Canvas(width, height);
	var cropContext = cropCanvas.getContext('2d');
	cropContext.translate(-bounds.xmin, -bounds.ymin);
	cropContext.drawImage(canvas, 0, 0);

	console.log('outputting image');
	var stream = cropCanvas.createPNGStream();
	var filename = __dirname + '/out.png';
	var out = fs.createWriteStream(filename);
	stream.on('data', function(chunk) {
		out.write(chunk);
	});
	stream.on('end', function() {
		out.end();
		setTimeout(callback.bind(null, './out.png'), 1000);
	});
	
};

var doAction = function() {
	console.log('doing action');
	var curveData = generateCurve();
	var tweet = util.inspect(curveData).replace(/\s/g, '');
	console.log(tweet);
	console.log('tweet length: ' + (tweet.length + 23));
	render(curveData, function(image) {
		post(tweet, image, function() {
			// do something on success
			console.log('done');
		});
	}, function() {
		console.log('retrying...');
		setTimeout(doAction, 0);
	});
};

doAction();
// repeat action 15 min
setInterval(doAction, 1000*60*15);
