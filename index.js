var fs = require('fs');
var https = require('https');
var myPackageInfo = require('./package.json');

function parseVersion(verString) {
  var total = 0;
  var nums = verString.split('.');
  nums.forEach(function(x, ind) { total += Math.pow(10, (nums.length - ind - 1) * 2) * parseInt(x); });
  return total;
}
var myVersion = parseVersion(myPackageInfo.version);

var childproc = require('child_process');

var targetStory = 'speakerTest';

var startupDate = new Date();

var ensePlaying = false;

var enseQueue = [];
var highestIdQueued = 0;

var pendingCheck = false;

var fileNum = 0;

var filenamePlayNext = null;

var pendingDownload = false;

function err(e) { console.error("Error:", e);}

var download = function(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  var request = https.get(url, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close(cb);  // close() is async, call cb after close completes.
    });
  }).on('error', function(err) { // Handle errors
    fs.unlink(dest); // Delete the file async. (But we don't check the result)
    if (cb) cb(err.message);
  });
};

function playAudio(filename, cb) {
        ensePlaying = true;
        childproc.spawn('mplayer' , [ filename]).on('close', () => { ensePlaying                                                                                                                                    = false; cb();});
}

function playNextLoop() {
        playAudio(filenamePlayNext, playNextLoop);
        filenamePlayNext = null;
}

function checkQueue() {
        var nextEnse = enseQueue.pop();
        if(nextEnse) {
                var destFile = (fileNum++) + ".m4a";
                fileNum = fileNum % 4;
                var audUrl = nextEnse[1].fileUrl;
                pendingDownload = true;
                console.log("DOWNLOADING", nextEnse[0]);
                download(audUrl, destFile, (e) => {
                        if(!e) {
                                filenamePlayNext = destFile;
                                if(!ensePlaying) playNextLoop();
                        } else { err(e); }
                        pendingDownload = false;
                });
        }
}

function addToQueue(list) {
        var idBookmark = highestIdQueued;
        var highestQueuedNow = idBookmark;
        list.forEach((item) => {
                var itemId = parseInt(item[0]);
                var parsedDate = new Date(item[1].timestamp);
                if(itemId > idBookmark && parsedDate > startupDate) {
                        console.log("ENQUEUE", itemId);
                        enseQueue.push(item);
                        if(itemId > highestQueuedNow) highestQueuedNow = itemId;
                }
        });
        highestIdQueued = highestQueuedNow;
}

function checkForEnses() {
        pendingCheck = true;
        var recievedData = "";
        https.get('https://api.ense.nyc/topics/' + targetStory, (res) => {
                pendingCheck = false;
                res.on('data', (d) => {
                        recievedData += d;
                });
                res.on('end', () => {
                        var resp = JSON.parse(recievedData);
                        addToQueue(resp.enses);

                        checkQueue();
                });
        }).on('error', (e) => {
                err(e);
                pendingCheck = false;
        });
}

function mainCycle() {
        checkForEnses();
        if(!filenamePlayNext && !pendingDownload) {
                checkQueue();
        }
}

function doReboot() {
  require('child_process').exec('sudo /sbin/shutdown -r now', function (msg) { console.log(msg) });
}

function updateCycle() {
  var recievedData = "";
  https.get('https://producer.ense.nyc/speakerVersion', (res) => {
                pendingCheck = false;
                res.on('data', (d) => {
                        recievedData += d;
                });
                res.on('end', () => {
                        var newVer = parseVersion(recievedData);
                        if(newVer > myVersion) doReboot();
                        else scheduleUpdateCheck();
                });
        }).on('error', (e) => {
                scheduleUpdateCheck();
        });
}

function scheduleUpdateCheck() {
  setTimeout(updateCycle, 30000);
}

setInterval(mainCycle, 3000);

scheduleUpdateCheck();

filenamePlayNext = "online.m4a";
playNextLoop();
