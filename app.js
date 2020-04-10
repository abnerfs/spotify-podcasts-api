const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const morgan = require('morgan');
const queryString = require('query-string');

if(process.env.NODE_ENV !== 'production')
    require('dotenv').config();

const PORT = process.env.PORT || 7788;
const { CLIENT_ID, CLIENT_SECRET, SCOPE } = process.env;

const { defaultCatch, callAPI, getTokenCode, getTokenRefresh } = require('./spotify-api')(CLIENT_ID, CLIENT_SECRET);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));
app.use(morgan('dev'));

app.use(express.static(__dirname + '/public'))

app.use(function (req, res, next) {
    const allowed = ['http://localhost:4200', 'https://abnerfs-spotify-ui.herokuapp.com', 'https://abnerfs.dev'];
    if(allowed.includes(req.headers.origin))
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
    next();
});


app.use(function (err, req, res, next) {
    if(err) {
        res.status(400);
        //log later
    }
    else
        next();
});


app.get('/shows/:show', async (req, res) => {
    const show = req.params.show;
    const auth = req.headers.authorization;


    return callAPI('/shows/' + show, auth)
        .then(ret => res.json(ret))
        .catch(err => defaultCatch(res, err));

});


app.get('/shows/:show/episodes', async (req, res) => {
    const show = req.params.show;
    const auth = req.headers.authorization;


    let { search, offset } = req.query;

    if(search)
        search = search.toUpperCase();

    if(!offset || search)
        offset = 0;

    let episodes = [];
    let failed = false;

    let episodesOffset = [];

    do {
        episodesOffset = await callAPI('/shows/' + show + '/episodes', auth, {
            query: {
                limit: 50,
                offset
            }
        })
        .then(ret => ret.items)
        .catch(err => {
            defaultCatch(res, err);
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
    const auth = req.headers.authorization;
    const { search } = req.query;
    if(!search)
        return res.json([]);

    callAPI('/search', auth, {
        query: {
            q: search,
            type: 'show',
            market: 'BR'
        }
    })
    .then(ret => ret.shows.items)
    .then(ret => res.json(ret))
    .catch(err => defaultCatch(res, err));

})


app.get('/login', (req, res) => {
    const { redirect_uri, returnUrl } = req.query;

    const queryParams = {
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri,
        state : returnUrl
    };

    res.redirect('https://accounts.spotify.com/authorize?' + queryString.stringify(queryParams));
});


app.post('/refresh_token', (req, res) => {
    const { refresh_token } = req.body;

    getTokenRefresh({
       refresh_token
    })
    .then(auth => res.json(auth))
    .catch(err => defaultCatch(res, err));
});

app.post('/token', (req, res) => {
    const { redirect_uri, code } = req.body;

    getTokenCode({
        code,
        redirect_uri
    })
    .then(auth => res.json(auth))
    .catch(err => defaultCatch(res, err));
});


app.listen(PORT, () => {
    console.log('Servidor escutando na porta ' + PORT);
});
