const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const morgan = require('morgan');
const queryString = require('query-string');
require('dotenv').config();

const PORT = 7788;
const { CLIENT_ID, CLIENT_SECRET, SCOPE } = process.env;
const fetch = require('node-fetch');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));
app.use(morgan('dev'));

app.use(express.static(__dirname + '/public'))

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
    next();
});


app.get('/shows/:show/episodes', async (req, res) => {
    const show = req.params.show;
    const authHeader = req.headers.authorization;
    let { search, offset } = req.query;

    if(search)
        search = search.toUpperCase();

    if(!offset || search)
        offset = 0;

    let episodes = [];
    let failed = false;

    let episodesOffset = [];

    do {
        episodesOffset = await fetch(`https://api.spotify.com/v1/shows/${show}/episodes?limit=50&offset=${offset}`, {
            method: 'GET',
            headers:{
                Authorization: authHeader,
            }
        })
        .then(ret => ret.json())
        .then(ret => ret.items)
        .catch(err => {
            res.status(400)
                .json({
                    err: err.message
                })
            failed = true;
        });

        if(failed)
            break;

        episodes = episodes.concat(episodesOffset);

        if(!search)
            break;

        offset += 50;
    }
    while(episodesOffset.length == 50)

    if(search) {
        episodes = episodes.filter(ep => {
            const name = ep.name.toUpperCase();
            const desc = ep.description.toUpperCase()

            return name.search(search) > -1 || desc.search(search) > -1;
        })
    }

    if(!failed)
        res.json(episodes);
})


app.get('/shows', (req, res) => {
    const authHeader = req.headers.authorization;
    const { search } = req.query;

    if(!search)
        return res.json([]);

    fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(search)}&type=show&market=BR`, {
        method: 'GET',
        headers:{
            Authorization: authHeader,
        }
    })
    .then(ret => ret.json())
    .then(ret => {
        if(ret.error)
            throw new Error(ret.error.message);
            
        return ret;
    })
    .then(ret => ret.shows.items)
    .then(ret => res.json(ret))
    .catch(err => {
        res.status(400)
            .json({
                err: err.message
            })
    })
})


app.get('/login', (req, res) => {
    const { redirect_uri } = req.query;

    const queryParams = {
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri
    };

    res.redirect('https://accounts.spotify.com/authorize?' + queryString.stringify(queryParams));
});

const base64 = text => Buffer.from(text).toString('base64');


app.post('/token', (req, res) => {
    const { redirect_uri, code } = req.body;

    const body = {
        grant_type: 'authorization_code',
        code,
        redirect_uri,
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
    .then(ret => {
        if(ret.error)
            throw new Error(ret.error.message);
            
        return ret;
    })
    .then((x) => {
        x.expire_date = new Date();
        x.expire_date.setSeconds(x.expire_date.getSeconds() + x.expires_in);
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
