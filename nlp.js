var fs = require('fs');
var _ = require('lodash');
var q = require('q');
var wordsToNum = require('words-to-num');
var config = require('./config');
var Wit = require('node-wit').Wit;
var witClient = new Wit({accessToken: config.witAuthToken});

var isMissingValues = false;

module.exports.generateBotResponse = function(incomingMessage, messageFrom) {
    console.log("generateBotResponse called");
    var deferred = q.defer();

    // get the session id based on the phone number that is texting bot
    getSessionIdAndContext(messageFrom).then(function(sessionIdAndContext) {
        var sessionId = sessionIdAndContext.sessionId;
        var context = sessionIdAndContext.context;

        witClient.message(incomingMessage).then((data) => {
            var messageDetails = JSON.stringify(data);
            var jsonMessageDetails = JSON.parse(messageDetails);
            var entities = jsonMessageDetails.entities;

            if (context == "initialMessage") {
                console.log("checkOrderInfo");

                var whatTheOrderIsMissing = checkOrderInfo(entities);

                // the order is not missing any items
                if (whatTheOrderIsMissing == null) {
                    setContext({'orderTime': {'orderTime': 2}}, messageFrom).then(function(updatedContext) {
                        deferred.resolve(module.exports.generateBotResponse(incomingMessage, messageFrom));
                    }, function(err) {
                        console.log(err);
                    });
                } else {
                    setContext({'whatTheOrderIsMissing': whatTheOrderIsMissing}, messageFrom).then(function(updatedContext) {
                        deferred.resolve(module.exports.generateBotResponse(incomingMessage, messageFrom));
                    }, function(err) {
                        console.log(err);
                    });

                }
            }
        }).catch(console.error);
    }, function(error) {
        console.log(error);
    });

    return deferred.promise;
}

function checkOrderInfo(entities) {
    var isMissingValues = false;
    var theOrder = {};
    theOrder.menuItems = {};

    if (entities.drink_type != null) {
        // array of drink types being ordered
        var drinkTypes = getWitEntityValues(entities.drink_type);

        // build the order JSON
        _.forEach(drinkTypes, function(drinkType) {
            theOrder.menuItems[drinkType] = {"size": "", "quantity": "", "additions": []};
        });

        // populate each drink order with the additional details the user gives
        _.forIn(entities, function(entityValues, entityType) {
            if (entityType != "drink_type") {
                var values = getWitEntityValues(entityValues);
                _.forEach(values, function(value) {
                    if (isNumeric(value)) {
                        theOrder.menuItems[entityType].quantity = value;
                    } else if (value == "small" || value == "medium" || value == "large") {
                        theOrder.menuItems[entityType].size = value;
                    } else {
                        theOrder.menuItems[entityType].additions.push(value);
                    }
                });
            }
        });

        var missingValues = {};

        // iterate the drinks being ordered - take note of which values are missing for each drink
        _.forEach(drinkTypes, function(drinkType) {
            if (theOrder.menuItems[drinkType].size == "" || theOrder.menuItems[drinkType].quantity == "") {
                isMissingValues = true;
                missingValues[drinkType] = theOrder.menuItems[drinkType];
            }
        });

        if (isMissingValues) {
            var askForWhatIsMissing = "Looks like I need a little bit more info from you to complete your order."

            _.forIn(missingValues, function(values, drink) {
                // update drink if iced_coffee
                if (drink == "iced_coffee") {
                    drink = "iced coffee";
                }

                // no size or quantity specified
                if (values.size == "" && values.quantity == "") {
                    askForWhatIsMissing = askForWhatIsMissing.concat("What size (small, medium, or large) and how many "+drink+"'s did you want?");
                } else {


                    if (values.size == "") {
                        if (values.quantity > 1) {
                            askForWhatIsMissing = askForWhatIsMissing.concat(" What size (small, medium, or large) "+drink+"'s did you want?");
                        } else {
                            askForWhatIsMissing = askForWhatIsMissing.concat(" What size (small, medium, or large) "+drink+" did you want?");
                        }
                    }

                    if (values.quantity == "") {
                        askForWhatIsMissing = askForWhatIsMissing.concat(" How many "+drink+"'s did you want?");
                    }
                }
            });

            return askForWhatIsMissing;
        }
        // nothing is missing from the order
        else {
            return null;
        }
    }

}

function getWitEntityValues(entityValues) {
    var theValues = [];
    _.forEach(entityValues, function(entityValue) {
        if (entityValue.value == "iced coffee") {
            var icedCoffee = "iced_coffee";
            theValues.push(icedCoffee);
        } else {
            theValues.push(entityValue.value);
        }
    });

    return theValues;
}

function isNumeric(value) {
    return /^\d+$/.test(value);
}

// promise
function getContextForConversation(messageFrom) {
    var deferred = q.defer();

    fs.readFile('sessions.json', function(err, content) {
        if (err) {
            console.log("getContextForConversation: Error reading sessions.json");
        } else {
            var parseJson = JSON.parse(content);

            // the entry exists - get context
            if (parseJson[messageFrom]) {
                deferred.resolve(parseJson[messageFrom].context);
            } else {
                deferred.reject("getContextForConversation: Entry does not exist");
            }
        }
    });

    return deferred.promise;
}

// promise
function setContext(updatedContext, messageFrom) {
    var deferred = q.defer();
    fs.readFile('sessions.json', function(err, content) {
        if (err) {
            console.log("setContext: Error reading sessions.json");
        } else {
            var parseJson = JSON.parse(content);

            // the entry exists - set updated context
            if (parseJson[messageFrom]) {
                console.log("setContext: "+parseJson[messageFrom]);
                parseJson[messageFrom].context = updatedContext;
                fs.writeFile('sessions.json', JSON.stringify(parseJson), function(err) {
                    if (err) {
                        deferred.reject("Error writing to sessions.json");
                    } else {
                        deferred.resolve(updatedContext);
                    }
                });
            } else {
                deferred.reject("setContext: Entry does not exist");
            }
        }
    });

    return deferred.promise;
}

//// promise
//function endSession(messageFrom) {
//    var deferred = q.defer();
//
//    fs.readFile('sessions.json', function(err, content) {
//        if (err) {
//            console.log("endSession: Error reading sessions.json");
//        } else {
//            var parseJson = JSON.parse(content);
//
//            // the entry exists
//            if (parseJson[messageFrom]) {
//                parseJson[messageFrom].sessionId = "";
//                parseJson[messageFrom].context = {};
//                fs.writeFile('sessions.json', JSON.stringify(parseJson), function(err) {
//                    if (err) {
//                        deferred.reject("Error writing to sessions.json");
//                    } else {
//                        deferred.resolve(parseJson[messageFrom]);
//                    }
//                });
//            } else {
//                deferred.resolve(parseJson[messageFrom]);
//            }
//        }
//    });
//
//    return deferred.promise;
//}

// promise
function getSessionIdAndContext(messageFrom) {
    var deferred = q.defer();

    fs.readFile('sessions.json', function(err, content) {
        if (err) {
            console.log("getSessionIdAndContext: Error reading sessions.json");
        } else {
            var parseJson = JSON.parse(content);

            // the entry exists - return session id and context
            if (parseJson[messageFrom]) {
                var sessionIdAndContext;

                // have seen number before - new session
                if (parseJson[messageFrom].sessionId == "") {
                    var sessionId = new Date().toISOString();
                    parseJson[messageFrom] = {"sessionId": sessionId, "context": "initialMessage"};
                    sessionIdAndContext = {"sessionId": sessionId, "context": "initialMessage"};
                } else {
                    // current session
                    sessionIdAndContext = {"sessionId": parseJson[messageFrom].sessionId, "context": parseJson[messageFrom].context};

                }

                deferred.resolve(sessionIdAndContext);
            }
            // brand new session - add the entry to sessions.json
            else {
                console.log("getSessionId: Entry does not exist.");

                var sessionId = new Date().toISOString();
                parseJson[messageFrom] = {"sessionId": sessionId, "context": "initialMessage"};
                fs.writeFile('sessions.json', JSON.stringify(parseJson), function(err) {
                    if (err) {
                        deferred.reject("Error writing to sessions.json");
                    }

                    var sessionIdAndContext = {"sessionId": sessionId, "context": "initialMessage"};
                    deferred.resolve(sessionIdAndContext);
                });
            }
        }
    });

    return deferred.promise;
}