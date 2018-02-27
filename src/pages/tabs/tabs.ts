import { Component } from '@angular/core';

import { UserProfilePage } from '../../pages/user-profile/user-profile';
import { MeetingCreatePage } from '../../pages/meeting-create/meeting-create';
import { MeetingListPage } from '../../pages/meeting-list/meeting-list';

import { TABS_TEXT } from '../../models/consts';

@Component({
  templateUrl: 'tabs.html'
})
export class TabsPage {
  public TEXT = TABS_TEXT;

  tab1Root = MeetingListPage;
  tab2Root = MeetingCreatePage;
  tab3Root = UserProfilePage;

  constructor() { }
  
}
