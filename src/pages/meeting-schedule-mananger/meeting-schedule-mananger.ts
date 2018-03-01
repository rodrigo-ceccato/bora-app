import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { Injector, ViewChild } from '@angular/core';
import { Slides } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-meeting-schedule-mananger',
  templateUrl: 'meeting-schedule-mananger.html',
})
export class MeetingScheduleManangerPage {

  isMeetingCreator = false;
  dateDisplay = [
    {
      name: '25 FEV',
      disp: [{
        personName: 'Rafael',
        hoursAvali: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
      },
      {
        personName: 'Pedrão',
        hoursAvali: [0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0]
      },
      {
        personName: 'Suvs',
        hoursAvali: [0,1,1,1,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0]
      }
    ]
    },
    {
      name: '26 FEV',
      disp: [{
        personName: 'Rafael',
        hoursAvali: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
      },
      {
        personName: 'Pedrão',
        hoursAvali: [1,0,1,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0]
      },
      {
        personName: 'Suvs',
        hoursAvali: [1,1,1,1,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0]
      }
    ]
    }
  ];
posShowing = 0;

hourName = ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];

currentDay = this.dateDisplay[this.posShowing];

constructor(public navCtrl: NavController, public navParams: NavParams) {

}

ionViewDidLoad() {
  console.log('ionViewDidLoad MeetingScheduleManangerPage');
}

nextDay() {
  if (this.posShowing < this.dateDisplay.length - 1) {
    this.posShowing += 1;
  }
  this.currentDay = this.dateDisplay[this.posShowing];
  console.log('Showing pos >', this.posShowing);
}

backDay() {
  if (this.posShowing > 0) {
    this.posShowing -= 1;
  }
  this.currentDay = this.dateDisplay[this.posShowing];
  console.log('Showing pos >', this.posShowing);
}

}
