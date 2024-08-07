'use strict';
exports.serverCheck = function(req, res, next) {
    console.log("server is run!!")
    return res.status(200).send('server is run!!')
}

exports.healthCheck = function(req, res, next) {
    console.log("health check")
    return res.status(200).send("health check")
}

exports.readyCheck = function(req, res, next) {
    console.log("ready check")
    return res.status(200).send("ready check")
}

exports.startCheck = function(req, res, next) {
    console.log("start check")
    return res.status(200).send("start check")
}