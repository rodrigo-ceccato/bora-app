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


  constructor(public http: HttpClient, public peopleProvirder: PeopleProvider, public events: Events) {
    console.log('Hello MeetingProvider Provider');

    
  }

  removeMeeting(name) {
    let meeting = {
      name: name
    }
    this.http.post(API_ENDPOINT + '/removeEvent', meeting).subscribe((data) => {
      console.log('tentou remover o evento....' + meeting.name);
    })
  }

  addMeeting (meeting) {
    meeting.creator = this.peopleProvirder.currentUser.login;
    this.http.post(API_ENDPOINT + '/events', meeting).subscribe((data) => {

      console.log(event , 'adicionado');
      this.events.publish("meeting added");
    });
  }
}
