const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const morgan = require('morgan');
const queryString = require('query-string');
require('dotenv').config();

const PORT = 7788;
const { REDIRECT_URI, CLIENT_ID, CLIENT_SECRET, SCOPE } = process.env;
const fetch = require('node-fetch');

app.use(bodyParser.json());
app.use(morgan('dev'));

app.use(express.static(__dirname + '/public'))

app.get('/login', (req, res) => {
    const queryParams = {
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri: REDIRECT_URI
    };

    res.redirect('https://accounts.spotify.com/authorize?' + queryString.stringify(queryParams));
});

const base64 = text => Buffer.from(text).toString('base64');


app.get('/callback', (req, res) => {
    const { code, state } = req.query;

    const body = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
    };

    const headers = new fetch.Headers();
    headers.append('Authorization', 'Basic ' + base64(`${CLIENT_ID}:${CLIENT_SECRET}`));
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        body: queryString.stringify(body),
        headers
    })
    .then(x => x.json())
    .then((x) => {
        res.json(x);
    })
    .catch(err => {
        res.status(500).json({
            err: err.message
        })
    })

});




app.listen(PORT, () => {
    console.log('Servidor escutando na porta ' + PORT);
});
