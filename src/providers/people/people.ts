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
  
  login(loginData){
    
    // this.http.post(API_ENDPOINT +'/login', loginData).subscribe((data) => {
    //   console.log(data);
    // });


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
      loading.dismiss();
      alert.present();
    }, 5000);
  }

}
