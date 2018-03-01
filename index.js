const express = require('express');
const expressMongoDb = require('express-mongo-db');
const bodyParser = require('body-parser');
const cors = require('cors');
const ObjectID = require('mongodb').ObjectID;


const app = express();

app.use(expressMongoDb('mongodb://localhost/bora'));
app.use(bodyParser.json());
app.use(cors());

app.get('/users', (req, res) => {

    

    req.db.collection('users')
    .find({})
    .toArray((err, data) => {
        res.send(data);
    });
});
app.post('/search', (req, res) => {

    search = {
        login: req.body.login      
    }

    req.db.collection('users')
    .findOne(search, (err, data) => {

        res.send(data);

        
    });
});

// endpoint to log in the app
app.post('/login', (req, res) => {
    if (!req.body.login || !req.body.senha) {
        res.status(400).send({ 'error': 'Preencha todos os campos obrigatorios' });
        return;
    }

    

    let busca = {
        login: req.body.login,
        senha: req.body.senha,
    }

    req.db.collection('users')
        .findOne(busca, (err, data) => {
            if (data) {
                console.log("vtnc: ", data);
                res.send(data);
            } else {
                // TODO: use status, but this didnt work
                // res.status(400).send({});
                res.send({});
            }
        });
});

// endpoint to sign up the user
app.post('/users', (req, res) => {
    console.log("insert");

    if (!req.body.login || !req.body.senha) {
        res.status(400).send({ 'error': 'Preencha todos os campos obrigatorios' });
        return;
    }

    user = {
        login: req.body.login,
        senha: req.body.senha,
        amigos: []
    }



    req.db.collection('users')
    .insert(user, (err, data) => {
        if (!err) {
            res.send(data);
        } else {
            res.send(err);
        }
    });


});

app.post('/addFriend', (req, res) => {

    busca = {
        login: (req.body.login)
    }
    newFriend = req.body.newFriend;


    req.db.collection('users')
    .findOne(busca, (err, data) => {

        let index = data.amigos.indexOf(newFriend);
        if (index === -1) {
            data.amigos.push(newFriend);
            req.db.collection('users')
            .update(busca, data,  (err, data) => {

        });
        }
        
        res.send(data);
    });


});

app.post('/events', (req, res) => {
    console.log("event inserted");
    console.log(req.body);
    if (!req.body.name || !req.body.location || !req.body.timeStart || !req.body.peopleInvited) {
        res.status(400).send({ 'error': 'Preencha todos os campos obrigatorios' });
        return;
    }

    event = {
        creator: req.body.creator,
        name: req.body.name,
        location: req.body.location,
        timeStart: req.body.timeStart,
        timeEnd: req.body.timeEnd,
        fixedDate: req.body.fixedDate,
        peopleInvited: req.body.peopleInvited,
        peopleConfirmed: req.body.peopleConfirmed

    }



    req.db.collection('events')
    .insert(event, (err, data) => {
        if (!err) {
            res.send(data);
        } else {
            res.send(err);
        }
    });


});

app.get('/events', (req, res) => {

    req.db.collection('events')
    .find({})
    .toArray((err, data) => {
        res.send(data);
    });
});

app.post('/searchMeetingsInvited', (req, res) => {
    
    console.log("searching meetings invited...");

    if (!req.body.login) {
        res.status(400).send({ 'error': 'Preencha todos os campos obrigatorios' });
        return;
    }
    login = req.body.login
    



    req.db.collection('events')
    .find( {"peopleInvited": login}).toArray((err, data) => {
        if (!err) {
            res.send(data);
            console.log(data)
        } else {
            res.send(err);
        }
    });


});

app.post('/searchMeetingsCreated', (req, res) => {
    
    console.log("searching meetings created...");

    login = req.body.login;

    if (!req.body.login) {
        res.status(400).send({ 'error': 'Preencha todos os campos obrigatorios' });
        return;
    }

    req.db.collection('events')
    .find( {"creator": login}).toArray((err, data) => {
        if (!err) {
            res.send(data);
            console.log(data)
        } else {
            res.send(err);
        }
    });


});

app.post('/inviteFriends', (req, res) => {

    console.log('inviting friends...');
    console.log('veio esta merda: ' , req.body)
    invitedUsers = req.body.array;
    busca = {
        name: req.body.eventName
    }

    req.db.collection('events').findOne(busca, (err, data) => {
        if (!err) {
            res.send(data);
            console.log(data);
            console.log(data.peopleInvited);
            data.peopleInvited = data.peopleInvited.concat(invitedUsers);
            req.db.collection('events')
            .update(busca, data,  (err, data) => {

            });
        } else {
            res.send(err);
        }
    });
});

app.post('/removeEvent', (req, res) => {

    console.log(req.body);
    busca = {
        name: req.body.name
    }

    req.db.collection('events').remove(busca, (err, data) => {
        res.send(data);
    });

});


app.listen(3000, () => {
    console.log('Servidor digital ocean rodando na 3000');
});

