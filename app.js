'use strict';
process.env.TZ = 'Asia/Seoul';
var asciify = require('asciify');
let express = require('express');
let cookieParser = require('cookie-parser');

let app = express();
let bodyParser = require('body-parser');

const cors = require("cors");
app.use(cors());

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

let checker = require('./middleware/checker');
let router = require('./routes/traffic-checker');
let health = require('./routes/health');

app.use(express.urlencoded({ extended: true}));
app.use(bodyParser.json());
app.use(checker());

app.use('/', router);
app.use('/server', health);
asciify('Traffic Checker', {font:'larry3d'}, function(err, res){ console.log(res) });

module.exports = app;
