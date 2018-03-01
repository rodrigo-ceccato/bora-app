import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { PeopleProvider } from '../../providers/people/people';
import { Events } from 'ionic-angular/util/events';
import { ToastController } from 'ionic-angular';
import { MeetingProvider } from '../../providers/meeting/meeting';

/**
 * Generated class for the MeetingListPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-meeting-list',
  templateUrl: 'meeting-list.html',
})
export class MeetingListPage {

  meetingsInvited;
  meetingsCreated;
  

  constructor(public meetingProvider: MeetingProvider, public toastCtrl: ToastController,public navCtrl: NavController, public navParams: NavParams, public peopleProvider: PeopleProvider, public events: Events) {
    this.meetingsInvited = this.peopleProvider.currentUserMeetingsInvited;
    this.meetingsCreated = this.peopleProvider.currentUserMeetingsCreated;
    this.events.subscribe("meeting added", () =>  {
      this.meetingsCreated = this.peopleProvider.currentUserMeetingsCreated;
      this.meetingsInvited = this.peopleProvider.currentUserMeetingsInvited;
      this.initializeFriends();
  });
  }
  initializeFriends() {
    // this.friends = [
     
    // ];
  }
  ionViewDidLoad() {
    console.log('ionViewDidLoad MeetingListPage');
  }

    removeMeeting(nome){

        }
      getName(item){
        let parametros = {
          identifacor: item
        }; 
        this.meetingProvider.removeMeeting(item);
      }

      
   
    showToast(position: string) {
      let toast = this.toastCtrl.create({
        message: 'Presença confirmada!',
        duration: 2000,
        position: position
      });
  
      toast.present(toast);
    }

}

