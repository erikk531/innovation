var fs = require('fs');
var _ = require('lodash');
var q = require('q');
var wordsToNum = require('words-to-num');
var config = require('./config');
var Wit = require('node-wit').Wit;
var witClient = new Wit({accessToken: config.witAuthToken});

var isMissingValues = false;

module.exports.generateBotResponse = function(incomingMessage, messageFrom) {
    var deferred = q.defer();

    // get the session id based on the phone number that is texting bot
    getSessionInfo(messageFrom).then(function(sessionInfo) {
        var sessionId = sessionInfo.sessionId;
        var context = sessionInfo.context;
        var missingInfo = sessionInfo.missingInfo;
        var orderInfo = sessionInfo.orderInfo;

        witClient.message(incomingMessage).then((data) => {
            var messageDetails = JSON.stringify(data);
            var jsonMessageDetails = JSON.parse(messageDetails);
            var entities = jsonMessageDetails.entities;

            console.log(jsonMessageDetails);

            // no order entities found
            if (_.isEmpty(entities)) {
                deferred.resolve("That doesn't appear to be on our menu.");
            } else {
                if (context == "lookingForOrder") {
                    checkOrderInfo(entities, messageFrom, missingInfo, orderInfo).then(function(whatTheOrderIsMissing) {
                        deferred.resolve(whatTheOrderIsMissing);
                    }, function(nothingMissing) {
                        setContext("orderObtained", messageFrom).then(function(updatedContext) {
                            deferred.resolve("Thank you very much! Your order will be ready in 5 minutes. I'll let you know when it is ready.");
                        }, function(error) {
                            console.log(error);
                        });
                    });
                } else if (context == "orderObtained") {
                    deferred.resolve("Your order will be over shortly.");
                }
            }
        }).catch(console.error);
    }, function(error) {
        console.log(error);
    });

    return deferred.promise;
}

// promise
function checkOrderInfo(entities, messageFrom, missingInfo, orderInfo) {
    var deferred = q.defer();
    var isMissingValues = false;

    if (_.isEmpty(missingInfo) && _.isEmpty(orderInfo)) {
        console.log("Must be first text with order information");
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
            setOrderInfo(theOrder, messageFrom).then(function(orderInfo) {
                // iterate the drinks being ordered - take note of which values are missing for each drink
                _.forEach(drinkTypes, function(drinkType) {
                    console.log("iterate");
                    if (theOrder.menuItems[drinkType].size == "" || theOrder.menuItems[drinkType].quantity == "") {
                        console.log("it is true");
                        isMissingValues = true;
                        missingValues[drinkType] = theOrder.menuItems[drinkType];
                    }
                });

                if (isMissingValues == true) {
                    // set missing values
                    // generate response
                    console.log("values are missing");

                    setMissingInfo(missingValues, messageFrom).then(function(missingInfo) {

                        var resp = generateMissingInfoResponse(missingValues);
                        deferred.resolve(resp);

                    }, function(error) {
                        console.log("Error setting missing info");
                    });
                } else {
                    console.log("nothing is missing");
                    deferred.reject("Nothing is missing.");
                }
            }, function(error) {
                console.log("error setting order info");
            });

        }
    } else if (!_.isEmpty(missingInfo) && !_.isEmpty(orderInfo)) {
        // the user did not provide enough information and we need to reconcile the fields that are missing with the
        // info that the user re-provides

        var drinkTypes = getWitEntityValues(entities.drink_type);

        // get each drink with a missing value
        _.forIn(missingInfo, function(values, missingDrink) {
            // if new input includes this drink
            if (entities[missingDrink] != null) {
                // update missingInfo and orderInfo
                // if all missingInfo filled in - set isMissingInfo to false
                var updatedValues = entities[missingDrink];
                for (var i = 0; i < updatedValues.length; i++) {
                    // i.e. small, 3, large, etc..
                    var updatedValue = updatedValues[i].value;
                    if (typeof updatedValue == 'number') {
                        missingInfo[missingDrink].quantity = updatedValue;
                        orderInfo.menuItems[missingDrink].quantity = updatedValue;
                    } else {
                        missingInfo[missingDrink].size = updatedValue;
                        orderInfo.menuItems[missingDrink].size = updatedValue;
                    }
                }

            }
        });

        var isMissingInfo = false;
        _.forIn(missingInfo, function(values, missingDrink) {
            if (values.size == "" || values.quantity == "") {
                isMissingInfo = true;
            }
        });

        setMissingInfo(missingInfo, messageFrom).then(function(missingInfo) {
            setOrderInfo(orderInfo, messageFrom).then(function(orderInfo) {
                if (isMissingInfo) {
                    var resp = generateMissingInfoResponse(missingInfo);
                    deferred.resolve(resp);
                } else {
                    deferred.reject("Nothing is missing.");
                }
            }, function(error) {
                console.log(error);
            });
        }, function(error) {
            console.log(error);
        });




    }

    return deferred.promise;

}

function generateMissingInfoResponse(missingValues) {
    var askForWhatIsMissing = "Looks like I need a little bit more info from you to complete your order."

    _.forIn(missingValues, function(values, drink) {
        // update drink if iced_coffee
        if (drink == "iced_coffee") {
            drink = "iced coffee";
        }

        // no size or quantity specified
        if (values.size == "" && values.quantity == "") {
            askForWhatIsMissing = askForWhatIsMissing.concat(" What size (small, medium, or large) and how many "+drink+"'s did you want?");
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
function getContextForNumber(messageFrom) {
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

function setMissingInfo(missingInfo, messageFrom) {
    var deferred = q.defer();
    fs.readFile('sessions.json', function(err, content) {
        if (err) {
            console.log("setContext: Error reading sessions.json");
        } else {
            var parseJson = JSON.parse(content);

            // the entry exists - set updated context
            if (parseJson[messageFrom]) {
                console.log("setMissingInfo: "+parseJson[messageFrom]);
                parseJson[messageFrom].missingInfo = missingInfo;
                fs.writeFile('sessions.json', JSON.stringify(parseJson), function(err) {
                    if (err) {
                        deferred.reject("Error writing to sessions.json");
                    } else {
                        deferred.resolve(missingInfo);
                    }
                });
            } else {
                deferred.reject("setContext: Entry does not exist");
            }
        }
    });

    return deferred.promise;
}

function setOrderInfo(orderInfo, messageFrom) {
    var deferred = q.defer();
    fs.readFile('sessions.json', function(err, content) {
        if (err) {
            console.log("setContext: Error reading sessions.json");
        } else {
            var parseJson = JSON.parse(content);

            // the entry exists - set updated context
            if (parseJson[messageFrom]) {
                parseJson[messageFrom].orderInfo = orderInfo;
                fs.writeFile('sessions.json', JSON.stringify(parseJson), function(err) {
                    if (err) {
                        deferred.reject("Error writing to sessions.json");
                    } else {
                        deferred.resolve(orderInfo);
                    }
                });
            } else {
                deferred.reject("setContext: Entry does not exist");
            }
        }
    });

    return deferred.promise;
}


// promise
function getSessionInfo(messageFrom) {
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
                    parseJson[messageFrom] = {"sessionId": sessionId, "context": "lookingForOrder", "missingInfo": {}, "orderInfo": {}};
                    sessionIdAndContext = {"sessionId": sessionId, "context": "lookingForOrder", "missingInfo": {}, "orderInfo": {}};
                } else {
                    // current session
                    sessionIdAndContext = {"sessionId": parseJson[messageFrom].sessionId, "context": parseJson[messageFrom].context, "missingInfo": parseJson[messageFrom].missingInfo, "orderInfo": parseJson[messageFrom].orderInfo};

                }

                deferred.resolve(sessionIdAndContext);
            }
            // brand new session - add the entry to sessions.json
            else {
                console.log("getSessionId: Entry does not exist.");

                var sessionId = new Date().toISOString();
                parseJson[messageFrom] = {"sessionId": sessionId, "context": "lookingForOrder", "missingInfo": {}, "orderInfo": {}};
                fs.writeFile('sessions.json', JSON.stringify(parseJson), function(err) {
                    if (err) {
                        deferred.reject("Error writing to sessions.json");
                    }

                    var sessionIdAndContext = {"sessionId": sessionId, "context": "lookingForOrder", "missingInfo": {}, "orderInfo": {}};
                    deferred.resolve(sessionIdAndContext);
                });
            }
        }
    });

    return deferred.promise;
}