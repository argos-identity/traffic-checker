
'use strict';
var express = require('express');
var router = express.Router();

var trafficChecker = require('../controller/traffic-checker.js');
router.get('/', trafficChecker.trafficChecker);

module.exports = router;
