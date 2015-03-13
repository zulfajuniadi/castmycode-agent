var hostname = require("os").hostname();
var path = require("path");
var md5 = require("MD5");
var api = require("./api");
var serverPath = require('./env')();
var dir = '';
var endpoint = '';

var init = function(path) {
    dir = path;
    endpoint = md5(hostname + dir);
    api.queue('GET', 'uncast/' + endpoint);
    console.log('Successfully uncasted');
    process.exit(0);
}

module.exports = {
    init: init
}