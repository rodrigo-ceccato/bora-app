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

    user = {
        login: req.body.login,
        senha: req.body.senha
    }

    req.db.collection('users')
    .find({})
    .toArray((err, data) => {
        res.send(data);
    });
});

app.post('/login', (req, res) => {
  if (!req.body.login || !req.body.senha) {
        res.status(400).send({ 'error': 'Preencha todos os campos obrigatorios' });
        return;
    }

    let busca = {
        login: req.body.login,
        senha: req.body.senha
    }

    req.db.collection('users')
        .findOne(busca, (err, data) => {
            if (data) {
                res.send(data);
            } else {
                // TODO: use status, but this didnt work
                // res.status(400).send({});
            }
        });
});

app.post('/users', (req, res) => {
    console.log("insert");

    user = {
        login: req.body.login,
        senha: req.body.senha
    }

    req.db.collection('users')
    .insert(user, (err, data) => {
        res.send(data);
    });
});

// app.post('/update', (req, res) => {

//     busca = {
//         ne: Number(req.body.ne)
//     }
//     novoPreco = req.body.preco;


//     req.db.collection('users')
//     .findOne(busca, (err, data) => {
//         req.db.collection('users')
//         .update(busca,  {"ne": data.ne, "nome": data.nome, "endereco": data.endereco, "preco": novoPreco, "foto": data.foto, "comentarios": data.comentarios},  (err, data) => {


//         });

//         res.send(data);
//     });


// });

app.listen(3000, () => {
    console.log('Servidor rodando na 3000');
});
