'use strict';

module.exports = function() {
  return function(req, res, next) {
    console.log('[REQUEST URL]===> ',    req.url);
    console.log('[headers]==> ', req.headers);
    console.log('[REQUEST PARAMS BODY]===> ', req.body);
    console.log('[REQUEST PARAMS QUERY===> ', req.query);
  }
};
