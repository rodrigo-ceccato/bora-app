import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { TabsPage } from '../../pages/tabs/tabs';
import { PeopleProvider } from '../../providers/people/people';
import { HttpClient } from '@angular/common/http';
import { AlertController, LoadingController } from 'ionic-angular';
import { LOGIN_TEXT } from '../../models/consts';

// TEST PAGE IMPORT - REMOVE THIS debug purpose
import { MapPage } from '../map/map';
import { MeetingCreatePage } from '../../pages/meeting-create/meeting-create';
import { MeetingDelayPage } from '../../pages/meeting-delay/meeting-delay';
import { MeetingInfoPage } from '../../pages/meeting-info/meeting-info';
import { MeetingListPage } from '../../pages/meeting-list/meeting-list';
import { MeetingSchedulePage } from '../../pages/meeting-schedule/meeting-schedule';
import { UserProfilePage } from '../../pages/user-profile/user-profile';
// END OF TEST IMPORT

@IonicPage()
@Component({
  selector: 'page-login',
  templateUrl: 'login.html',
})

export class LoginPage {
  public TEXT = LOGIN_TEXT;

  person = {
    login: '',
    senha: ''
  };

  status;

  constructor(public navCtrl: NavController, public navParams: NavParams,
    public peopleProv: PeopleProvider, public http: HttpClient,  
    private alertCtrl: AlertController, public loadingCtrl: LoadingController) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad LoginPage');
  }

  // login function to check user credencials and go to tabs 
  logar () {

    this.status = false;

    this.http.post('http://159.203.45.167/login', {'login': this.person.login, 'senha' : this.person.senha}).subscribe((data) => {
      console.log(data);
      
      

      if (data.hasOwnProperty('login') === true) {
        this.navCtrl.push(TabsPage);
        this.status = true;
        loading.dismiss();
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
// user sign up
  cadastrar(){
    this.peopleProv.signUp({'login': this.person.login, 'senha': this.person.senha});
    this.person.login = '';
    this.person.senha = '';
  }

  // DEBUG CODE, REMOVE THIS
  openPageTabs(){
    this.navCtrl.push(TabsPage);
  }

  // openPp(){
  //   this.peopleProv.login();
  // }
  

  openMp(){
    this.navCtrl.push(MapPage);
  }

  openSP(){
    this.navCtrl.push(MeetingSchedulePage);
  }

  openDP(){
    this.navCtrl.push(MeetingDelayPage);
  }

  openIP(){
    this.navCtrl.push(MeetingInfoPage);
  }
  //END OF REMOVAL AREA
}
