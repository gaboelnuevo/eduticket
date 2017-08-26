const express = require('express')
const app = express()

var bodyParser = require('body-parser')

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

    // Construct a transaction payload
    const tx = driver.Transaction.makeCreateTransaction(
        // Define the asset to store, in this example it is the current temperature
        // (in Celsius) for the city of Berlin.
        { email: email, datetime: new Date().toString() },

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
    .then(retrievedTx => res.json({ticket: ticket, transaction: retrievedTx}))
})



var PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log('Example app listening on port 3000!')
})