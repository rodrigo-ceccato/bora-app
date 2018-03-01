import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { API_ENDPOINT } from '../../models/consts';
import { PeopleProvider } from '../../providers/people/people';
import { Events } from 'ionic-angular/util/events';

/*
  Generated class for the MeetingProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class MeetingProvider {


  constructor(public http: HttpClient, public peopleProvider: PeopleProvider, public events: Events) {
    console.log('Hello MeetingProvider Provider');

    
  }

  removeMeeting(name) {
    let meeting = {
      name: name
    }

    console.log("removendo evento: ", meeting);
    this.http.post(API_ENDPOINT + '/removeEvent', meeting).subscribe((data) => {
      console.log('tentou remover o evento....' + meeting.name);

      
      
      this.http.post(API_ENDPOINT + '/searchMeetingsInvited', this.peopleProvider.currentUser).subscribe((data) => {

        this.peopleProvider.currentUserMeetingsInvited = data;
        console.log(this.peopleProvider.currentUserMeetingsInvited);
        this.events.publish("meeting removed");  
      });

      this.http.post(API_ENDPOINT + '/searchMeetingsCreated', this.peopleProvider.currentUser).subscribe((data) => {

          this.peopleProvider.currentUserMeetingsCreated = data;
          console.log(this.peopleProvider.currentUserMeetingsCreated);
          this.events.publish("meeting removed");
      });
      
    });
    
  }

  addMeeting (meeting) {
    meeting.creator = this.peopleProvider.currentUser.login;
    this.http.post(API_ENDPOINT + '/events', meeting).subscribe((data) => {

      console.log(event + 'adicionado');

      this.http.post(API_ENDPOINT + '/searchMeetingsInvited', this.peopleProvider.currentUser).subscribe((data) => {

        this.peopleProvider.currentUserMeetingsInvited = data;
        console.log(this.peopleProvider.currentUserMeetingsInvited);
        this.events.publish("meeting added");  
      });

      this.http.post(API_ENDPOINT + '/searchMeetingsCreated', this.peopleProvider.currentUser).subscribe((data) => {

          this.peopleProvider.currentUserMeetingsCreated = data;
          console.log(this.peopleProvider.currentUserMeetingsCreated);
          this.events.publish("meeting added");
          
      });
      
      
    });
  }
}
