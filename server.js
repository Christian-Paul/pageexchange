var express = require('express');
var app = express();
var path = require('path');
var mongoose = require('mongoose');
var Twitter = require('node-twitter-api');
var bodyParser = require('body-parser');
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var https = require('https');
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
		sessionSecret: process.env.sessionSecret,
		googleBooksApiKey: process.env.googleBooksApiKey
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

// database setup
mongoose.connect('mongodb://' + config.mongooseUsername + ':' + config.mongoosePassword + '@ds029456.mlab.com:29456/pageexchange');
var Schema = mongoose.Schema;

var bookSchema = new Schema({
	title: String,
	imageUrl: String,
	owner: String,
	tradeInfo: {
		sender: { type: String, default: 'none'},
		status: { type: String, default: 'none' }
	}
});

var userSchema = new Schema({
	screen_name: String,
	details: {
		name: {
			first: { type: String, default: 'none' },
			last: { type: String, default: 'none' }
		},
		city: { type: String, default: 'none' },
		state: { type: String, default: 'none' }
	}
});

var User = mongoose.model('User', userSchema);

var Book = mongoose.model('Book', bookSchema);


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
                			// if login is successful
                			// if user already exists, do nothing
                			// if user doesn't exist, add new user doc
                			User.update( { screen_name: user.screen_name }, {$setOnInsert: { screen_name: user.screen_name } }, {upsert: true, setDefaultsOnInsert: true}, function(err) {
                				if(err) {
                					console.log(err);
                				} else {
                					res.redirect('/');
                				}
                			})
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

	Book.find( {} , function(err, books){
		if(err) {
			console.log(err);
		} else {
			res.render('books.ejs', { userInfo: req.session.userInfo, books: books });
		}
	});

});

// shows users their own books and lets them add new books
app.get('/new-book', function(req, res) {
	// query database for books the user owns

	Book.find( { owner: req.session.userInfo['screen_name'] }, function(err, books) {
		if(err) {
			console.log(err);
		} else {
			console.log(books);
			res.render('newbook.ejs', { userInfo: req.session.userInfo, books: books });
		}
	});
});

// add new book to the database
app.post('/new-book', function(req, res) {
	var idResponse;
	var title = req.body.title;

	// send request to google books api to obtain google book id using title
	https.get('https://www.googleapis.com/books/v1/volumes?q=' + title + '&key=' + config.googleBooksApiKey, function(response) {
		response.setEncoding('utf8');
		response.on('data', function(chunk) {
			if(idResponse) {
				// if there is already data, concat new data
				idResponse += chunk;
			} else {
				// if there isn't any data, set first data
				idResponse = chunk;
			}
		});

		response.on('end', function() {
			var responseObj = JSON.parse(idResponse);
			var id = responseObj.items[0].id;

			// send request to google books api to obtain book data using google book id
			https.get('https://www.googleapis.com/books/v1/volumes/' + id + '?key=' + config.googleBooksApiKey, function(response) {
				var metaResponse;

				response.setEncoding('utf8');
				response.on('data', function(chunk) {
					if(metaResponse) {
						// if there is already data, concat new data
						metaResponse += chunk;
					} else {
						// if there isn't any data, set first data
						metaResponse = chunk;
					}
				});

				response.on('end', function() {
					var metaResponseObj = JSON.parse(metaResponse);
					var title = metaResponseObj.volumeInfo.title;
					var imageUrl = metaResponseObj.volumeInfo.imageLinks.thumbnail;
					var owner = req.session.userInfo['screen_name'];

					// create new book document using book data
					Book.create({ title: title, imageUrl: imageUrl, owner: owner }, function(err) {
						if(err) {
							console.log(err);
						} else {
							// send user back to new book page
							res.redirect('new-book');
						}
					});

				});

			}).on('error', function(err) {
				console.log(err);
			});

		});
	}).on('error', function(err) {
		console.log(err);
	});
});

// request a trade
app.get('/request-trade/:tagId', function(req, res) {

	var updateObj = {
		status: 'pending',
		sender: req.session.userInfo.screen_name
	};

	Book.findByIdAndUpdate( req.params.tagId, { $set: { tradeInfo: updateObj } }, function(err){
		if(err) {
			console.log(err);
		} else {
			res.redirect('/');
		}
	})
});

// shows all of a user's trades
app.get('/my-trades', function(req, res) {

});

// displays user information and allows them to change it
app.get('/user-info', function(req, res) {
	User.findOne( { screen_name: req.session.userInfo.screen_name }, function(err, user) {
		if(err) {
			console.log(err);
		} else {
			res.render('settings.ejs', { userInfo: req.session.userInfo, user: user });
		}
	})
});

// updates user info
app.post('/update-details', function(req, res) {

	var input = req.body;

	var updateObj = {
		name: {
			first: input['first-name'],
			last: input['last-name']
		},
		city: input['city'],
		state: input['state']
	};

	User.findOneAndUpdate( { screen_name: req.session.userInfo.screen_name }, { $set: { details: updateObj } }, function(err, user){
		if(err) {
			console.log(err);
		} else {
			res.redirect('/user-info');
		}
	});

});