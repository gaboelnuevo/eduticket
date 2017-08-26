const express = require('express')
const app = express()

app.get('/', function (req, res) {
  res.send('Hello World!')
})

var PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log('Example app listening on port 3000!')
})