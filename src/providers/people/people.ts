import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Events } from 'ionic-angular';
import { AlertController, LoadingController } from 'ionic-angular';
import { API_ENDPOINT } from '../../models/consts';

@Injectable()
export class PeopleProvider {
  
  constructor(public http: HttpClient, public events: Events,  
    private alertCtrl: AlertController, public loadingCtrl: LoadingController) {
      
    console.log('Hello PeopleProvider Provider');
    
    
  }

  status;
  currentUser;
  friends;
  
  // sign up function to add user to the database
  signUp(loginData){

    let status = false;

    this.http.post(API_ENDPOINT + '/users', loginData).subscribe((data) => {
      console.log(data);
      if (data.hasOwnProperty('code') == true) {
        let alert = this.alertCtrl.create({
          title: 'Erro ao registrar',
          subTitle: 'Usuario já existe',
          buttons: ['Okay']
        });
        alert.present();
      }
      loading.dismiss();
      status = true;
      
    });


    // LOADING + ALERT SAMPLE
    let loading = this.loadingCtrl.create({
      content: 'Please wait...'
    });

    loading.present();

    let alert = this.alertCtrl.create({
      title: 'Erro ao registrar',
      subTitle: 'Erro de conexão!',
      buttons: ['Okay']
    });

    setTimeout(() => {
      if(!status){
      loading.dismiss();
      alert.present();
      }
    }, 5000);

  }

  login (loginData) {
    this.http.post(API_ENDPOINT + '/login', loginData).subscribe((data) => {
      console.log(data);
      

      if (data.hasOwnProperty('login') === true) {
        
        this.status = true;
        loading.dismiss();
        this.events.publish('formigueiro de rua', loginData);
        this.currentUser = data;
        this.friends = this.currentUser.amigos;
        
      } 
      
      
    });

    let loading = this.loadingCtrl.create({
      content: 'Please wait...'
    });

    loading.present();

    let alert = this.alertCtrl.create({
      title: 'Erro ao logar',
      subTitle: 'Login não encontrado!',
      buttons: ['Okay']
    });

    setTimeout(() => {
      if(!this.status) {
      loading.dismiss();
      alert.present();
      }
    }, 5000);
  }

  searchFriends(search) {
    this.http.post(API_ENDPOINT + '/search', search).subscribe((data) => {
      
      
      if (data) {
        
        let info = {
          login: this.currentUser.login,
          newFriend: search.login
        }

        
        this.http.post(API_ENDPOINT + '/addFriend', info).subscribe((data) => {

          //atualiza os amigos do usuario atual
          this.http.post(API_ENDPOINT + '/search', info).subscribe((data) => {
            this.currentUser = data;
            console.log(this.currentUser)
            this.friends = this.currentUser.amigos;
            console.log(this.friends)
            console.log("atualizou");
            this.events.publish('friend added', data);

          });
        });

        
      } else {
        console.log('nao achou bosta nenhuma');
      }
      

    });
  }

}
