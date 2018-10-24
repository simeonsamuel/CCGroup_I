/**Authors:
 * Name: Yasin Simsek  Matriculation Nr.: 741482
 * Name: Simeon Samuel Matriculation Nr.: 761386
 */

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var usernames = [];
var socketids = [];

/**
 * function to get the correct file(index) (+ correct directory)
 * sends html-page to the given path
 */
app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

/**
 * function to listen to the connection of the socket and react to events from user
 */
io.on('connection', function(socket){

    /** function to add username to the username array (with push)
     *  and to the socket itself
     *  after proofing if the user is not already in the array
     *  Then feedback about user is send back to client side: true or false as data
     *  (connect message)
     */
    socket.on('new user', function(data, callback){
        if(usernames.indexOf(data)!= -1){
            callback(false);
        }else{
            callback(true);
            socket.username = data;
            usernames.push(socket.username);
            socketids.push(socket.id);
            io.emit('dis-connect message', socket.username + ' has connected ');
            console.log(socket.username + ' has connected');
        }
    });

    /**
     * function for sending chat messages to the chat:
     * given msg is proofed: if msg is equal to the list command '/list',
     * the username array is send as a msg to the sender only (private chat, client side)
     * otherwise the msg is send to the chat message (client side)
     * including the sender username and the msg itself
     */
    socket.on('chat message', function(msg){
        if(msg == '/list'){
            socket.emit('list', usernames);
        }
        else{
            io.emit('chat message',socket.username + ": " + msg);
        }
    });

    /**
     * function for private messaging:
     * given msg is proofed: if the msg is not null the msg is sent to the "chat message"-client side
     * first only to the sender
     * then function proofs if the sender and the user that gets the private msg are the same
     * if so nothing happens
     * if not, the msg is sent to the receiver (no double messaging ocurse occurs)
     *
     * if the msg is null (no information at first)
     * the information of the sender (id), the username-array and the information
     * of the receiver (id) is sent to the "private" client side and from there sent back to this function again
     * so in the second iteration the msg is not null and the private message is sent to the specif sender and receiver.
     */
    socket.on('private', function(privatemsg){
        if((privatemsg.fromSocket != null)){
            socket.emit('chat message', '[Private] ' + socket.username + ': ' + privatemsg.msg);
            if(socket.id !== privatemsg.toSocket){
                io.to(`${privatemsg.toSocket}`).emit('chat message', '[Private] ' + privatemsg.fromSocket + ': ' + privatemsg.msg);
            }

        }else {
            socket.emit('private',{mysocketid: socket.id, usernames: usernames, socketids: socketids });
        }
    });

    /**
     * function for disconnect msg
     * first the username of the user that disconnects from the chat server gets deleted from the username array (usernames)
     * and the id from the user gets deleted form the userid array (socketsids)
     * both with splice()-method
     *
     * then the disconnect msg is sent to the chat
     */
    socket.on('disconnect', function(){
        usernames.splice(usernames.indexOf(socket.username), usernames.indexOf(socket.username)+1);
        socketids.splice(socketids.indexOf(socket.id), socketids.indexOf(socket.id)+1);
        console.log(socket.username +' disconnected');
        io.emit('dis-connect message',socket.username + ' disconnected ');
    });


});

/**
 * function to listening to the port setted above
 * with console.log for feedback
 */
http.listen(port, function(){
    console.log('listening on *:' + port);
});