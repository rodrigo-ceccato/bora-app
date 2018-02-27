import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { AlertController } from 'ionic-angular';

import { SCHEDULER_TEXT } from '../../models/consts';

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
    private alertCtrl: AlertController) {
     this.fixDate.start   = new Date().toISOString();
     this.fixDate.end     = new Date(Date.now() + (1000 /*sec*/ * 60 /*min*/ * 60 /*hour*/ * 2)).toISOString();

     this.unfixDate.start = new Date().toISOString();
     this.unfixDate.end   = new Date(Date.now() + (1000 /*sec*/ * 60 /*min*/ * 60 /*hour*/ * 24 /*days*/ * 2)).toISOString();
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingSchedulePage');
  }

  checkMeetingInput() {
    console.log(this.meeting.name);
    console.log(this.meeting.local);

    // check if fields are okay
    if (!this.meeting.name)  return false;
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
      console.log('Checking if event ends on the next day...');
      
      if (this.scheduleType == 'defineDate') {
        //TODO allow to go to next year

      } else {
        // correts if the events ends on the next day
        let fixDateStart = new Date(this.fixDate.start);
        let fixDateEnd = new Date(this.fixDate.end);

        if(fixDateStart > fixDateEnd) {
          console.log("Nois vai madrugar");

          // solves the madrugador
          fixDateEnd = new Date (fixDateEnd.getTime() + 1000*60*60*24);
          this.fixDate.end = fixDateEnd.toISOString();
          console.log(this.fixDate.end);

        }

      }

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
