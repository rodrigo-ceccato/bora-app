import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { BoraagoraPage } from '../boraagora/boraagora';

import { MeetingProvider } from '../../providers/meeting/meeting';
import { MeetingInfoPage } from '../meeting-info/meeting-info';
/**
 * Generated class for the BoraHojePage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-bora-hoje',
  templateUrl: 'bora-hoje.html',
})
export class BoraHojePage {
  meeting = <any>{};
  fixDate = <any>{};
  unfixDate = <any>{};
  scheduleType = 'defineDate';

  

  constructor(public navCtrl: NavController, public meetProv: MeetingProvider, public navParams: NavParams) {
  }


verificarVazio(){
  if(this.meeting.name == "" ||
  this.meeting.timeStart == "" ||
  this.meeting.location==""){
    return true;
  }
}

  ionViewDidLoad() {
    console.log('ionViewDidLoad BoraHojePage');
  }

  openPageBoraAgora(){
    this.navCtrl.push(BoraagoraPage);
  }

  marcarEvento(){
       if(this.verificarVazio() ==  false){
            console.log(this.meeting.name);
            console.log(this.meeting.timeStart);
            console.log(this.meeting.location);

            let meeting = {
            name: this.meeting.name,
            location: this.meeting.local,
            timeStart: '',
            timeEnd: '',
            fixedDate: false,
            peopleInvited: [],
            PeopleConfirmed: []
          }
          
          let fixDateStart = new Date(this.fixDate.start);
          this.meetProv.addMeeting(meeting);
  }
  else{
    alert("Por favor preencha todos os campos!");

  }
}



 

}
 

