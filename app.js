const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const morgan = require('morgan');
const queryString = require('query-string');
const redis = require('redis');
const url = require('url');
const { promisify } = require('util');

if (process.env.NODE_ENV !== 'production')
    require('dotenv').config();

const PORT = process.env.PORT || 7788;
const { CLIENT_ID, CLIENT_SECRET, SCOPE } = process.env;

const { redisClient, redisGetAsync } = (() => {
    const redisURL = url.parse(process.env.REDIS_URL);

    const redisClient = redis.createClient(redisURL.port, redisURL.hostname, { no_ready_check: true });
    redisClient.auth(redisURL.auth.split(":")[1]);

    const redisGetAsync = promisify(redisClient.get).bind(redisClient);
    return {
        redisClient,
        redisGetAsync
    };
})();

const { defaultCatch, callAPI, getTokenCode, getTokenRefresh } = require('./spotify-api')(CLIENT_ID, CLIENT_SECRET);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use(express.static(__dirname + '/public'))

app.use(function (req, res, next) {
    const allowed = ['http://localhost:4200', 'https://abnerfs-spotify-ui.herokuapp.com', 'https://spotify.abnerfs.dev'];
    if (allowed.includes(req.headers.origin))
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Authorization');
    next();
});

app.use(function (err, req, res, next) {
    if (err) {
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


const dataQueue = [];

const getDataQueue = (key, expireTime, doFunc) => {
    const findQueue = dataQueue.find(x => x.key === key);
    if (findQueue) {
        return findQueue.func;
    }

    return redisGetAsync(key)
        .then((retorno) => {
            if (!retorno)
                throw new Error();

            return JSON.parse(retorno);
        })
        .catch(() => {
            //after doFunc and add to queue
            const addFunc = {
                key,
                func: doFunc()
            };

            dataQueue.push(addFunc);

            return addFunc
                .func
                .then((data) => {
                    redisClient.set(key, JSON.stringify(data), 'EX', expireTime);;
                    return data;
                })
                .finally(() => {
                    let indexRemove = dataQueue.findIndex(x => x.key === key);
                    if (indexRemove > -1)
                        dataQueue.splice(indexRemove, 1);
                });
        })

}

const STEP_EPISODES = 50;


const getEpisodesOffset = (offset, show, auth) => {
    const page = Math.ceil(offset / STEP_EPISODES);
    const key = `show:${show}:episodes:${page}`;

    return getDataQueue(key, page == 1 ? 300 : (60 * 60 * 24), () => {
        return callAPI('/shows/' + show + '/episodes', auth, {
            query: {
                limit: STEP_EPISODES,
                offset: page * STEP_EPISODES
            }
        })
            .then(ret => ret.items)
    })
}



app.get('/shows/:show/total', async (req, res) => {
    const show = req.params.show;
    const auth = req.headers.authorization;

    getDataQueue(`${show}:total`, 300, () => {
        return getEveryEpisode(show, auth)
            .then((episodes) => {
                const total = {
                    count: episodes.length,
                    total_ms: episodes
                        .map(x => x.duration_ms)
                        .reduce((a, b) => a + b)
                };
                res.json(total);
            })
    })
    .catch(err => {
        defaultCatch(res, err);
    })
});


const getEveryEpisode = async (show, auth) => {
    let offset = 0;
    let episodes = [];
    let episodesOffset = [];

    do {
        episodesOffset = await getEpisodesOffset(offset, show, auth)
        episodes = episodes.concat(episodesOffset);
        offset += STEP_EPISODES;
    }
    while (episodesOffset.length == STEP_EPISODES)
    return episodes;
}


app.get('/shows/:show/episodes', async (req, res) => {
    const show = req.params.show;
    const auth = req.headers.authorization;
    let { search, offset } = req.query;

    let promiseEpisodes = undefined;
    if (search) {
        search = search.toUpperCase();
        promiseEpisodes = getEveryEpisode(show, auth)
            .then(episodes => episodes.filter(ep => {
                const name = ep.name.toUpperCase();
                const desc = ep.description.toUpperCase()

                return name.search(search) > -1 || desc.search(search) > -1;
            }));
    }
    else {
        if (!offset)
            offset = 0;

        promiseEpisodes =
            getEpisodesOffset(offset, show, auth)
    }

    promiseEpisodes
        .then(episodes => {
            res.json(episodes);
        })
        .catch(err => {
            defaultCatch(res, err);
        });
})


app.get('/shows', (req, res) => {
    const auth = req.headers.authorization;
    const { search } = req.query;

    let callShows = undefined;

    if (!search)
        callShows = () =>
            callAPI('/me/shows', auth)
                .then(ret => ret.items.map(x => x.show));
    else
        callShows = () =>
            callAPI('/search', auth, {
                query: {
                    q: search,
                    type: 'show',
                    market: 'BR'
                }
            })
                .then(ret => ret.shows.items);


    callShows()
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
        state: returnUrl
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
