/**Authors:
 * Name: Yasin Simsek  Matriculation Nr.: 741482
 * Name: Simeon Samuel Matriculation Nr.: 761386
 */

var express = require('express');
var app = express();

//Facedetection requirements
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var os = require('os');
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
var http = require('http').Server(app);
var http2 = require("http");
var io = require('socket.io')(http);
var sha256 = require("sha256");
var port = process.env.PORT || 3000;
var db = require('ibm_db');
var validProfile= false;
var usernames = [];
var socketids = [];
var loginpass;
app.enable('trust proxy');

//Helmet
var helmet = require('helmet');
app.use(helmet());


//Solution For: Missing or insecure HTTP Strict-Transport-Security Header
const sixYearsInSec = 189216210;
app.use(helmet.hsts({
    maxAge: sixYearsInSec,
    includeSubDomains: true,
    preload: true
}));

//Solution for: Missing or insecure "X-XSS-Protection" header
var xssFilter = require('x-xss-protection');
app.use(xssFilter({ setOnOldIE: true }));


/**
 * Set Headers to guarantee code safety and rediret to https if http is entered
 */
app.use(function (req, res, next) {
    if (req.secure || process.env.BLUEMIX_REGION === undefined) {
        res.setHeader('Access-Control-Allow-Origin', 'https://gifted-pike.eu-de.mybluemix.net/');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
        res.setHeader('Access-Control-Allow-Credentials', true);

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
app.use('/', express.static(__dirname + '/chat'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/chat/index.html');
});


/**
 * Solution for: Missing Secure Attribute in Encrypted Session (SSL) Cookie (1)
var session = require ('cookie-session');
var expiryDate = new Date( Date.now() + 60 * 60 * 1000 ); // 1 hour
app.use(session({
        name: 'session',
        keys: ['key1', 'key2'],
        cookie: { secure: true,
            httpOnly: true,
            domain: 'https://gifted-pike.eu-de.mybluemix.net',
            path: '/',
            expires: expiryDate
        }
    })
);
*/


//IBM DB2
var connStr =   'DRIVER={DB2};' +
    'HOSTNAME=dashdb-txn-sbox-yp-lon02-01.services.eu-gb.bluemix.net;' +
    'PORT=50000;' +
    'DATABASE=BLUDB;' +
    'UID=wrf22173;' +
    'PWD=l6z+2325rvgfgv2d';

//IBM Visual Recognition
var VR = new VisualRecognitionV3({
    version: '2018-03-19',
    url: 'https://gateway.watsonplatform.net/visual-recognition/api',
    iam_apikey: 'mPpxPNzm6wxCxudhIHz1krUx25vj5jp9SvpioPaq1Irh',
    use_unauthenticated: false
});

//Mood Analyzer
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

/**
 * IN PROGRESS
 * Solution for: Missing or insecure "Content-Security-Policy" header
 */
/*app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'", 'https://gifted-pike.eu-de.mybluemix.net/'],
        styleSrc: ["'self'", 'https://gifted-pike.eu-de.mybluemix.net/'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://gifted-pike.eu-de.mybluemix.net/', 'https://code.jquery.com/jquery-latest.min.js', '/socket.io/socket.io.js']
    }
}));*/


/**
 * function to listen to the connection of the socket and react to events from user
 */
io.on('connection', function (socket) {

    /**
     * Function to register new user in the Database. A user will be registered when it doesn't DB and
     * its profile picture is a human face otherwise his request will be declined (Error)
     */
    socket.on('new user', function (user) {
        socket.username = user.registerusername;

        db.open(connStr, function (err, conn) {
            if (err) return console.log(err);

            var sql = "SELECT * FROM USER_TABLE WHERE BENUTZERNAME = '" + socket.username + "';";

            conn.query(sql, function (err, data) {
                if (err) console.log(err);
                else {
                    console.log(data);
                    //if user is found
                    if (data.length > 0){
                        socket.emit('userexists', true);
                    }
                    else {
                        if(user.profile.length>0){
                            checkFace(user.profile).then(()=>{

                                if(validProfile){
                                    db.open(connStr, function (err, conn) {
                                        if (err) return console.log(err);
                                        var sq2 = "INSERT INTO USER_TABLE (BENUTZERNAME,PASSWORT) VALUES ('" + socket.username + "','" + sha256(user.registerpasswort) + "')";
                                        conn.query(sq2, function (err, data) {

                                            if (err) console.log(err);
                                            else console.log(data);

                                            //callback(true);
                                            socket.emit('userexists', false);
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
                }
                conn.close(function () {
                    console.log('done: checked if username exists in database');
                });
            });
        });
    });


    /**
     * Function that checks if user exists in the database and logs him in if username and password combination is correctly in DB
     * Otherwise Error Msg
     */
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
                        //Enter chatroom when entered Username and Passwort is found in Database
                        callback(true);
                    } else {
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
        if(socket.username){
            io.emit('dis-connect message', socket.username + ' disconnected ');
        }
    });

    /**
     * Function to send a json to the tone analyzer service in order to get the mood of the given Msg
     * Options: happy and unhappy
     */
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


/**
 * Function that parses a imagestring into a base64-Image
 * @param imageString
 * @returns {null}
 */
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

/**
 * Function to detect if the image is a valid human face or not
 * trough using the visual recognition service
 * @param base64PIC
 * @returns {Promise<any>}
 */
function checkFace(base64PIC) {
    return new Promise(function (resolve, reject) {
        var params = {
            images_file: null
        };

        // Takes created base64 img and saves it to a variable
        var resource = parseBase64Image(base64PIC);
        var temp = path.join(os.tmpdir(), uuid.v1() + '.' + resource.type);
        fs.writeFileSync(temp, resource.data);
        params.images_file = fs.createReadStream(temp);

        //Limit of 50% accordance of the img to a human face
        params.threshold = 0.5;

        VR.detectFaces(params,function (err,response) {
            if (response.value && response.value.length) {
                response.value = response.value[0];
            }
            if(response["images"][0]["faces"].length>0){
                validProfile=true;
                console.log("GESICHT ERKANNT");
				
				//--- Save given File: base64Pic.name and base64PIC.type is undefined
				//var imgWithPath = path.join("Profiles", base64PIC.name + '.' + base64PIC.type);
				//var buf = new Buffer(imgWithPath, 'base64');
				//fs.writeFile(imgWithPath, buf);
				//---
				
                resolve(true);
            }else{
                console.log("KEIN GESICHT GEFUNDEN!");
                reject(false);
            }
            return response;
        });
    });
}