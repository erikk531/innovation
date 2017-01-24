var dotenv = require('dotenv').config();
var config = {};

if (process.env.NODE_ENV == "prod") {
    config.accountSid = process.env.TWILIO_PROD_ACCOUNT_SID;
    config.authToken = process.env.TWILIO_PROD_AUTH_TOKEN;
    config.phoneNumber = process.env.TWILIO_PROD_NUMBER;
} else if (process.env.NODE_ENV == "test") {
    config.accountSid = process.env.TWILIO_TEST_ACCOUNT_SID;
    config.authToken = process.env.TWILIO_TEST_AUTH_TOKEN;
    config.phoneNumber = process.env.TWILIO_TEST_NUMBER;
}

config.c1AsstCoffeeIntro = process.env.C1_ASST_COFFEE_INTRO;
config.c1AsstFinancialIntro = process.env.C1_ASST_FINANCIAL_INTRO;
config.witAuthToken = process.env.WIT_AUTH_TOKEN;
config.witAppId = process.env.WIT_APP_ID;

module.exports = config;