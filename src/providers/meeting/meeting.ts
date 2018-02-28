import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { API_ENDPOINT } from '../../models/consts';
import { PeopleProvider } from '../../providers/people/people';

/*
  Generated class for the MeetingProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class MeetingProvider {

  constructor(public http: HttpClient, public peopleProvirder: PeopleProvider) {
    console.log('Hello MeetingProvider Provider');
  }


  addMeeting (meeting) {
    meeting.creator = this.peopleProvirder.currentUser.login;
    this.http.post(API_ENDPOINT + '/events', event).subscribe((data) => {

      console.log(event , 'adicionado');
    });
  }

}
