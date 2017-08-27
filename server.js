const express = require('express')
const app = express()

var bodyParser = require('body-parser')
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var shortid = require('shortid');
var cors = require('cors');
var postmark = require('postmark');

mongoose.connect('mongodb://admin:password$1234@ds161483.mlab.com:61483/eduticket');

var Transaction = mongoose.model('Transaction', new Schema({
    fullname: String,
    email: String,
    date: Date,
    ticket: Object,
    asset: Object,
    current: Boolean,
    completed: Boolean
}));
var PayToken = mongoose.model('PayToken', new Schema({
    secret: String,
    used: Boolean
}));

const driver = require('bigchaindb-driver')
let bdb = new driver.Connection('https://test.ipdb.io/api/v1/', {
    app_id: '12869822',
    app_key: '1b52721c24cebe5474f1af0a45c4b3f5'
})

app.use(bodyParser.json())
app.use(cors())

app.get('/', function(req, res) {
    res.send('Hello World!')
})

app.post('/buy-ticket', function(req, res) {
    var email = req.body.email;
    var token = req.body.token;
    var fullname = req.body.fullname;

    var _client = new postmark.Client(process.env.POSTMARK_TOKEN);

    if (!email && !token) {
        return res.status(403);
    }

    PayToken.findOne({
            secret: token,
            used: false
        }).exec().then(_token => {
            if (!_token) {
                return res.status(403).json({
                    error: 'INVALID_TOKEN'
                });
            }

            // Create a new keypair.
            const ticket = new driver.Ed25519Keypair()

            var transaction = new Transaction({
                email: email,
                date: new Date(),
                completed: false,
                current: true
            });
            transaction.save(function(err) {
                if (err) {
                    console.log(err);
                } else {
                    // Construct a transaction payload
                    const tx = driver.Transaction.makeCreateTransaction(
                        // Define the asset to store, in this example it is the current temperature
                        // (in Celsius) for the city of Berlin.
                        {
                            transaction_id: 'eduticket:' + transaction._id,
                            datetime: new Date().toString(),
                            type: 'raffle:eduticket'
                        },

                        // Metadata contains information about the transaction itself
                        // (can be `null` if not needed)
                        {
                            what: 'Ticket'
                        },

                        // A transaction needs an output
                        [driver.Transaction.makeOutput(
                            driver.Transaction.makeEd25519Condition(ticket.publicKey))],
                        ticket.publicKey
                    )

                    // Sign the transaction with private keys
                    const txSigned = driver.Transaction.signTransaction(tx, ticket.privateKey)

                    bdb.postTransaction(txSigned)
                        .then(() => bdb.pollStatusAndFetchTransaction(txSigned.id))
                        .then(retrievedTx => {
                            transaction.ticket = ticket;
                            transaction.asset = retrievedTx;
                            transaction.completed = true;
                            _token.used = true;
                            _token.save().then(__token => {
                                transaction.save().then(_t => {
                                    try {
                                        _client.sendEmailWithTemplate({
                                                "From": "eduticket@itstimebro.com",
                                                "To": email,
                                                "TemplateId": process.env.POSTMARK_NOTIFICATION_TEMPLATEID,
                                                "TemplateModel": {
                                                    "purchase_date": "purchase_date_Value",
                                                    "name": fullname || '',
                                                    "expiration_date": "28/08/2017",
                                                    "credit_card_brand": "credit_card_brand_Value",
                                                    "credit_card_last_four": "credit_card_last_four_Value",
                                                    "billing_url": "billing_url_Value",
                                                    "receipt_id": "receipt_id_Value",
                                                    "date": "date_Value",
                                                    "receipt_details": [{
                                                        "description": "description_Value",
                                                        "amount": "amount_Value"
                                                    }],
                                                    "total": "20 Lps.",
                                                    "support_url": "support_url_Value",
                                                    "action_url": "action_url_Value"
                                                }
                                            }).then(data => {
                                                console.log(data)
                                            })
                                            .catch(err => {
                                                console.log(err);
                                            })
                                    } catch (err) {
                                        console.log(err);
                                    }
                                    res.json(transaction)
                                });
                            })
                        })
                }
            });
        })
        .catch(err => {
            console.log(err);
            res.status(403).end();
        })
})

app.get('/tickets', function(req, res) {
    bdb.searchAssets('raffle:eduticket').then((tickets) => res.json({
        tickets: tickets
    }))
})

app.post('/generate-pay-token', function(req, res) {
    var token = new PayToken({
        secret: shortid.generate(),
        used: false
    });
    token.save()
        .then(_token => res.json(_token))
        .catch(err => {
            console.log(err);
            res.status(500).end();
        })
})

app.get('/random', function(req, res) {
    var shouldSend = !!req.query.send || false
    var filter = {
        completed: true,
        current: true
    }
    Transaction.count(filter).exec(function(err, count) {
        var random = Math.floor(Math.random() * count);
        Transaction.findOne(filter).skip(random).exec(
            function(err, result) {
                // result is random 
                try {
                    if(shouldSend){
                        _client.sendEmailWithTemplate({
                            "From": "eduticket@itstimebro.com",
                            "To": result.email,
                            "TemplateId": process.env.POSTMARK_WINNER_TEMPLATEID,
                            "TemplateModel": {
                                "purchase_date": "purchase_date_Value",
                                "name": result.fullname || result.email,
                                "expiration_date": "28/08/2017",
                                "credit_card_brand": "credit_card_brand_Value",
                                "credit_card_last_four": "credit_card_last_four_Value",
                                "billing_url": "billing_url_Value",
                                "receipt_id": "receipt_id_Value",
                                "date": "date_Value",
                                "receipt_details": [{
                                    "description": "description_Value",
                                    "amount": "amount_Value"
                                }],
                                "total": "20 Lps.",
                                "support_url": "support_url_Value",
                                "action_url": "action_url_Value"
                            }
                        }).then(data => {
                            console.log(data)
                        })
                        .catch(err => {
                            console.log(err);
                        })
                    }
                } catch (err) {
                    console.log(err);
                }
                res.json(result);
            });
    });
})

app.get('/count', function(req, res) {
    var filter = {
        completed: true,
        current: true
    }
    Transaction.count(filter).exec(function(err, count) {
        res.json({
            count: count || 0
        });
    });
})


var PORT = process.env.PORT || 3000;

app.listen(PORT, function() {
    console.log('Example app listening on port 3000!')
})