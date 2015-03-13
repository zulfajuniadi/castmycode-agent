var watch = require('watch');
var walk = require('walk');
var fs = require('fs');
var fd = require('readlines');
var isBinaryFile = require("isbinaryfile");
var hostname = require("os").hostname();
var path = require("path");
var async = require("async");
var md5 = require("MD5");
var api = require("./api");
var serverPath = require('./env')();
var cache = {};
var ignores = [];
var dir = '';
var remoteEndpoint = '';
var endpoint = '';
var fileCountLimit = 100;
var qrcode = require('qrcode-terminal');
var fileCount = 0;
var remoteFiles = {};

var register = function(callback) {
    
    console.log('Registering endpoint');
    
    api.queue('POST', 'endpoint/' + endpoint, {
        hostname: hostname
    }, function(err, data) {
        remoteEndpoint = data.id;
        remoteFiles = data.files;
        callback(err);
    });
}

var setIgnores = function(callback) {
    
    console.log('Setting up ignored files via .ccignore');
    
    var ignoredLines = [];
    try {
        ignoredLines = fd.readlinesSync(path.join(dir, '.ccignore'));
    } catch(e){}
    ignores = ignoredLines.filter(function(line) {
        return line;
    });
    callback();
}

var registerFiles = function(callback) {
    
    console.log('Registering files');
    
    var options = {
        followLinks: false,
        filters: ignores
    };

    var walker = walk.walk(dir, options);

    walker.on("directories", function (root, dirStatsArray, next) {
        next();
    });

    walker.on("file", function (root, fileStats, next) {
        if(fileCount >= fileCountLimit) {
            return next();
        }
        var include = true;
        var filePath = path.join(root, fileStats.name);
        if(isBinaryFile(filePath)) {
            include = false;
        }
        if(ignores.indexOf(fileStats.name) > 1) {
            include = false;
        }
        if(include) {
            if(fileCount === fileCountLimit - 1) {
                console.error('Synced files more that the maximum limit: ' + fileCountLimit + '. Ignore some files inside .ccignore');
            }
            fileCount++;
            var content = fs.readFileSync(filePath).toString();
            var absFilePath = filePath.substring(dir.length + 1);
            cache[absFilePath] = {
                path: absFilePath,
                deleted: false,
                hash: md5(content),
                content: content
            };
        }
        next();
    });

    walker.on("errors", function (root, nodeStatsArray, next) {
        next();
    });

    walker.on("end", function () {

        console.log(fileCount + ' files registered');

        for(file in remoteFiles) {
            if(remoteFiles.hasOwnProperty(file)) {
                if(!cache[file]) {
                    api.queue('POST', 'remove-file/' + endpoint, {
                        file: {
                            path: file
                        }
                    });
                    delete remoteFiles[file];
                }
            }
        }

        var updateRemote = {};
        for(file in cache) {
            if(cache.hasOwnProperty(file)) {
                if(typeof remoteFiles[file] === 'undefined' || (remoteFiles[file] && remoteFiles[file] !== cache[file].hash)) {
                    updateRemote[file] = cache[file];
                }
            }
        }

        api.queue('POST', 'set-files/' + endpoint, {
            files: updateRemote
        }, function(result){
            callback();
        });
    });
}

var watchForChanges = function() {

    console.log('Watching files for changes on: ' + dir);

    watch.watchTree(dir, function (f, curr, prev) {
        if (typeof f == "object" && prev === null && curr === null) {
        } else if (prev === null) {
            if(!isBinaryFile(f)) {
                var include = true;
                if(fs.lstatSync(f).isDirectory()) {
                    include = false;
                }
                ignores.forEach(function(ignored){
                    if(f.indexOf(ignored) > -1) {
                        include = false;
                    }
                });
                if(include) {
                    var content = fs.readFileSync(f).toString();
                    var absFilePath = f.substring(dir.length + 1);
                    cache[absFilePath] = {
                        path: absFilePath,
                        deleted: false,
                        hash: md5(content),
                        content: content
                    };
                    api.queue('POST', 'add-file/' + endpoint, {
                        file: cache[absFilePath]
                    });
                    console.log('File ' + absFilePath + ' added');
                }
            }
        } else if (curr.nlink === 0) {
            var absFilePath = f.substring(dir.length + 1);
            if(cache[absFilePath]) {
                cache[absFilePath].deleted = true;
                api.queue('POST', 'remove-file/' + endpoint, {
                    file: cache[absFilePath]
                });
                console.log('File ' + absFilePath + ' deleted');
            }
        } else {
            var absFilePath = f.substring(dir.length + 1);
            if(cache[absFilePath]) {
                var newContent = fs.readFileSync(f).toString();
                var hash = md5(newContent);
                if(hash != cache[absFilePath].hash) {
                    cache[absFilePath].content = newContent;
                    cache[absFilePath].hash = hash;
                    api.queue('POST', 'update-file/' + endpoint, {
                        path: absFilePath,
                        hash: hash,
                        content: newContent
                    });
                    console.log('File ' + absFilePath + ' updated');
                }
            }
        }
    });
}

var init = function(path) {
    dir = path;
    endpoint = md5(hostname + dir);
    async.series({
        register : register, 
        setIgnores : setIgnores, 
        registerFiles : registerFiles
    }, function(){
        watchForChanges();
        console.log('');
        qrcode.generate(serverPath + 'view/' + remoteEndpoint, function(code){
            console.log(code);
            console.log('');
            console.log('Remote server at: ' + serverPath + 'view/' + remoteEndpoint);
        });
    });
}

module.exports = {
    init: init
}