import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { PeopleProvider } from '../../providers/people/people';
import { Events } from 'ionic-angular';

/**
 * Generated class for the UserProfilePage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-user-profile',
  templateUrl: 'user-profile.html',
})
export class UserProfilePage {

  friends;

  constructor(public navCtrl: NavController, public navParams: NavParams, public provider: PeopleProvider, public events: Events) {
    this.friends = this.provider.currentUser.friends;
    events.subscribe('friend added', (data) => {
      this.friends = this.provider.currentUser.friends;
      console.log(data.login);
    });
    
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad UserProfilePage');
  }
  
  person = {
    login: ''
  }

  searchUser() {
    this.provider.searchFriends(this.person);
    
  }

}
