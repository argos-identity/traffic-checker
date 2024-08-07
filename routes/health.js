'use strict';
const express = require('express');
const router = express.Router();
var healthChecker = require('../controller/health.js');
router.get('/state', healthChecker.serverCheck);
router.get('/health', healthChecker.healthCheck);
router.get('/ready', healthChecker.readyCheck);
router.get('/start', healthChecker.startCheck);
module.exports = router;