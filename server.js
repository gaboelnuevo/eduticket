const express = require('express')
const app = express()

var bodyParser = require('body-parser')
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect('mongodb://admin:password$1234@ds161483.mlab.com:61483/eduticket');

var Transaction = mongoose.model('Transaction', new Schema ({ email: String, date: Date, ticket: Object, asset: Object }));

const driver = require('bigchaindb-driver')
let bdb = new driver.Connection('https://test.ipdb.io/api/v1/', { 
    app_id: '12869822',
    app_key: '1b52721c24cebe5474f1af0a45c4b3f5'
})

app.use(bodyParser.json())

app.get('/', function (req, res) {
  res.send('Hello World!')
})

app.post('/buy-ticket', function (req, res){
    var email = req.body.email;
    if(!email){
        return res.status(403);
    }
    // Create a new keypair.
    const ticket = new driver.Ed25519Keypair()

    var transaction = new Transaction({ email: email, date: new Date() });
    transaction.save(function (err) {
      console.log(transaction);
      if (err) {
        console.log(err);
      } else {
        // Construct a transaction payload
        const tx = driver.Transaction.makeCreateTransaction(
            // Define the asset to store, in this example it is the current temperature
            // (in Celsius) for the city of Berlin.
            { transaction_id: 'eduticket:' + transaction._id, datetime: new Date().toString(), type: 'raffle:eduticket'},

            // Metadata contains information about the transaction itself
            // (can be `null` if not needed)
            { what: 'Ticket' },

            // A transaction needs an output
            [ driver.Transaction.makeOutput(
                    driver.Transaction.makeEd25519Condition(ticket.publicKey))
            ],
            ticket.publicKey
        )

        // Sign the transaction with private keys
        const txSigned = driver.Transaction.signTransaction(tx, ticket.privateKey)

        bdb.postTransaction(txSigned)
        .then(() => bdb.pollStatusAndFetchTransaction(txSigned.id))
        .then(retrievedTx => { 
            transaction.ticket = ticket;
            transaction.asset = retrievedTx;
            transaction.save().then(_t => { return res.json(transaction)});
        })
        }
    });
})

app.get('/tickets', function (req, res){
    bdb.searchAssets(req.query.search || 'raffle:eduticket').then((tickets) => res.json({tickets: tickets}))
})



var PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log('Example app listening on port 3000!')
})