import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { AlertController } from 'ionic-angular';

import { SCHEDULER_TEXT } from '../../models/consts';
import { MeetingProvider } from '../../providers/meeting/meeting';
import { MeetingInfoPage } from '../meeting-info/meeting-info';

@IonicPage()
@Component({
  selector: 'page-meeting-schedule',
  templateUrl: 'meeting-schedule.html',
})
export class MeetingSchedulePage {
  public TEXT = SCHEDULER_TEXT;
  meeting = <any>{};
  fixDate = <any>{};
  unfixDate = <any>{};
  scheduleType = 'defineDate';

  constructor(public navCtrl: NavController, public navParams: NavParams,
    private alertCtrl: AlertController, public meetProv: MeetingProvider) {
    this.fixDate.start = new Date().toISOString();
    this.fixDate.end = new Date(Date.now() + (1000 /*sec*/ * 60 /*min*/ * 60 /*hour*/ * 2)).toISOString();

    this.unfixDate.start = new Date().toISOString();
    this.unfixDate.end = new Date(Date.now() + (1000 /*sec*/ * 60 /*min*/ * 60 /*hour*/ * 24 /*days*/ * 2)).toISOString();
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingSchedulePage');
  }

  checkMeetingInput() {
    console.log(this.meeting.name);
    console.log(this.meeting.local);

    // check if fields are okay
    if (!this.meeting.name) return false;
    if (!this.meeting.local) return false;

    if (this.scheduleType == 'defineDate') {
      // is the interval set?
      console.log("Unfixed dates: ");
      console.log(this.unfixDate.start);
      console.log(this.unfixDate.end);

    } else {
      // is the date ok?
      console.log('FixedDate dates: ');
      console.log(this.fixDate.start);
      console.log(this.fixDate.end);
    }

    return true;
  }

  createMeeting() {
    console.log('Creating meeting...');
    console.log('Checking input data...');

    let valid = this.checkMeetingInput();

    if (valid) {
      let meeting = {
        name: this.meeting.name,
        location: this.meeting.local,
        timeStart: '',
        timeEnd: '',
        fixedDate: false,
        peopleInvited: [],
        peopleConfirmed: []
      }

      // some auxiliar objects
      let fixDateStart = new Date(this.fixDate.start);
      let fixDateEndHour = new Date(this.fixDate.end);
      let fixDateEnd = new Date(this.fixDate.start);

      if (this.scheduleType == 'defineDate') {
        //TODO allow to go to next year
        meeting.fixedDate = false;
        meeting.timeStart = this.unfixDate.start;
        meeting.timeEnd = this.unfixDate.end;

      } else {
        // correts if the events ends on the next day
        fixDateEnd.setHours(fixDateEndHour.getHours());
        fixDateEnd.setMinutes(fixDateEndHour.getMinutes());

        // meeting ends on the next day
        if (fixDateEnd.getTime() < fixDateStart.getTime()) {
          fixDateEnd.setDate(fixDateEnd.getDate() + 1);
        }

        meeting.fixedDate = true;
        meeting.timeStart = fixDateStart.toISOString();
        meeting.timeEnd = fixDateEnd.toISOString();
      }

      //TODO check for year change
      console.log('Fix date start   \n>' + fixDateStart.toISOString());
      console.log('Fix date end     \n>' + fixDateEnd.toISOString());
      console.log('Unfix date start \n>' + this.unfixDate.start);
      console.log('Unfix date end   \n>' + this.unfixDate.end);

      console.log(meeting);
      this.meetProv.addMeeting(meeting);

      let parameter = {
        paramCont: 'fudeu'
      };

      // resets the forms
      this.meeting.local = '';
      this.meeting.name = '';

      this.navCtrl.push(MeetingInfoPage, parameter);

    }

    // invalid input
    else {
      this.alertCtrl.create({
        title: this.TEXT.INVALID_INPUT,
        subTitle: this.TEXT.INVALID_INPUT_DESC,
        buttons: [this.TEXT.CLOSE]
      }).present();

    }

  }

}
