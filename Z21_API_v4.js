var express     = require('express'),
    app         = express(),
    compression = require('compression'),
    bodyParser  = require('body-parser'),
    _           = require('lodash'),
    async       = require('async'),
    Q           = require('q'),
    dgram       = require('dgram'),
    port        = process.env.PORT || 5555,
    host        = '10.10.110.29',
    speedKey    = "karremNeedsToGetSomeSleep",
    minLoco     = 3,
    maxLoco     = 10,
    hornDelay   = 2000,
    hornOn      = false;

/**
 * Express App Setup
 */

app.use(compression());
app.use(bodyParser.json({limit: '2mb'}));
app.use(bodyParser.urlencoded({limit: '2mb', extended: true}));

/**
 * Schema
 */

var bodySchema = {
    'loco': {
        'speed': {
            notEmpty: false,
            type: 'int',
            min: 0,
            max: 127,
            errorMessage: 'Valid numbers are: 0 to 127 (note speed 1 is emergency stop so will be converted to 3), + or - will increment speed by value within the max/min limits'
        },
        'direction': {
            notEmpty: false,
            type: 'str',
            values: ['forward', 'forwards', 'backward', 'back', 'backwards'],
            errorMessage: 'Forward, backward'
        },
        'eStop': {notEmpty: false, type: 'str', values: ['on'], errorMessage: 'on = emergency stop'},
        'headlight': {
            notEmpty: false,
            type: 'str',
            func: 0,
            values: ['on', 'off', 'toggle'],
            errorMessage: 'Options are on, off or toggle'
        },
        'bell': {
            notEmpty: false,
            type: 'str',
            func: 01,
            values: ['on', 'off', 'toggle'],
            errorMessage: 'Options are on, off or toggle'
        },
        'headlightdim': {
            notEmpty: false,
            type: 'str',
            func: 07,
            values: ['on', 'off', 'toggle'],
            errorMessage: 'Options are on, off or toggle'
        },
        'horn': {
            notEmpty: false,
            type: 'str',
            func: 02,
            values: ['on', 'off', 'toggle'],
            errorMessage: 'Options are on, off or toggle'
        },
        'whistle': {
            notEmpty: false,
            type: 'str',
            func: 03,
            values: ['on', 'off', 'toggle'],
            errorMessage: 'Options are on, off or toggle'
        },
        'mute': {
            notEmpty: false,
            type: 'str',
            func: 08,
            values: ['on', 'off', 'toggle'],
            errorMessage: 'Options are on, off or toggle'
        }
    },
    'track': {
        'power': {values: ['on', 'off']},
        'eStop': {callback: 'track_eStop'}
    },
    'turnouts': {
        turnout: {values: ['on', 'off']},
        namedTurnouts: {
            bottomLeft:  {switchId: 1111, on_msg: [0x09, 0x00, 0x40, 0x00, 0x53, 0x00, 0x63, 0x89, 0xb9], off_msg: [0x09, 0x00, 0x40, 0x00, 0x53, 0x00, 0x63, 0x89, 0xb9]},
            bottomRight: {switchId: 2222, on_msg: [0x09, 0x00, 0x40, 0x00, 0x53, 0x00, 0x63, 0x89, 0xb9], off_msg: [0x09, 0x00, 0x40, 0x00, 0x53, 0x00, 0x63, 0x89, 0xb9]}
        }

    }
};
var help_DataStructure = "/track/turnouts JSON = {turnouts : [name or dccId : value, status : open/closed] }"


/**
 * Remote UDP server
 */

var UDP_PORT = 21105;
//var UDP_HOST = '171.68.22.150';
var UDP_HOST = '10.10.120.5';

//var UDP_PORT    = 8001;
//var UDP_HOST    = 'localhost';

/**
 * Local UDP server for Testing
 * This is remote UDP server running it locally
 */

//var localUDPServer = dgram.createSocket('udp4'),
//    curTrainInfo = { // Container to store info
//        05: {isOn: true, speed: bodySchema.loco.speed.max, direction: 'forward'} // Default
//    };
//
//localUDPServer.on('listening', function () {
//    var address = localUDPServer.address();
//    console.log('SERVER: UDP Server listening on ' + address.address + ":" + address.port);
//});
//
//localUDPServer.on('message', function (message, remote) {
//    console.log('SERVER: recieved message from ', remote.address + ':' + remote.port);
//
//    if (message.toString() === 'Get Current Speed') {
//        console.log('SERVER: message is "%s"', message.toString());
//        console.log(curTrainInfo);
//        var msg = _setSpeed(05, curTrainInfo[05].direction, curTrainInfo[05].speed).toString('hex');
//    } else {
//        var a = splitHex(message.toString('hex'));
//        //console.log('SERVER: message is', a);
//        if (a[a.length - 1] === '30') {
//            curTrainInfo.isOn = true;
//            console.log('SERVER: Train is On');
//            var msg = 'Train is On';
//        } else if (a[a.length - 1] == 31) {
//            curTrainInfo.isOn = false;
//            console.log('SERVER: Train is Off');
//            var msg = 'Train is Off';
//        } else {
//            console.log('SERVER: message is', hex2ascii(message.toString('hex')));
//            a = hex2ascii(message.toString('hex')).split(',');
//            console.log('SERVER: message is', a);
//            if (a.length === 11) {
//                if (a[8]) {
//                    console.log('Setting speed:', a[8]);
//                    curTrainInfo[05].speed = parseInt(a[8]);
//                } else if (a[9]) {
//                    console.log('Setting direction:', a[9]);
//                    curTrainInfo[05].direction = a[9];
//                }
//            }
//            var msg = 'Ok!';
//        }
//    }
//    var dp = new Buffer(msg);
//
//    localUDPServer.send(dp, 0, dp.length, remote.port, remote.address, function (err, bytes) {
//        if (err) throw err;
//        console.log('SERVER: Sending back response:', msg);
//    });
//});
//
//localUDPServer.bind(UDP_PORT);

/**
 * Client
 */

function Hex2Bin(n){
    if(!checkHex(n))return 0;return parseInt(n,16).toString(2)
}

function checkHex(n) {
    return /^[0-9A-Fa-f]{1,64}$/.test(n)
}

function splitHex(hexVal) {
    hexVal = hexVal.toString();
    //console.log('hex -- ' + hexVal)
    var commaSeperated = '';
    if (hexVal.substring(0, 1) == '#')
        hexVal = hexVal.substring(1, hexVal.length);
    for (var i = 0; i < hexVal.length; i++) {
        commaSeperated += hexVal.charAt(i);
        commaSeperated += (i % 2 == 1 && i != (hexVal.length - 1)) ? ',' : '';
    }
    //console.log(commaSeperated);
    return commaSeperated.split(',');
}

function hex2ascii(v) {
    var hexVal = v.toString(),
        str = '';
    for (var i = 0; i < hexVal.length; i += 2)
        str += String.fromCharCode(parseInt(hexVal.substr(i, 2), 16));
    console.log('hex2ascii:', str);
    return str;
}

function _trackPower(mode) {
    if (mode == 'on')  return [0x07, 0x00, 0x40, 0x00, 0x21, 0x81, 0xa0];
    else return [0x07, 0x00, 0x40, 0x00, 0x21, 0x80, 0xa1];

}

function bit_test(num,bit){
    return ((num>>bit) % 2 != 0)
}

//function createHexString(arr) {
//	console.log('createHexStr')
//    var result = '';
//    var z;
//
//    for (var i = 0; i < arr.length; i++) {
//        var str = arr[i].toString(16);
//        //z = 8 - str.length + 1;
//        //str = Array(z).join("0") + str;
//        result += str;
//		console.log(i + '--' + result)
//    }
//
//    return result;
//}
//
//
//
//function _getLocoInfo (locoId){
//    console.log ('_getLocoInfo(2)');
//	arr = [ 0x09, 0x00, 0x40, 0x00, 0xE3, 0xF0, 0x00, locoId.toString(16)];
//    console.log(arr);
//	arr.push (arr[5]^arr[6]^arr[7]);
//	console.log(arr);
//	//var ret =  createHexString(arr);
//	//console.log(ret);
//	return arr
//}

function calcFunctionsFuncs (data, returnData) {
/*
Byte 9   0DSLFGHJ L ... F0 (light),  F ... F4, G ... F3, H ... F2, J ... F1
Byte 10  F5 - F12  ... F5 = bit0 (LSB)

"HEADLIGHT"         : 9.1,   # FO/FL Headlights  F0 Headlight On/Off
"BELL"              : 9,   # F1  Bell
"HORN"              : 9,   # F2 Horn On/Off
"SHORTWHISTLE"      : 9,   # F3 Whistle On/Off
"STEAM"             : 9,   # F4 Steam Release (Hiss)
"F5"                : 10,    # F5 - FREE
"SMOKE"             : 10,    # F6 Smoke Unit On/Off
"HEADLIGHTDIMMER"   : 10,    # F7 Headlight Dimmer On/Off
"MUTE"              : 10,    # F8 Mute
"INTEROVER"         : 10,    # F9 Inertia Override (temporarily overrides momentum settings)
"HALFSPEED"         : 10,    # F10 Half Speed (for switching/shunting operations)
"BRAKE"             : 10,   # F11 Brake Squeal (when moving) / Brake Release (when stopped)
"F12"               : 10,   # F12 - FREE

*/
    //console.log(data[9], data[10]);
    a = 'bin data(9) =  ' + Hex2Bin(data[9]) + '; bin data(10) =  ' + Hex2Bin(data[10]) + '  bitest = ' + bit_test(data[9], 4);

    var d9  = String(data[9]);
    var d10 = String(data[10]);

    var n9      = "00000000.substr(d9.length)+d;";
    var n10     = "00000000.substr(d10.length)+d;";

    //console.log('BT = ' + bit_test(parseInt(n9, 2), 4))

    returnData.locoId       = (data[6])
    returnData.headlight    = (bit_test(parseInt(n9, 3  ))) ? 'on' : 'off';    //F0
    returnData.bell         = (bit_test(parseInt(n9, 7  ))) ? 'on' : 'off';     //F1
    returnData.horn         = (bit_test(parseInt(n9, 6  ))) ? 'on' : 'off';    //f2
    returnData.shortwistle  = (bit_test(parseInt(n9, 5  ))) ? 'on' : 'off';     //F3
    returnData.steam        = (bit_test(parseInt(n9, 4  ))) ? 'on' : 'off';     //F4
    returnData.smoke        = (bit_test(parseInt(n10, 6 ))) ? 'on' : 'off';    //F6
    returnData.headlightdim = (bit_test(parseInt(n10, 5 ))) ? 'on' : 'off';    //f7
    returnData.mute         = (bit_test(parseInt(n10, 4 ))) ? 'on' : 'off';    //F8
    returnData.debug = a;

    //console.log(returnData);
    return  returnData;
}

// Using Q promise
function _getInfo(locoId) {
    var deferred = Q.defer(),
        timeout;

    try {
        var thisZ21Ref = dgram.createSocket('udp4');
        //console.log('thisZ21Ref:', thisZ21Ref);
        //console.log('_getLocoInfo' + locoId);
        arr = [0x09, 0x00, 0x40, 0x00, 0xE3, 0xF0, 0x00, locoId.toString(16)];
        arr.push(arr[5] ^ arr[6] ^ arr[7]);

        var dataPacket = arr.join();
        var dp = new Buffer(arr);

        // if respond is take longer then 10 seconds
        timeout = setTimeout(function () {
            if (thisZ21Ref) {
                thisZ21Ref.close();
                thisZ21Ref = null; // manually releasing mem
            }
            console.log('CLIENT: UDP Server took too long to response.');
            deferred.reject('UDP Server took too long to response.');
        }, 10000);

        thisZ21Ref.on('message', function (message, remote) {
            if (timeout) clearTimeout(timeout);
            thisZ21Ref.close();
            thisZ21Ref = null; // manually releasing mem

            console.log('CLIENT: Message recieved:', message.toString('hex'));
            // todo - check what the result of a query to a non-responding loco looks like and set validLoco
            var validLoco = true,
                returnData = {};

            if (validLoco) {
                returnData = {statusText: 'detected', statusValue: true}
                var hexStr = splitHex(message.toString('hex'));
                var a = parseInt(hexStr[8], 16);
                var cSpd = a, cDir = 0;
                if (a > 0x80) {
                    cDir = 1
                }
                cSpd &= ~(1 << 7);
                returnData = {speed: cSpd, direction: cDir}
                calcFunctionsFuncs(hexStr, returnData);
            }
            else {
                returnData = {statusText: 'not Detected', statusValue: false}
            }
            deferred.resolve(returnData);

        }).on('error', function (err) {
            if (timeout) clearTimeout(timeout);
            if (thisZ21Ref) {
                thisZ21Ref.close();
                thisZ21Ref = null; // manually releasing mem
            }
            deferred.reject(err);
        }).send(dp, 0, dp.length, UDP_PORT, UDP_HOST, function (err, bytes) {
            if (err) {
                if (timeout) clearTimeout(timeout);
                thisZ21Ref.close();
                thisZ21Ref = null; // manually releasing mem

                console.log('CLENT:', err); // Network error
                deferred.reject(err);
            } else
                console.log('CLIENT: _getSpeed > UDP message sent "%s"', dataPacket);
        });
    } catch (err) {
        if (timeout) clearTimeout(timeout);
        if (thisZ21Ref) {
            thisZ21Ref.close();
            thisZ21Ref = null; // manually releasing mem
        }
        deferred.reject(err);
    }


    return deferred.promise;
}

function _setSpeed(locoId, direction, speed) {
    console.log('Start speed = ' + speed + ' Start direction = ' + direction);
    if (!speed) {
        return;
    } //
    // set speed min and max; can't go below or higher
    else {
        if (speed < bodySchema.loco.speed.min){
            speed = bodySchema.loco.speed.min;}
        else if (speed > bodySchema.loco.speed.max){
            speed = bodySchema.loco.speed.max;}
    }

    // per DCCSTandrd a speed of 01 == Emgernecy Stop.
    if (speed == 1)
        speed = 0;


    var a = [0x0a, 0x00, 0x40, 0x00, 0xe4, 0x13, 0x00];
    a.push(locoId.toString(16));

    if (direction == 1) {
        a.push(parseInt(speed + 128));
    }
    else {
        a.push(parseInt(speed));
    }
    //console.log('speed = ' + speed + '   direction = ' + direction + '  combined == ' + a[8])

    a.push(a[4] ^ a[5] ^ a[6] ^ a[7] ^ a[8]); // XOR Byte
    return a;
}

function _setFunction(locoId, func, change) {
    switchType = {'off': 0x00, 'on': 0x40, 'toggle': 0x80};
    //console.log('type-- ' + switchType[change])
    dp = [0x0a, 0x00, 0x40, 0x00, 0xe4, 0xf8, 0x00]; // f0
    dp.push(locoId); //
    //console.log('ST = ' + change + '  ' +  switchType[change] + 'Function = ' + func);
    dp.push(parseInt(func) + switchType[change]);// function
    dp.push(dp[4] ^ dp[5] ^ dp[6] ^ dp[7] ^ dp[8]);
    //console.log('dp = ' + dp.toString('hex'))
    return dp
}

function _setTurnout(turnoutID, mode) {
    return 'FUN';
}

function __sendCmd(dataPacket, callback, counter) {
    console.log('-----------------------------------');
    //var timeout;
    try {
        var thisZ21Ref = dgram.createSocket('udp4');
        var dp = new Buffer(dataPacket);
        thisZ21Ref.send(dp, 0, dp.length, UDP_PORT, UDP_HOST, function (err, bytes) {
            if (err) {
                callback(err);
            }

            console.log('CLIENT: UDP message number ', counter + ' sent.   Packet ==>  ' + dataPacket.toString('hex'));
            if (thisZ21Ref) {
                thisZ21Ref.close();
                thisZ21Ref = null; // manually releasing mem
            }
        });

        //thisZ21Ref.on('message', function (message, remote) {
        //    if (timeout) clearTimeout(timeout);
        //    thisZ21Ref.close();
        //    thisZ21Ref = null; // manually releasing mem
        //
        //    // Parsing
        //    var hexStr = splitHex(message.toString('hex'));
        //    /*
        //    console.log('recieved --  ' + hexStr); // processResult(message,'LAN_GET_SERIAL_NUMBER').toString(16))
        //    switch (hexStr[04]) {
        //     case 'ef':
        //     console.log('speed = ' + hexStr[04]);
        //     }
        //     console.log('CLIENT: Message recieved' +' -   ' + hexStr );*/
        //
        //    if (_.isFunction(callback))
        //        callback(null, hexStr);
        //}).on('error', function (err) {
        //    //if (timeout) clearTimeout(timeout);
        //    if (thisZ21Ref) {
        //        thisZ21Ref.close();
        //        thisZ21Ref = null; // manually releasing mem
        //    }
        //    callback(err);
        //}).send(dp, 0, dp.length, UDP_PORT, UDP_HOST, function (err, bytes) {
        //    if (err) {
        //        callback(err);
        //    }
        //    console.log('CLIENT: UDP message sent', counter);
        //});
    } catch (err) {
        //if (timeout) clearTimeout(timeout);
        if (thisZ21Ref) {
            thisZ21Ref.close();
            thisZ21Ref = null; // manually releasing mem
        }
        callback(err);
    }

}

function setBroadcastFlags (){
    console.log('Setting Broadcast Flags');
    var arr = [0x08, 0x00, 0x50, 0x00, 0x03, 0x00, 0x00, 0x09];
    __sendShortCmd(arr);
}

function __sendShortCmd(dataPacket) {
    console.log('Sending message');
    var v   = new Buffer(dataPacket);
    var z21 = dgram.createSocket('udp4');
    console.log('data =: ' + dataPacket + ' length = ' + dataPacket.length)
    z21.send(v, 0, dataPacket.length, UDP_PORT, UDP_HOST, function (err, bytes) {
        if (err) throw err;
        //console.log('UDP message sent ' + dataPacket.toString('hex'));
        z21.close();
        z21 = null; // manually releasing mem
    });
    return ''
}

function __errorMsg(myKey) {
    return {'parameter': myKey, 'error message': bodySchema.loco[myKey].errorMessage};
}

function createFunctionPackage(locoId, trainFunction, params, counter) {

    task = (function (dp, counter) {
        return function (callback) {
            __sendCmd(dp, callback, counter);
        };
    })(_setFunction(locoId, trainFunction, params), counter);

    return task;

}

// Combine Speed and Direction
function createSpeedDirectionPackage(locoId, params, thisTrainInfo, counter) {
    //console.log('createSpeedDirectionPackage' )
    var speed = thisTrainInfo.speed,
        direction = thisTrainInfo.direction;

    // Set Speed
    if (_.has(params, 'speed')) if (_.isString(params.speed) && params.speed !== '') {  // Not empty
        var speedStr = _.trim(params.speed); // Remove white spaces
        if (speedStr !== '' && ( _.startsWith(speedStr, '-') || _.startsWith(speedStr, '+') )) {
            var speedInt = parseInt(speedStr);
            //console.log("speedInt = " + speedInt + "  existing speed = " + thisTrainInfo.speed)
            if (_.isNumber(speedInt))
                speed = thisTrainInfo.speed + speedInt;
        }
        else if (_.isNumber(parseInt(params.speed))) {  // number as string
            speed = parseInt(params.speed);
        }
    }
    else if (_.isNumber(params.speed)) {// number passed in
        speed = params.speed;
    }

    // Set Direction
    //console.log('params.direction = ' + params.direction);
    if (_.has(params, 'direction') && bodySchema.loco.direction.values.indexOf(params.direction) > -1) {
        //console.log('found dir == ' + params.direction);
        if (_.startsWith(params.direction, 'f')) {
            direction = 1;
        }
        else {
            direction = 0;
        }
        //console.log('(2)DIRECTION ==> ' + direction + 'SPEED = ' + speed)
    }
    return _setSpeed(locoId, direction, speed)

}

function singlePackagePerRequest(thisTrainInfo, params, locoId, res) {
    //console.log('SinglePacketPerrequest' );
    //console.time('singlePackagePerRequest'); // Start time

    var counter = 0,
        setSpeedDirection = false, // flag use to combine speed and direction
        z21DataPackets = []; // Multi transmissions

    for (var myKey in params) {

        if (bodySchema.loco[myKey]) {
            //  if it is a string then it will have values and they need to be in "values" and the function has to be in the array
            if      (bodySchema.loco[myKey].type === 'str' && bodySchema.loco[myKey].values.indexOf(params[myKey]) !== -1 && _.has(bodySchema.loco[myKey], 'func')) {
                console.log('found valid function : ' + myKey)
                var setFunction = _setFunction(locoId, bodySchema.loco[myKey].func, params[myKey]);
                if (setFunction) z21DataPackets = z21DataPackets.concat(setFunction);
                if (myKey == 'horn' && params[myKey] == 'on') hornOn = true;
                if (myKey == 'hornDelay')  hornDelay = params[myKey];
                //z21DataPackets.push(setFunction);
                //z21DataPackets.push(
                //    (function (dp, counter) {
                //        return function (callback) {
                //            __sendCmd(dp, callback, counter);
                //        };
                //    })(_setFunction(locoId, bodySchema.loco[myKey].func, params[myKey]))
                //);
                counter++;

            }
            else if ((myKey === 'speed' || myKey === 'direction') & _.has(params, 'key')) {
                if (params.key == speedKey) {
                    if (setSpeedDirection) continue; // skip if already set
                    var speedDirection = createSpeedDirectionPackage(locoId, params, thisTrainInfo, counter);
                    if (speedDirection) z21DataPackets = z21DataPackets.concat(speedDirection);
                    setSpeedDirection = true;
                    counter++;
                }
            }
            else if (myKey == 'eStop' && params[myKey] == 'on') {
                console.log('ESTOP');
                a = _setSpeed(locoId, 'forward', -1)
                console.log("a = " + a)
                __sendShortCmd(a);
                console.log("eStop Sent!!")
                res.status(200).json('Emergency Stop!!!!');
            }
        }
    }
     if (!z21DataPackets.length)
        res.status(400).send('Empty request!');
    else {
         __sendShortCmd(z21DataPackets);
         if (hornOn){
             delay = hornDelay;
             if (_.has(params, 'horndelay')){
                 delay = params.horndelay *1000;
             }
             console.log("sending horn off");
             setTimeout(function(){  __sendShortCmd(_setFunction(locoId, bodySchema.loco.horn.func, 'off')); }, delay);
         }

         res.status(200).json('done');
         hornOn = false;
    }
}


// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();

router.get('/locos_old', function (req, res) {
    var locoData = {};
    for (i = minLoco; i < maxLoco; i++) {
        console.log('I = ' + i)
        _getInfo(i).then(function (results) {
            console.log('CLIENT: _getSpeed results: Loco ' + i , "  ", results);
            locoData[i] = results;
        })
    }
    if (locoData.length) res.status(200).send(locoData)
    else  res.status(400).send({result : "fail", message : "no data"})

});

router.get('/locos', function (req, res) {
   var series = [];
    for (i = minLoco; i < maxLoco; i++) {
    series.push(
    (function (locoId) {
    return function (callback) {
    console.log('I = ' + locoId)
        _getInfo(locoId).then(function (results) {
            callback(null, {locoId: locoId, status: 'success', results: results});
        }, function (err) {
        callback(null, {locoId: locoId, status: 'failed', results: err}); // use callback(null) instead of callback(err) so we can match the result pattern
        });
    };
    })(i)
     );
    }
    async.series(series, function (err, results) {
    console.log(results);

res.status(200).send(results);
    });
});

router.get('/loco/:locoId', function (req, res) {
    var locoId = parseInt(req.params.locoId, 10);

    _getInfo(locoId).then(function (results) {
        //console.log('CLIENT: _getSpeed results:', results);
        res.status(200).send(results);

    })

});

router.post('/loco/:locoId', function (req, res) {
    console.log('############################################');
    var params = req.body || {},
        locoId = parseInt(req.params.locoId, 10);

    if (!_.size(params) || !locoId)
        return res.status(500).send('No data. Check format of the body and content-type = application/json');
    else {
        //setBroadcastFlags();
        // Get current speed

        _getInfo(locoId).then(function (results) {
            console.log('CLIENT: _getSpeed results:', results);
            singlePackagePerRequest(results, params, locoId, res);
            //res.status(200).send('{ completed }');

        }, function (err) {
            res.status(500).send(err);
        });

    }
});

router.get('/track/power', function (req, res) {
    return res.status(404).send({'result': 'Track power status functionality not let implemented'});
});

router.post('/track/power', function (req, res) {

    if (!_.size(req.body) || !req.body.power)
        return res.status(400).send('No data.... Check format of the body and content-type = application/json');
    else if (bodySchema.track.power.values.indexOf(req.body.power) !== -1) {
        __sendShortCmd(_trackPower(req.body.power));
        return res.status(200).send({'request': 'success', 'trackPower': req.body.power});
    }
    else
        res.status(401).send('No valid command recieved : ' + params);
});

router.post('/track/turnout', function (req, res) {
    /*formate for json is [ {name OR switchId : value, status : open or closed//
     example data
     [{name :   test, status : on},
     {dccID  : 1122 , status : on}
     ]

     */
    var params = req.body || {},
        z21DataPacket = [],
        error = {};

    if (!_.size(params)) {
        error = {returnCode : 400, error : 'No data provided.  .... Check format of the body and content-type = application/json'};
    }

    else {
        //console.log('cnt = ' + params.length)
        for (var cnt = 0; cnt < params.length; cnt++) {
            var dp = [],
                swName;
            // Det the DCC address for the turnout
            if (params[cnt].switchId && params[cnt].name) {
                swName = -2 }
            else if (params[cnt].switchId) {
                var n = _.findKey(bodySchema.turnouts.namedTurnouts, function (o) {
                    return o.switchId == params[cnt].switchId;
                })
                if (n == undefined) {
                    error = {returnCode: 400, error: 'No such switchId'};
                }
                else {

                }

            }
            else if (params[cnt].name){
                swId = params[cnt].name;
            }
            else {
                swId = -1;
            }

            /*
            error checking
            */
            //console.log('cnt = ' + cnt + '   ' + params[cnt].status)
            if (!_.has(params[cnt], 'status') || (swId == -1 )) {
                error = {returnCode: 400, error: 'Missing data, switchId or name or status missing'};
            }
            else if (swId == -2 ) {
                error = {returnCode: 400, error: 'Prove either a name or a switchId but not both'};
            }
            else if (swId == -1){

            }
            else if (params[cnt].name && _.has(bodySchema.turnouts.namedTurnouts, params[cnt].name)) { // named turn out and it exists
                console.log("1");
                dp = bodySchema.turnouts.namedTurnouts[params[cnt].name][params[cnt].status + "_msg"];
            }
            else if (params[cnt].switchId) {
                var n = _.findKey(bodySchema.turnouts.namedTurnouts, function (o) {
                    return o.switchId == params[cnt].switchId;
                });
                if (n == undefined) {
                    error = {returnCode: 400, error: 'No such switchId'};
                }
                else {
                    dp = bodySchema.turnouts.namedTurnouts[n][params[cnt].status + "_msg"];
                }
            }

            else {
                error = {returnCode: 400, error: 'General failure.'};
            }
            //var dp = _setTurnout(switchId, params.turnout);
            console.log("DP = " + dp)
            if (dp) z21DataPacket = z21DataPacket.concat(dp);

        }
        if (error) {
            str = JSON.stringify(error, null, 4); // (Optional) beautiful indented output.
            console.log(str)
            res.status(error.returnCode).send({ "status" : "failed", error : error.error});

        }
        else if (z21DataPacket && !error) {
            console.log(z21DataPacket)
            __sendShortCmd(z21DataPacket);
            res.status(200).send({status: 'success'});
        }
    }

});

router.get('/help', function (req, res) {
    res.status(200).json(bodySchema);
});

app.use('/', router);

// START THE SERVER
// =============================================================================
app.listen(port, host);
console.log('listening on port ' + port);