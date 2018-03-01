import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, AlertController } from 'ionic-angular';
import { MeetingScheduleManangerPage } from '../meeting-schedule-mananger/meeting-schedule-mananger';

@IonicPage()
@Component({
  selector: 'page-meeting-info',
  templateUrl: 'meeting-info.html',
})
export class MeetingInfoPage {
  meeting = {
    name: 'Rolezinho no meu apê',
    location: 'Apê do vallone',
    timeStart: '2018-03-02T18:16:01.184Z',
    timeEnd: '2018-03-02T18:16:01.184Z',
    peopleInvited: ['Julinho Porradao'],
    peopleConfirmed: ['Mãe do Vallone ^xD^'],
    isFixed: false
  };

  startDate = new Date(this.meeting.timeStart);
  endDate = new Date(this.meeting.timeEnd);

  friends = ['Fopor', 'Vallone', 'Edu', 'Julinho Porradão', 'Felipe Pavan'];

  startDateFormated = this.startDate.getDate() + '/' + this.startDate.getMonth() + ' ' + this.startDate.getHours() + ':' + this.startDate.getMinutes();
  endDateFormated = this.endDate.getDate() + '/' + this.endDate.getMonth() + ' ' + this.endDate.getHours() + ':' + this.endDate.getMinutes();

  constructor(public navCtrl: NavController, public navParams: NavParams, public alertCtrl: AlertController) {
    let i = this.navParams.get('paramCont');
    console.log('Chegamos com::::');
    console.log(i);

  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingInfoPage');
  }

  seeSchedule(){
    let parameter = {

    };

    this.navCtrl.push(MeetingScheduleManangerPage, parameter);
  }

  invitePeople() {
    let alert = this.alertCtrl.create();
    alert.setTitle('Quem cê quer chamar?');

    for (let friend of this.friends) {
      alert.addInput({
        type: 'checkbox',
        label: friend,
        value: friend
      });
    }

    alert.addButton('Xapralá');
    alert.addButton({
      text: 'Xamaí',
      handler: (data: any) => {
        console.log('Checkbox data:', data);
        // TODO SEND THIS TO SERVER XD
      }
    });

    alert.present();
  }
  
}
