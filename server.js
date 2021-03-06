// Setup

var  HOSTED_ON_JOYENT = /\/home\/node\/node\-service\/releases\/[^\/]*\/server.js/.test(__filename)
		,WEBSERVER_PORT   = HOSTED_ON_JOYENT ? 80 : 8080

/**
 * Module dependencies.
 */
var NKO_KEY = HOSTED_ON_JOYENT ? '/home/node/nko' : './setup/nko';
var nko_setup = require(NKO_KEY).setup;
var express = require('express')
		, faye = require('faye')
		, nko = require('nko')(nko_setup.secret)
		, string = require('./lib/string').String
		, PhotoCollection = require('./lib/photo_collection').PhotoCollection
		, QuestUtils = require('./lib/quest_utils').QuestUtils
		, ColourSchemes = require('./lib/colour_schemes').ColourSchemes;

var pubsub = new faye.NodeAdapter({mount: QuestUtils.getFayeURI(), timeout: 15})
var host = "staff.mongohq.com"
	, port = 10034 
	, database = "nodeko2011"
	, username = "dqo"
	, password = "nodeko2011";
var photo_collection = new PhotoCollection(host, port, database, username, password);


var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Express'
  });
});

// Pictures routes
app.get('/pictures', function(req, res){
	var message = 'All pictures ({count})';
	photo_collection.all(function(error, results) {
		if(error) console.log(error);
		else {
			console.log("Results for tag '%s': %d", req.params.tag, results.length);
			if (req.header('Accept').indexOf('application/json') != -1) {
				// res.writeHead(200, {'Content-Type': 'application/json'})
				// 				var output = JSON.stringfy({'pictures':results})
				// 				if (req.query.callback) output = req.query.callback + '('+output+')';//JSONP
				// 		    res.end(output);
				res.header('Content-Type', 'application/json')
				var json = '[';
				for(var i = 0; i < results.length; i++) {
					json += "{ title: '"+results[i].title+"',"
					json += "id: '"+results[i].id+"',"
					json += "secret: '"+results[i].secret+"',"
					json += "server: '"+results[i].server+"',"
					json += "farm: "+results[i].farm+","
					json += "owner: '"+results[i].owner+"',"
					json += "ownername: '"+results[i].ownername+"',"
					json += "license: '"+results[i].license+"',"
					json += "tags: [ 'sunset', 'girl', 'field', 'august', 'cristinaviscu' ],"
					json += "date_upload: '"+results[i].date_upload+"',"
					json += "date_taken: '"+results[i].date_taken+"',"
					json += "url: '"+results[i].url+"',"
					json += "_id: "+results[i]._id+" }"
					if(i != results.length - 1) json += ", "
				}
				json += ']'
				res.json(json);
				res.end();
			} else {
				res.render('pictures', {
					title: message.interpolate({count:results.length})
					, pictures : results
				});
				
			}
		}
	});
});

app.get('/pictures/:tag', function(req, res){
	var message = 'Pictures tagged as {tag} ({count})';
	photo_collection.withTag(req.params.tag, function(error, results) {
		if(error) console.log(error);
		else {
			console.log("Results for tag '%s': %d", req.params.tag, results.length);
			if (req.header('Accept').indexOf('application/json') != -1) {
				res.header('Content-Type', 'application/json')
				var json = '[';
				for(var i = 0; i < results.length; i++) {
					json += "{ title: '"+results[i].title+"',"
					json += "id: '"+results[i].id+"',"
					json += "secret: '"+results[i].secret+"',"
					json += "server: '"+results[i].server+"',"
					json += "farm: "+results[i].farm+","
					json += "owner: '"+results[i].owner+"',"
					json += "ownername: '"+results[i].ownername+"',"
					json += "license: '"+results[i].license+"',"
					json += "tags: [ 'sunset', 'girl', 'field', 'august', 'cristinaviscu' ],"
					json += "date_upload: '"+results[i].date_upload+"',"
					json += "date_taken: '"+results[i].date_taken+"',"
					json += "url: '"+results[i].url+"',"
					json += "_id: "+results[i]._id+" }"
					if(i != results.length - 1) json += ", "
				}
				json += ']'
				res.json(json);
				res.end();
			} else {
				res.render('pictures', {
					title: message.interpolate({tag:req.params.tag, count:results.length})
					, pictures : results
				});
			}
		}
	});
});

app.post('/pictures/classify', function(req, res){
	console.log(req.body.id);
	console.log(req.body.tag);
	photo_collection.findByID(req.body.id, function(error, photo){
		if(error) {
			console.log(error);
		} else {
			photo_collection.classify(photo, req.body.tag, function(error, photo){
				if(error) {
					console.log(error);
				} else {
					console.log("CLASSIFIED");
					if (req.header('Accept').indexOf('application/json') != -1) {
						res.writeHead(200, {'Content-Type': 'application/json'})
						var output = JSON.stringfy({'result':'OK'})
						if (req.query.callback) output = req.query.callback + '('+output+')';//JSONP
				    res.end(output);
					} else {
						res.render('picture_classified', {
							title: "Picture successfully classified as "+req.body.tag
						});
					}
				}
			});
		}
	});
});
var quests = {};
// Quest routes
app.get('/quests/new', function(req, res){
	res.render('new_quest', {
		title: "Create your quest!"
		, colour_schemes: ColourSchemes
	});
});

app.post('/quests/create', function(req, res){
	var baseURL = QuestUtils.baseUrl(req);
  var blurb = QuestUtils.generateBlurb();
	var pubsubURL = QuestUtils.getPubSubServerURL(req);
	var questURL = QuestUtils.getQuestURL(req)+blurb;
	var jsFile = pubsubURL+".js"
	var tags = req.body.tags.split(",")
	var buckets = req.body.buckets.split(",")
	var colour_scheme = req.body.colour_scheme.split(",")
	var quest = {questURL: questURL
							,pubsubJSFile: jsFile
							,questName: blurb
							,pubsubURL: pubsubURL
							,tags: tags
							,buckets: buckets
							,colour_scheme: ColourSchemes.get(colour_scheme)}
	quests[blurb] = JSON.stringify(quest);
	if (req.header('Accept').indexOf('application/json') != -1) {
    res.writeHead(200, { "Content-Type": "application/json" })
    var output = JSON.stringify(quest);
		console.log(output);
    if (req.query.callback) output = req.query.callback + '('+output+')';//JSONP
    res.end(output);
	} else{
  	res.render('quest_created', {
			title: "Quest created!"
 			,quest: quest
  	});
	}
});

app.get('/quests', function(req, res){
	if (req.header('Accept').indexOf('application/json') != -1) {
		res.writeHead(200, {'Content-Type': 'application/json'})
		var output = JSON.stringfy({'quests':quests})
		if (req.query.callback) output = req.query.callback + '('+output+')';//JSONP
    res.end(output);
	} else {
		res.render('all_quests', {
			title: 'All quests'
			,quests: quests
		});	
	}
});

app.get('/quests/:id', function(req, res){
	var quest_id = req.params.id
	var quest = quests[quest_id]
	if(quest) {
		if (req.header('Accept').indexOf('application/json') != -1) {
		console.log(quest)
			res.writeHead(200, {'Content-Type': 'application/json'})
			var output = quest
			if (req.query.callback) output = req.query.callback + '('+output+')';//JSONP
	    res.end(output);
		} else {
			// res.render('quest', {
			// 				title: "You are on quest "+quest_id
			// 				,quest: JSON.parse(quest)
			// 			});
			res.redirect('/classificador/index.html?q='+quest_id);
		}	
	} else {
		res.render('error', {
			title: 'Ops, there is no such quest!'
		})
	}
});


// Binding and starting up...
pubsub.attach(app);
app.listen(WEBSERVER_PORT);
// pubsub.listen(QuestUtils.getFayePort());
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
// console.log("Faye server listening on port %d in %s mode", QuestUtils.getFayePort(), app.settings.env);
