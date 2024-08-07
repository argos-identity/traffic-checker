'use strict';
var os = require('os');
var hostname = os.hostname();
console.log("hostname:"+ hostname);

var config;
config = require('./config.json');

// if (hostname == 'KimHyunui-MacBook-Pro.local') {
// 	config = require('./dev_config.json');
// } else {

// 	//config = require('./live.json');
// };

module.exports = config;
