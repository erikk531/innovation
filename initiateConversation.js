var config = require('./config');
var twilioClient = require('./twilioClient');
var conversation = process.argv[2];
var to = process.argv[3]

if (!conversation && !to) {
    console.log("Please provide a conversation argument [coffee or financial] and a phone number to text [i.e. +3016482013]");
} else if (!conversation) {
    console.log("Please provide a conversation argument [coffee or financial]");
} else if (!to) {
    console.log("Please provide a phone number to text [i.e. +3016482013]");
} else {
    if (conversation == "coffee") {
        twilioClient.sendSmsMessage(to, config.c1AsstCoffeeIntro);
    } else if (conversation == "financial") {
        twilioClient.sendSmsMessage(to, config.c1AsstFinancialIntro);
    }
}

