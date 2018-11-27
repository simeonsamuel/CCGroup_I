/**Authors:
 * Name: Yasin Simsek  Matriculation Nr.: 741482
 * Name: Simeon Samuel Matriculation Nr.: 761386
 */

//Facedetection requirements
var fs = require('fs');
var path = require('path');
var async = require('async');
var uuid = require('uuid');
var os = require('os');
var asyncTime = 40000;
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');


var app = require('express')();
var http = require('http').Server(app);
var http2 = require("http");
var io = require('socket.io')(http);
var sha256 = require("sha256");
var port = process.env.PORT || 3000;
var db = require('ibm_db');
var validProfile= false;

app.enable('trust proxy'); //needed to redirect to https later

var usernames = [];
var socketids = [];
var loginpass;
var usergefunden = false;
var connStr = 'DRIVER={DB2};' +
    'HOSTNAME=dashdb-txn-sbox-yp-lon02-01.services.eu-gb.bluemix.net;' +
    'PORT=50000;' +
    'DATABASE=BLUDB;' +
    'UID=wrf22173;' +
    'PWD=l6z+2325rvgfgv2d';

var options = {
    "method": "POST",
    "hostname": "adoring-engelbart.eu-de.mybluemix.net",
    "path": [
        "tone"
    ],
    "headers": {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Postman-Token": "b34b62d9-5af6-43a0-8b9c-a1b6a50b4066"
    }
};

var VR = new VisualRecognitionV3({
    version: '2018-03-19',
    url: 'https://gateway.watsonplatform.net/visual-recognition/api',
    iam_apikey: 'mPpxPNzm6wxCxudhIHz1krUx25vj5jp9SvpioPaq1Irh',
    use_unauthenticated: false
});

//Redirecting to https if not secure
app.use(function (req, res, next) {
    if (req.secure || process.env.BLUEMIX_REGION === undefined) {
        next();
    } else {
        console.log('redirecting to https');
        res.redirect('https://' + req.headers.host + req.url);
    }
});

/**
 * function to get the correct file(index) (+ correct directory)
 * sends html-page to the given path
 */
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

/**
 * function to listen to the connection of the socket and react to events from user
 */
io.on('connection', function (socket) {

    /** function to add username to the username array (with push)
     *  and to the socket itself
     *  after proofing if the user is not already in the array
     *  Then feedback about user is send back to client side: true or false as data
     *  (connect message)
     */
    socket.on('new user', function (data, callback) {
        socket.username = data.registerusername;

        db.open(connStr, function (err, conn) {
            if (err) return console.log(err);

            var sql = "SELECT * FROM USER_TABLE";

            conn.query(sql, function (err, data) {
                console.log("0");
                if (err) console.log(err);
                else {
                    data.forEach(function (tablerow) {
                        console.log(tablerow.BENUTZERNAME + " " + socket.username);
                        if (tablerow.BENUTZERNAME == socket.username) {
                            usergefunden = true;
                            callback(false);
                        }
                    })
                }
                conn.close(function () {
                    console.log('done: checked if username exists in database');
                });
            });

            if (usergefunden === false) {

                if(data.profile.length>0){
                    checkFace(data.profile).then(()=>{

                        if(validProfile){
                            db.open(connStr, function (err, conn) {
                                if (err) return console.log(err);
                                var sq2 = "INSERT INTO USER_TABLE (BENUTZERNAME,PASSWORT) VALUES ('" + socket.username + "','" + sha256(data.registerpasswort) + "')";
                                conn.query(sq2, function (err, data) {

                                    if (err) console.log(err);
                                    else console.log(data);

                                    callback(true);
                                    usernames.push(socket.username);
                                    socketids.push(socket.id);
                                    io.emit('dis-connect message', socket.username + ' has connected ');
                                    console.log(socket.username + ' has connected');

                                    conn.close(function () {
                                        console.log('done: insert row in database');
                                    });
                                });
                            });
                        }else{
                            socket.emit('ProfileError',{});
                        }

                    })
                        .catch((error)=>
                            socket.emit('ProfileError',{})
                        );
                }
            }
            ;
        });
        usergefunden = false;
    });


    socket.on('login user', function (data, callback) {
        var loginusergefunden = false;
        if (usernames.indexOf(data.loginusername) != -1) {
            callback(false);
        } else {
            socket.username = data.loginusername;
            loginpass = data.loginpasswort;

            db.open(connStr, function (err, conn) {
                if (err) return console.log(err);

                console.log("db.open geht rein (login)");
                var sql = "SELECT * FROM USER_TABLE";
                conn.query(sql, function (err, data) {
                    if (err) console.log(err);
                    else {
                        console.log(socket.username);
                        console.log(loginpass);
                        console.log(sha256(loginpass));
                        data.forEach(function (tablerow) {
                            console.log("->" + tablerow.BENUTZERNAME + " " + socket.username);
                            console.log("-->" + tablerow.PASSWORT + " " + sha256(loginpass));
                            if ((tablerow.BENUTZERNAME == socket.username) && (tablerow.PASSWORT == sha256(loginpass))) {
                                loginusergefunden = true;

                                usernames.push(socket.username);
                                socketids.push(socket.id);
                                io.emit('dis-connect message', socket.username + ' has connected ');
                                console.log(socket.username + ' has connected');
                            }
                        });
                    }

                    if (loginusergefunden === true) {
                        callback(true); //Enter chatroom when entered Username and Passwort is found in Database
                    } else {
                        console.log("JUNGE WTF");
                        callback(false)
                    }

                    conn.close(function () {
                        console.log('done');
                    });
                });
            });
        }
    });


    /**
     * function for sending chat messages to the chat:
     * given msg is proofed: if msg is equal to the list command '/list',
     * the username array is send as a msg to the sender only (private chat, client side)
     * otherwise the msg is send to the chat message (client side)
     * including the sender username and the msg itself
     */
    socket.on('chat message', function (msg) {
        if (msg == String.fromCharCode(92) + 'list') {
            socket.emit('list', usernames);
        }
        else {
            io.emit('chat message', socket.username + ": " + msg);
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
    socket.on('private', function (privatemsg) {
        if ((privatemsg.fromSocket != null)) {
            socket.emit('private message', '[Private Msg @' + usernames[socketids.indexOf(privatemsg.toSocket)] + '] ' + socket.username + ': ' + privatemsg.msg);
            if (socket.id !== privatemsg.toSocket) {
                io.to(`${privatemsg.toSocket}`).emit('private message', '[Private Msg @' + usernames[socketids.indexOf(privatemsg.toSocket)] + '] ' + privatemsg.fromSocket + ': ' + privatemsg.msg);
            }

        } else {
            socket.emit('private', {mysocketid: socket.id, usernames: usernames, socketids: socketids});
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
    socket.on('disconnect', function () {
        usernames.splice(usernames.indexOf(socket.username), usernames.indexOf(socket.username) + 1);
        socketids.splice(socketids.indexOf(socket.id), socketids.indexOf(socket.id) + 1);
        console.log(socket.username + ' disconnected');
        io.emit('dis-connect message', socket.username + ' disconnected ');
    });

    socket.on('requestMood', function (msg) {
        var req = http2.request(options, function (res) {
            var chunks = [];

            res.on("data", function (chunk) {
                chunks.push(chunk);
            });

            res.on("end", function () {
                var body = Buffer.concat(chunks);
                console.log(body.toString());
                socket.emit('responseMood', body.toString());
            });
        });
        req.write(JSON.stringify({texts: [msg]}));
        req.end();
    });

});

/**
 * function to listening to the port setted above
 * with console.log for feedback
 */
http.listen(port, function () {
    console.log('listening on *:' + port);
});

function parseBase64Image(imageString) {
    var matches = imageString.match(/^data:image\/([A-Za-z-+/]+);base64,(.+)$/);
    var resource = {};
    if (matches.length !== 3) {
        return null;
    }
    resource.type = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    resource.data = new Buffer(matches[2], 'base64');
    return resource;
}

function checkFace(base64PIC) {
    return new Promise(function (resolve, reject) {
        var params = {
            images_file: null
        };
        // write the base64 image to a temp fil
        var resource = parseBase64Image(base64PIC);
        var temp = path.join(os.tmpdir(), uuid.v1() + '.' + resource.type);
        fs.writeFileSync(temp, resource.data);
        params.images_file = fs.createReadStream(temp);

        var methods = [];
        params.threshold = 0.5; //So the classifers only show images with a confindence level of 0.5 or higher
        methods.push('detectFaces');
        async.parallel(methods.map(function(method) {
            var fn = VR[method].bind(VR, params);
            return async.reflect(async.timeout(fn, asyncTime));
        }), function(err, results) {
            // combine the results
            results.map(function(result) {
                if (result.value && result.value.length) {
                    result.value = result.value[0];
                }
                if(result.value["images"][0]["faces"].length>0){
                    validProfile = true;
                    console.log("GESICHT ERKANNT");
                    resolve(true);
                }else{
                    console.log("KEIN GESICHT");
                    reject(false);
                }
                return result;
            })
        });
    });
}