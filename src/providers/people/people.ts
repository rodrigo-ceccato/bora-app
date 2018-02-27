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

  
  // sign up function to add user to the database
  signUp(loginData){
    
    // this.http.post(API_ENDPOINT +'/login', loginData).subscribe((data) => {
    //   console.log(data);
    // });

    let status = false;

    this.http.post(API_ENDPOINT + '/users', loginData).subscribe((data) => {
      console.log(data);
      if (data.hasOwnProperty('code') == true) {
        let alert = this.alertCtrl.create({
          title: 'Erro ao registrar',
          subTitle: 'Usuario ja existe',
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

    this.http.post('http://159.203.45.167/login', loginData).subscribe((data) => {
      console.log(data);
      loading.dismiss();
      
      
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
      
      loading.dismiss();
      alert.present();
      
    }, 5000);
  }

}
