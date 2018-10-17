var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
//array for username strings
var usernames = [];

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
    //if username already taken else add it array
    socket.on('new user', function(data, callback){
        if(usernames.indexOf(data)!= -1){
            callback(false);
        }else{
            callback(true);
            //add username to socket itself
            socket.username = data;
            usernames.push(socket.username);
            io.emit('usernames', usernames);

        }
    });

    socket.on('chat message', function(msg){
        //Var for Date and Time
        var moment = new Date();
        //Prints message plus Date and Time (moment) message was sent
        io.emit('chat message', msg + '  ' + moment);
    });

    //Prints message to console that a user connected.
    console.log('a user connected');
    //Prints message to Frontend that a user connected.
    io.emit('chat message', 'a user connected');

    socket.on('disconnect', function(){
        //Prints message to console that a user disconnected.
        console.log('user disconnected');
        //Prints message to Frontend that a user disconnected.
        io.emit('chat message', 'a user disconnected');
    });

});

http.listen(port, function(){
    console.log('listening on *:' + port);
});