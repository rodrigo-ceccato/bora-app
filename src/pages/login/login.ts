import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { TabsPage } from '../../pages/tabs/tabs';
import { PeopleProvider } from '../../providers/people/people';
import { MapPage } from '../map/map';

@IonicPage()
@Component({
  selector: 'page-login',
  templateUrl: 'login.html',
})
export class LoginPage {

  person = <any>{};

  constructor(public navCtrl: NavController, public navParams: NavParams,
    public peopleProv: PeopleProvider) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad LoginPage');
  }

  // DEBUG CODE, REMOVE THIS
  openPageTabs(){
    this.navCtrl.push(TabsPage);
  }

  openPp(){
    this.peopleProv.login({'nome': 'xd'});
  }

  openMp(){
    this.navCtrl.push(MapPage);
  }

}
