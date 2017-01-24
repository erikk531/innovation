var config = require('./config');
var nlp = require('./nlp');
var twilioResponder = require('twilio');
var twilioClient = require('twilio')(config.accountSid, config.authToken);

module.exports.sendSmsResponse = function(response, incomingMessage, messageFrom) {
    nlp.generateBotResponse(incomingMessage, messageFrom).then(function(botResponse) {
        sendResponse(response, botResponse);
    }, function(botError) {
        console.log("Bot message: "+botError);
    });
};

module.exports.sendSmsMessage = function(to, outgoingMessage) {
    twilioClient.messages.create({
        body: outgoingMessage,
        to: to,
        from: config.phoneNumber
    }, function(error, data) {
        if (error) {
            console.log('Could not send message.');
            console.log(error);
        } else {
            console.log(data);
            console.log('Message sent.');
        }
    });
};

function sendResponse(response, botResponse) {
    console.log(botResponse);
    // construct TwiML message
    var twiml = new twilioResponder.TwimlResponse();
    twiml.message(botResponse);

    // write Content-Type and Status Code to header
    response.writeHead(200, {'Content-Type': 'text/xml'});

    // write TwiML response and close HTTP stream
    response.end(twiml.toString());
}