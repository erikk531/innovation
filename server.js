var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var twilioClient = require('./twilioClient');

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/sms', function(request, response) {
    var incomingMessage = request.body.Body;
    console.log("Incoming Message: "+incomingMessage);
    var messageFrom = request.body.From;
    twilioClient.sendSmsResponse(response, incomingMessage, messageFrom);
});

app.post('/error', function(request, response) {
    console.log("An error has occurred.");
});

http.createServer(app).listen(1337, function() {
    console.log("Express server is listening on port 1337.");
});