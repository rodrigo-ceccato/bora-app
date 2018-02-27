import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { MeetingSchedulePage } from '../meeting-schedule/meeting-schedule';

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

}
