import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { PeopleProvider } from '../../providers/people/people';
import { Events } from 'ionic-angular';
import { MeetingProvider } from '../../providers/meeting/meeting';

/**
 * Generated class for the UserProfilePage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@Component({
  selector: 'page-user-profile',
  templateUrl: 'user-profile.html',
})
export class UserProfilePage {

  friends;

  constructor(public navCtrl: NavController, public navParams: NavParams, public peopleProvider: PeopleProvider, public events: Events, public meetingProvider: MeetingProvider) {
    this.friends = this.peopleProvider.currentUser.amigos;
    this.initializeItems();
    events.subscribe('friend added', (data) => {
      this.friends = this.peopleProvider.currentUser.amigos;
      console.log(data.login);
    });


    
  }
  searchUser() {
    this.peopleProvider.searchFriends(this.person);
    
  }
  ionViewDidLoad() {
    console.log('ionViewDidLoad UserProfilePage');
  }
  
  person = {
    login: ''
  }

  
  initializeItems() {
    this.peopleProvider.currentUser.amigos; 
  }

  getItems(ev) {
    // Reset items back to all of the items
    this.initializeItems();

    // set val to the value of the ev target
    var val = ev.target.value;

    // if the value is an empty string don't filter the items
    if (val && val.trim() != '') {
      this.peopleProvider.currentUser.amigos = this.peopleProvider.currentUser.amigos.filter((item) => {
        return (item.toLowerCase().indexOf(val.toLowerCase()) > -1);
      })
    }
  }
  

}
