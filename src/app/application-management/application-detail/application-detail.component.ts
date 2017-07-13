/**
 * Copyright (c) 2017 University of Stuttgart.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * and the Apache License 2.0 which both accompany this distribution,
 * and are available at http://www.eclipse.org/legal/epl-v10.html
 * and http://www.apache.org/licenses/LICENSE-2.0
 *
 * Contributors:
 *     Michael Falkenthal - initial implementation
 *     Michael Wurster - initial implementation
 */
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgRedux, select } from '@angular-redux/store';
import { Observable } from 'rxjs/Observable';
import { PlanOperationMetaData } from '../../core/model/planOperationMetaData.model';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { PlanParameter } from '../../core/model/plan-parameter.model';
import { ActivatedRoute, Router } from '@angular/router';
import { ApplicationDetail } from '../../core/model/application-detail.model';
import * as _ from 'lodash';
import { TriggerTerminationPlanEvent } from '../../core/model/trigger-termination-plan-event.model';
import { Path } from '../../core/util/path';
import { ApplicationManagementService } from '../../core/service/application-management.service';
import { OpenToscaLoggerService } from '../../core/service/open-tosca-logger.service';
import { ApplicationInstancesManagementService } from '../../core/service/application-instances-management.service';
import { AppState } from '../../store/app-state.model';
import { BreadcrumbActions } from '../../core/component/breadcrumb/breadcrumb-actions';
import { ApplicationManagementActions } from '../application-management-actions';
import { Csar } from '../../core/model/new-api/csar.model';
import { GrowlActions } from '../../core/growl/growl-actions';

@Component({
    selector: 'opentosca-ui-application-detail',
    templateUrl: './application-detail.component.html',
    styleUrls: ['./application-detail.component.scss']
})
export class ApplicationDetailComponent implements OnInit, OnDestroy {

    @select(['container', 'currentApp']) app: Observable<Csar>;
    public buildPlanOperationMetaData: PlanOperationMetaData;
    public selfserviceApplicationUrl: SafeUrl;
    public planOutputParameters: { OutputParameter: PlanParameter }[];
    public provisioningInProgress = false;
    public provisioningDone = false;
    public allInputsFilled = true;
    public terminationPlan: PlanOperationMetaData;
    public showStartProvisioningModal = false;
    private serviceTemplateInstancesURL: string;

    constructor(private route: ActivatedRoute,
                private appService: ApplicationManagementService,
                private sanitizer: DomSanitizer,
                private ngRedux: NgRedux<AppState>,
                private logger: OpenToscaLoggerService,
                private router: Router,
                private appInstancesService: ApplicationInstancesManagementService) {
    }

    /**
     * Checks if given param should be shown in the start privisioning dialog
     * @param param
     * @returns {boolean}
     */
    public showParam(param: PlanParameter): boolean {
        return (!(param.Name === 'CorrelationID' ||
        param.Name === 'csarID' ||
        param.Name === 'serviceTemplateID' ||
        param.Name === 'containerApiAddress' ||
        param.Name === 'instanceDataAPIUrl' ||
        param.Name === 'planCallbackAddress_invoker' ||
        param.Name === 'csarEntrypoint' ||
        param.Name === 'DockerEngineCertificate'));
    }

    /**
     * Initialize component by extracting csar id from route params,
     * then load app description and build plan parameters
     */
    ngOnInit(): void {
        const breadCrumbs = [];
        breadCrumbs.push({label: 'Applications', routerLink: 'applications'});
        this.ngRedux.dispatch(BreadcrumbActions.updateBreadcrumb(breadCrumbs));
        this.route.data
            .subscribe((data: { applicationDetail: ApplicationDetail }) => {
                    this.ngRedux.dispatch(ApplicationManagementActions.updateCurrentApplication(data.applicationDetail.app));
                    this.ngRedux.dispatch(ApplicationManagementActions.updateBuildPlanOperationMetaData(
                        data.applicationDetail.buildPlanParameters));
                    this.buildPlanOperationMetaData = data.applicationDetail.buildPlanParameters;
                    this.serviceTemplateInstancesURL = _.trimEnd(
                        data.applicationDetail.terminationPlanResource.Reference.href,
                        '%7BinstanceId%7D'
                    );
                    this.terminationPlan = data.applicationDetail.terminationPlanResource;
                    // Load also application instances for list
                    this.updateAppInstancesList(data.applicationDetail.app);
                    // Prepare breadcrumb
                    this.ngRedux.dispatch(BreadcrumbActions.appendBreadcrumb(
                        {
                            label: data.applicationDetail.app.id
                        }));
                },
                reason => {
                    this.ngRedux.dispatch(GrowlActions.addGrowl(
                        {
                            severity: 'warn',
                            summary: 'Loading of Data failed',
                            detail: 'Loading of data for the selected app failed. Please try to load it again. Server returned: ' +
                            JSON.stringify(reason)
                        }
                    ));

                    this.router.navigate(['/applications']);
                });
    }

    ngOnDestroy(): void {
        this.ngRedux.dispatch(ApplicationManagementActions.clearApplicationInstances());
        this.ngRedux.dispatch(ApplicationManagementActions.clearCurrentApplication());
    }

    emitTerminationPlan(terminationEvent: TriggerTerminationPlanEvent): void {
        const app = this.ngRedux.getState().container.currentApp;
        this.appService.getServiceTemplatePathNG(app.id)
            .subscribe(serviceTemplatePath => {
                console.log(serviceTemplatePath);
                const instanceId = terminationEvent.instanceID;
                console.log(instanceId);
                const plan = this.terminationPlan.Plan.ID;
                console.log(plan);
                const url = new Path(serviceTemplatePath)
                    .append('instances')
                    .append(instanceId + '')
                    .append('managementplans')
                    .append(plan)
                    .append('instances')
                    .toString();
                this.appService.getServiceTemplatePath(app.id).subscribe(path => {
                    this.appService.triggerPlan(url, []);
                    this.ngRedux.dispatch(GrowlActions.addGrowl(
                        {
                            severity: 'info',
                            summary: 'Termination started',
                            detail: 'The termination process has been started.'
                        }
                    ));
                });
            });
    }

    updateAppInstancesList(app: Csar): void {
        this.appInstancesService.getServiceTemplateInstancesOfCsar(app)
            .subscribe(result => {
                this.ngRedux.dispatch(ApplicationManagementActions.updateApplicationInstances(result));
            });
    }

    /**
     * Shows modal to key in required buildplan parameters and start provisioning
     */
    public showProvisioningModal(): void {
        this.showStartProvisioningModal = true;
    }

    /**
     * Hides modal key in required buildplan parameters and start provisioning
     */
    public hideProvisioningModal(): void {
        this.showStartProvisioningModal = false;
    }

    /**
     * Delegates the provisioning of a new instance to the ApplicationService
     * and hides the modal
     */
    startProvisioning(): void {
        this.hideProvisioningModal();
        this.selfserviceApplicationUrl = '';
        this.provisioningInProgress = true;
        this.provisioningDone = false;
        const app = this.ngRedux.getState().container.currentApp;
        this.appService.startProvisioning(app.id, this.buildPlanOperationMetaData)
            .then(response => {
                this.logger.log(
                    '[application-details.component][startProvisioning]',
                    'Received result after post ' + JSON.stringify(response)
                );
                this.logger.log(
                    '[application-details.component][startProvisioning]',
                    'Now starting to poll for service template instance creation'
                );
                this.appService.pollForServiceTemplateInstanceCreation(response.PlanURL)
                    .then(urlToServiceTemplateInstance => {
                        this.logger.log(
                            '[application-details.component][startProvisioning]',
                            'ServiceTemplateInstance created: ' + urlToServiceTemplateInstance);
                        const urlToPlanInstanceOutput = new Path(urlToServiceTemplateInstance)
                            .append('PlanInstances')
                            .append(this.extractCorrelationID(response.PlanURL))
                            .append('Output')
                            .toString();

                        const urlToPlanInstanceState = new Path(urlToServiceTemplateInstance)
                            .append('PlanInstances')
                            .append(this.extractCorrelationID(response.PlanURL))
                            .append('State')
                            .toString();

                        this.logger.log('[application-details.component][startProvisioning]',
                            'Now staring to poll for build plan completion: ' + urlToPlanInstanceState);

                        this.appService.pollForPlanFinish(urlToPlanInstanceState)
                            .then(result => {
                                this.updateAppInstancesList(app);
                                // we received the plan result
                                // go find and present selfServiceApplicationUrl to user
                                this.logger.log(
                                    '[application-details.component][startProvisioning]',
                                    'Received plan result: ' + JSON.stringify(result)
                                );
                                this.appService.getPlanOutput(urlToPlanInstanceOutput)
                                    .then(planOutput => {
                                        for (const para of planOutput.OutputParameters) {
                                            if (para.OutputParameter.Name === 'selfserviceApplicationUrl') {
                                                this.selfserviceApplicationUrl = this.sanitizer.bypassSecurityTrustUrl(
                                                    para.OutputParameter.Value
                                                );
                                                this.ngRedux.dispatch(GrowlActions.addGrowl(
                                                    {
                                                        severity: 'success',
                                                        summary: 'New Instance Provisioned',
                                                        detail: 'A new instance of ' + app.id +
                                                        ' was provisioned. Launch via: ' +
                                                        para.OutputParameter.Value
                                                    }
                                                ));
                                            }
                                        }
                                        if (this.selfserviceApplicationUrl === '') {
                                            this.planOutputParameters = planOutput.OutputParameters;
                                            this.ngRedux.dispatch(GrowlActions.addGrowl(
                                                {
                                                    severity: 'success',
                                                    summary: 'New Instance Provisioned',
                                                    detail: 'A new instance of ' + app.id +
                                                    ' was provisioned. Result is: ' +
                                                    JSON.stringify(planOutput.OutputParameters)
                                                }
                                            ));
                                            this.logger.log(
                                                '[application-details.component][startProvisioning]',
                                                'Did not receive a selfserviceApplicationUrl');
                                        }
                                    })
                                    .catch(err => {
                                        this.emitProvisioningErrorMessage(err);
                                        this.logger.handleError('[application-details.component][startProvisioning]', err);
                                    });
                                this.provisioningDone = true;
                                this.provisioningInProgress = false;
                            })
                            .catch(err => {
                                this.emitProvisioningErrorMessage(err);
                                this.logger.handleError('[application-details.component][startProvisioning][pollForResults]', err);
                            });
                    })
                    .catch(err => {
                        this.emitProvisioningErrorMessage(err);
                        this.logger.handleError('[application-details.component][startProvisioning]', err);
                    });
            })
            .catch(err => {
                this.emitProvisioningErrorMessage(err);
                this.logger.handleError('[application-details.component][startProvisioning]', err);
            });
    }

    emitProvisioningErrorMessage(err: Error): void {
        this.app.subscribe(app => {
            this.ngRedux.dispatch(GrowlActions.addGrowl(
                {
                    severity: 'error',
                    summary: 'Failure at Provisioning',
                    detail: 'The provisioning of a new instance of ' + app.id + ' was not successfull. Error is: ' + JSON.stringify(err)
                }
            ));
        });
    }

    extractCorrelationID(queryString: string): string {
        if (queryString.lastIndexOf('=') >= 0) {
            return queryString.substring(queryString.lastIndexOf('=') + 1);
        } else {
            return '';
        }
    }

    /**
     * Checks if out parameter should be shown as result for users after provisioning
     * @param param
     * @returns {boolean}
     */
    showOutputParameter(param: { OutputParameter: PlanParameter }): boolean {
        return (!(param.OutputParameter.Name === 'instanceId' ||
        param.OutputParameter.Name === 'CorrelationID'));
    }

    /**
     * Check if all input fields are filled and enable button
     * @returns {boolean}
     */
    checkAllInputsFilled(): boolean {
        if (this.buildPlanOperationMetaData) {
            for (const par of this.buildPlanOperationMetaData.Plan.InputParameters) {
                if (!(par.InputParameter.Value) && this.showParam(par.InputParameter)) {
                    return this.allInputsFilled = true;
                }
            }
            return this.allInputsFilled = false;
        }
    }
}
