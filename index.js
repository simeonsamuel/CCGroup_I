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
            io.emit('chat message', socket.username + ' has connected ');
            console.log(socket.username + ' has connected');
        }
    });

    socket.on('chat message', function(msg){
        if(msg == '/list'){
            socket.emit('private message', usernames);
        }
        else{
            //Prints username and message plus Date and Time (moment) message was sent
            io.emit('chat message',socket.username + ": " + msg);
        }
    });

    socket.on('disconnect', function(){
        usernames.splice(usernames.indexOf(socket.username), usernames.indexOf(socket.username)+1);
        //Prints message to console that a user disconnected.
        console.log(socket.username +' disconnected');
        //Prints message to Frontend that a user disconnected.
        io.emit('chat message',socket.username + ' disconnected ');
    });

    /* socket.on('userlist', function (socket2) {
        socket.emit('private message', 'blah');
        console.log(socket.id);
    });*/

});

http.listen(port, function(){
    console.log('listening on *:' + port);
});