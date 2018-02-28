import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { BoraagoraPage } from '../boraagora/boraagora';
import { AlertController } from 'ionic-angular';
import { SCHEDULER_TEXT } from '../../models/consts';
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
  public TEXT = SCHEDULER_TEXT;
  meeting = <any>{};
  fixDate = <any>{};
  unfixDate = <any>{};
  scheduleType = 'defineDate';

  

  constructor(public navCtrl: NavController,private alertCtrl: AlertController, public meetProv: MeetingProvider, public navParams: NavParams) {
  }


verificarVazio(){
  if(this.meeting.name == "" ||
  // this.meeting.timeStart == "" ||
  this.meeting.location==""){
    return true;
  }return false;
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
            // console.log(this.meeting.timeStart);
            console.log(this.meeting.location);
            let date = new Date();
            console.log("Current Date ",date) ;
            let meeting = {
            name: this.meeting.name,
            location: this.meeting.local,
            timeStart: date,
            timeEnd: " -1",
            fixedDate: false,
            peopleInvited: [],
            PeopleConfirmed: []
          }
          
          let fixDateStart = new Date(this.fixDate.start);
          console.log(meeting);
          this.meetProv.addMeeting(meeting);
          let parameter = {
            meeting: 'fudeu'
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
 
