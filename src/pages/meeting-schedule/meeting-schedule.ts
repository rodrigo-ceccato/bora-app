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
  meeting   = <any>{};
  fixDate   = <any>{};
  unfixDate = <any>{};
  scheduleType = 'defineDate';

  constructor(public navCtrl: NavController, public navParams: NavParams,
    private alertCtrl: AlertController) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingSchedulePage');
  }

  checkMeetingInput() {
    console.log(this.meeting.name);
    console.log(this.meeting.local);

    // check if fields are okay
    if(!this.meeting.name)  return false;
    if(!this.meeting.local) return false;

    if(this.scheduleType == 'fixedDate') {
      // is the date ok?
      console.log(this.fixDate.start);
      console.log(this.fixDate.end);

    } else {
      // is the interval set?
      console.log(this.unfixDate.start);
      console.log(this.unfixDate.end);

    }

    return true;
  }

  createMeeting() {
    console.log('Creating meeting...');
    console.log('Checking input data...');

    let valid = this.checkMeetingInput();

    if (valid) {

      let alert = this.alertCtrl.create({
        title: 'Confirm purchase',
        message: 'Do you want to buy this book?',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => {
              console.log('Cancel clicked');
            }
          },
          {
            text: 'Buy',
            handler: () => {
              console.log('Buy clicked');
            }
          }
        ]
      });
      alert.present();
    }

    // invalid input
    else {
      let alert = this.alertCtrl.create({
        title: this.TEXT.INVALID_INPUT,
        subTitle: this.TEXT.INVALID_INPUT_DESC,
        buttons: [this.TEXT.CLOSE]
      });
      alert.present();

    }

  }

}
