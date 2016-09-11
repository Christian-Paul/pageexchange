var express = require('express');
var app = express();
var path = require('path');
var mongoose = require('mongoose');
var Twitter = require('node-twitter-api');
var bodyParser = require('body-parser');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
require('express-helpers')(app);
app.enable('trust proxy');
var port = process.env.PORT || 3000;

// get credentials from config file in dev, or from heroku env in deployment
if(port === 3000) {
	var config = require('./config.js');
} else {
	var config = {
		mongooseUsername: process.env.mongooseUsername,
		mongoosePassword: process.env.mongoosePassword,
		twitterConsumerKey: process.env.twitterConsumerKey,
		twitterConsumerSecret: process.env.twitterConsumerSecret,
		callbackUrl: process.env.callbackUrl,
		sessionSecret: process.env.sessionSecret
	};
}

app.set('view engine', 'ejs');

var sessionOptions = {
	secret: config.sessionSecret,
	saveUninitialized: true,
	resave: false,
	store: new FileStore(),
	name: 'my.connect.sid'
};

// middleware
app.use(session(sessionOptions));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({extended: true}));


// twitter oAuth setup
var twitter = new Twitter({
	consumerKey: config.twitterConsumerKey,
	consumerSecret: config.twitterConsumerSecret,
	callback: config.callbackUrl
});

var _requestSecret;

// when a user clicks 'sign in' get a request token from twitter and redirect user to sign in with token
app.get('/request-token', function(req, res) {
	twitter.getRequestToken(function(err, requestToken, requestSecret) {
		if(err) {
			res.status(500).send(err);
		} else {
			_requestSecret = requestSecret;
			res.redirect('https://api.twitter.com/oauth/authenticate?oauth_token=' + requestToken);
		}
	});
});

// when user is sent back from twitter, use results to obtain credentials
app.get('/login/twitter/callback', function(req, res) {
	var requestToken = req.query.oauth_token;
	var verifier = req.query.oauth_verifier;

    twitter.getAccessToken(requestToken, _requestSecret, verifier, function(err, accessToken, accessSecret) {
        if (err)
            res.status(500).send(err);
        else
            twitter.verifyCredentials(accessToken, accessSecret, function(err, user) {
                if (err)
                    res.status(500).send(err);
                else {
                	req.session.userInfo = user;
                	req.session.save(function(err) {
                		if(err) {
                			console.log(err);
                		} else {
                			res.redirect('/');
                		}
                	});
                }
            });
    });
});

// sign out: destroy session and clear cookies
app.get('/sign-out', function(req, res) {
	req.session.destroy(function(err) {
		if(err) {
			console.log(err);
		} else {
			res.clearCookie(sessionOptions.name);
			res.redirect('/');
		}
	})
});

// database setup
mongoose.connect('mongodb://' + config.mongooseUsername + ':' + config.mongoosePassword + '@ds029456.mlab.com:29456/pageexchange');
var Schema = mongoose.Schema;


// begin app
app.listen(port, function(req, res) {
	console.log('listening on 3000');
});

// index page describes site and has button to take user to all books
app.get('/', function(req, res) {
	res.render('index.ejs', { userInfo: req.session.userInfo });
});


// queries database for all books and displays results
app.get('/all-books', function(req, res) {
	res.render('books.ejs', { userInfo: req.session.userInfo });
});

// page for adding new books
app.get('/new-book', function(req, res) {

});

// add new book to the database
app.post('/new-book', function(req, res) {

});

// shows all of a user's trades
app.get('/my-trades', function(req, res) {

});

// displays user information and allows them to change it
app.get('/user-info', function(req, res) {

});