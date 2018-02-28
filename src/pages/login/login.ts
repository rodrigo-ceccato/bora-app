import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { TabsPage } from '../../pages/tabs/tabs';
import { PeopleProvider } from '../../providers/people/people';
import { HttpClient } from '@angular/common/http';
import { AlertController, LoadingController } from 'ionic-angular';
import { LOGIN_TEXT } from '../../models/consts';
import { Events } from 'ionic-angular';

// TEST PAGE IMPORT - REMOVE THIS debug purpose
import { MapPage } from '../map/map';
import { MeetingCreatePage } from '../../pages/meeting-create/meeting-create';
import { MeetingDelayPage } from '../../pages/meeting-delay/meeting-delay';
import { MeetingInfoPage } from '../../pages/meeting-info/meeting-info';
import { MeetingListPage } from '../../pages/meeting-list/meeting-list';
import { MeetingSchedulePage } from '../../pages/meeting-schedule/meeting-schedule';
import { UserProfilePage } from '../../pages/user-profile/user-profile';
import { SlidesHomePage } from '../slides-home/slides-home';
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
    senha: '',
  };

  status;

  constructor(public navCtrl: NavController, public navParams: NavParams,
    public peopleProv: PeopleProvider, public http: HttpClient,  
    public loadingCtrl: LoadingController, public events: Events) {

      events.subscribe('formigueiro de rua', (user) => {
        
        console.log('Welcome', user.login);
        this.navCtrl.push(TabsPage);

      });

  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad LoginPage');
  }

  // login function to check user credencials and go to tabs 
  logar () {

    this.peopleProv.login(this.person);

<<<<<<< HEAD
    this.http.post('http://159.203.45.167/login', {'login': this.person.login, 'senha' : this.person.senha}).subscribe((data) => {
      console.log(data);
      
      

      if (data.hasOwnProperty('login') === true) {
        this.navCtrl.push(SlidesHomePage);
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
    
=======
>>>>>>> f2faae612d0a646c63bef4d8efab1f1edeabbb36
  }
// user sign up
  cadastrar(){
    
    this.person = {
      login: this.person.login,
      senha: this.person.senha,
      }
    
    this.peopleProv.signUp(this.person);
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
    this.navCtrl.push(SlidesHomePage);
  }
  openMe(){
    this.navCtrl.push(UserProfilePage);
  }
  //END OF REMOVAL AREA
}
