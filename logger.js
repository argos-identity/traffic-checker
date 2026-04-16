
'use strict';
var logger = exports;
  logger.debugLevel = process.env.LOG_LEVEL || 'info';

  logger.log = function(level, message) {
    var levels = ['error', 'warning', 'info'];

    if (levels.indexOf(level) >= levels.indexOf(logger.debugLevel) ) {
      
      if (typeof message !== 'string') {
        message = JSON.stringify(message);
      };
      var timestamp = new Date().toISOString();
      console.log('[' + timestamp + '] ' + level + ': ' + message);
    }
}

