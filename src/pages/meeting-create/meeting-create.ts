import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { MeetingSchedulePage } from '../meeting-schedule/meeting-schedule';
import { BoraagoraPage } from '../boraagora/boraagora';
import { BoraHojePage } from '../bora-hoje/bora-hoje';


/**
 * Generated class for the MeetingCreatePage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-meeting-create',
  templateUrl: 'meeting-create.html',
})
export class MeetingCreatePage {

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingCreatePage');
  }

  openMeetingScheduler(){
    this.navCtrl.push(MeetingSchedulePage);
  }

  openPageBoraHoje(){
    this.navCtrl.push(BoraHojePage);
  }
}
