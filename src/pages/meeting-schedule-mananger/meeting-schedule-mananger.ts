import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-meeting-schedule-mananger',
  templateUrl: 'meeting-schedule-mananger.html',
})
export class MeetingScheduleManangerPage {
  isMeetingCreator = false;

  constructor(public navCtrl: NavController, public navParams: NavParams) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingScheduleManangerPage');
  }

}
