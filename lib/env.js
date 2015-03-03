module.exports = function() {
    if(process.env.LOCAL) {
        return 'http://castmycode-server.dev/';
    }
    return 'https://castmycode.com/';
}