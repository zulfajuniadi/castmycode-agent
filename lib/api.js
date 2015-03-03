var restler = require('restler');
var serverPath = require('./env')();

var busy = false;
var queues = [];

setInterval(function() {
    if(!busy && queues.length > 0) {
        var doThis = queues.shift();
        busy = true;
        var action;
        switch (doThis.method) {
            case 'GET':
                action = restler.get;
                break;
            case 'POST':
                action = restler.post;
                break;
        }
        action(serverPath + 'api/' + doThis.action, {
            data: doThis.data
        })
            .on('error', function(){
                console.error(arguments);
            })
            .on('complete', function(result){
                if(doThis.callback) {
                    doThis.callback(null, result);
                }
                busy = false;
            })
    }
}, 10);

function queue(method, action, data, callback)
{
    queues.push({
        method: method, 
        action: action, 
        data: data, 
        callback: callback
    });
}

module.exports = {
    queue: queue
}