import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { TabsPage } from '../../pages/tabs/tabs';
import { PeopleProvider } from '../../providers/people/people';
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
