import {Component, OnInit, trigger, state, style, transition, animate} from '@angular/core';
import {ApplicationService} from '../shared/application.service';
import {Application} from '../shared/application.model';


@Component({
    selector: 'opentosca-applications',
    templateUrl: 'src/app/applications/applications.component.html',
    animations: [
        trigger('fadeInOut', [
            state('in', style({'opacity': 1})),
            transition('void => *', [
                style({'opacity': 0}),
                animate('500ms ease-out')
            ]),
            transition('* => void', [
                style({'opacity': 1}),
                animate('500ms ease-in')
            ])
        ])
    ]
})
export class ApplicationsComponent implements OnInit {

    public apps: Application[] = [];

    constructor(private appService: ApplicationService) {
    }

    ngOnInit(): void {
        this.getAppReferences();
    }

    getAppReferences(): void {
        this.appService.getApps().then(references => {
            for (let ref of references) {
                if (ref.title !== 'Self') {
                    this.appService.getAppDescription(ref.title).then(app => {
                        this.apps.push(app);
                    });
                }
            }
        });
    }

    sortAppArray(apps: Array<Application>): Array<Application> {
        apps.sort((left: Application, right: Application): number => {
            if (left.name < right.name) {
                return -1;
            } else if (left.name > right.name) {
                return 1;
            } else {
                return 0;
            }
        });
        return apps;
    }
}
