const fetch = require('node-fetch');
const API_BASE_URL = "https://api.spotify.com/v1";
const queryString = require('query-string');


const base64 = text => Buffer.from(text).toString('base64');

const spotifyApi = (CLIENT_ID, CLIENT_SECRET) => {


    const getTokenCode = ({ code, redirect_uri }) => {
        const body = {
            grant_type: 'authorization_code',
            code,
            redirect_uri
        };


        return getTokenAPI(body);
    }

    const getTokenRefresh = ({ refresh_token }) => {
        const body = {
            grant_type: 'refresh_token',
            refresh_token
        }

        return getTokenAPI(body);
    }


    const getTokenAPI = ((body) => {
        return fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + base64(`${CLIENT_ID}:${CLIENT_SECRET}`)
            },
            body: queryString.stringify(body)
        })
            .then(res => res.json())
            .then(checkErrorResponse)
            .then(auth => {
                const now = new Date();
                let expire_date = new Date();
                expire_date.setSeconds(expire_date.getSeconds() + auth.expires_in - 20);

                auth.issued_date = now;
                auth.expire_date = expire_date;
                return auth;
            })
            .then(auth => {
                return fetch(API_BASE_URL + '/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + auth.access_token
                    }
                })
                .then(res => res.json())
                .then(checkErrorResponse)
                .then(user => {
                    auth.user = user;
                    return auth;
                })
            })
    })

   

    const checkErrorResponse = res => {
        if(res.error) {
            if(!res.error.message)
                throw new Error("Unexpected error");

            var error = new Error(res.error.message);
            error.status = res.error.status;
            throw error;
        }
        return res;
    };

    const callAPI = async (path, authHeader, options) => {
        if (API_BASE_URL.endsWith('/'))
            throw new Error('API_BASE_URL should not end with /');

        if (!path || !path.startsWith('/'))
            throw new Error("Path should start with /");

        if (!authHeader)
            throw new Error("Authentication required");

        let { method, body, query } = options || { method: 'GET' };
        if (!method)
            method = 'GET';

        function doRequest() {
            const queryParams = query && method === 'GET' ? '?' + queryString.stringify(query) : '';
            const bodyParsed = 
                method == 'POST' ?
                (typeof (body) !== 'string' ? queryString.stringify(body) : body)
                : undefined;

            return fetch(API_BASE_URL + path + queryParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': authHeader
                },
                body: bodyParsed
            })
                .then(res => res.json())
                .then(checkErrorResponse);
        }

        return doRequest();
    }

    const defaultCatch = (res, err) => {
        if(err.status) {
            res.status(err.status)
                .json({
                    error: {
                        message: err.message,
                        status: err.status
                    }
                })
        }
        else
            res.status(400)
                .json({
                    error: err.message,
                    status: 400
                })
    }

    return  {
        callAPI,
        getTokenCode,
        defaultCatch,
        getTokenRefresh
    };
}

module.exports = spotifyApi;