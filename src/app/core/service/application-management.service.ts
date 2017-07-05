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
import { Injectable, Inject } from '@angular/core';
import { Http, Headers, Response, RequestOptions } from '@angular/http';
import { ConfigurationService } from '../../configuration/configuration.service';
import { OpenToscaLoggerService } from './open-tosca-logger.service';
import { Path } from '../util/path';
import { ResourceReference } from '../model/resource-reference.model';
import { PlanParameters } from '../model/plan-parameters.model';
import { Observable } from 'rxjs/Observable';
import { PlanOperationMetaData } from '../model/planOperationMetaData.model';
import { ReferenceHelper } from '../util/reference-helper';
import { BuildplanPollResource } from '../model/buildplan-poll-resource.model';
import { PlanInstance } from '../model/plan-instance.model';
import { ApplicationInstanceProperties } from '../model/application-instance-properties.model';
import { ObjectHelper } from '../util/object-helper';
import { Application } from '../model/application.model';
import * as _ from 'lodash';
import { DOCUMENT } from '@angular/platform-browser';

@Injectable()
export class ApplicationManagementService {
    /**
     * Helper that ensures that appID always ends with .csar
     * @param appID
     * @returns {string}
     */
    public fixAppID(appID: string): string {
        return _.endsWith(appID.toLowerCase(), '.csar') ? appID : appID + '.csar';
    }

    constructor(private http: Http,
                private configService: ConfigurationService,
                private logger: OpenToscaLoggerService,
                @Inject(DOCUMENT) private document: any) {
    }

    /**
     * Deletes the app from the container
     * @param appID
     * @returns {Promise<any>}
     */
    deleteAppFromContainer(appID: string): Promise<any> {
        const url = new Path(this.configService.getContainerAPIURL())
            .append('containerapi')
            .append('CSARs')
            .append(this.fixAppID(appID))
            .toString();
        const headers = new Headers({'Accept': 'text/plain'});
        this.logger.log('[application.service][deleteAppFromContainer]', 'Sending delete to ' + url);
        return this.http.delete(url, {headers: headers})
            .toPromise();
    }

    deleteApplicationInstance(appInstanceURL: string): Promise<any> {
        this.logger.log('[application.service][deleteApplicationInstance]', 'Trying to delete: ' + appInstanceURL);
        return this.http.delete(appInstanceURL)
            .toPromise();
    }



    /**
     * Retrieve a list of references to deployed applications
     * @returns {Promise<ResourceReference[]>}
     */
    getApps(): Promise<ResourceReference[]> {
        const url = new Path(this.configService.getContainerAPIURL())
            .append('containerapi')
            .append('CSARs')
            .toString();
        return this.http.get(url, {headers: this.configService.getDefaultAcceptJSONHeaders()})
            .toPromise()
            .then(response => response.json().References as ResourceReference[])
            .catch(err => this.logger.handleError('[application.service][getApps]', err));
    }

    getResolvedApplications(): Observable<Array<Application>> {
        const url = new Path(this.configService.getContainerAPIURL())
            .append('csars')
            .toString();
        return this.http.get(url, {headers: this.configService.getDefaultAcceptJSONHeaders()})
            .map((response: Response) => response.json()['csars'])
            .map((response: Array<{ id: string, _links: Array<any> }>) => {
                const csarReferences: Array<CsarReference> = [];
                for (const csar of response) {
                    csarReferences.push(new CsarReference(csar.id, csar._links[0]['self']['href']));
                }
                return csarReferences;
            })
            .map((response: Array<CsarReference>) => {
                const observables: Array<Observable<Application>> = [];
                for (const cr of response) {
                    observables.push(this.getAppDescription(cr.id));
                }
                return Observable.forkJoin(observables)
            })
            .flatMap(result => result);
    }


    /**
     * Fetches PlanParameters
     * @param url
     * @returns {Promise<PlanParameters>}
     */
    getPlanOutputParameter(url: string): Promise<PlanParameters> {
        return this.http.get(url, {headers: this.configService.getDefaultAcceptJSONHeaders()})
            .toPromise()
            .then(result => result.json() as PlanParameters)
            .catch(err => this.logger.handleError('[application.service][getPlanOutputParameter]', err));
    }

    /**
     * Lookup the parameters required by the buildplan of a CSAR
     * @param appID
     * @returns {Observable<PlanParameters>}
     */
    getBuildPlanParameters(appID: string): Observable<PlanOperationMetaData> {
        return this.getServiceTemplatePath(appID)
            .flatMap(serviceTemplatePath => {
                const url = new Path(serviceTemplatePath)
                    .append(this.configService.getBuildPlanPath()).toString();
                return this.http.get(url, {headers: this.configService.getDefaultAcceptJSONHeaders()})
                    .map(response => response.json() as PlanOperationMetaData)
                    .catch(err => this.logger.handleObservableError('[application.service][getBuildPlanParameters]', err));
            })
            .catch(err => this.logger.handleObservableError('[application.service][getBuildPlanParameters]', err));
    }

    getTerminationPlan(appID: string): Observable<PlanOperationMetaData> {
        return this.getServiceTemplatePath(appID)
            .flatMap(serviceTemplatePath => {
                const url = new Path(serviceTemplatePath)
                    .append(this.configService.getTerminationPlanPath()).toString();
                return this.http.get(url, {headers: this.configService.getDefaultAcceptJSONHeaders()})
                    .map(response => response.json() as PlanOperationMetaData)
                    .catch(err => this.logger.handleObservableError('[application.service][getTerminationPlan]', err));
            })
            .catch(err => this.logger.handleObservableError('[application.service][getTerminationPlan]', err));
    }

    /**
     * Fetches the URL to the ServiceTemplate of the given AppID
     * @param appID
     * @returns {Promise<string>}
     */
    getServiceTemplatePath(appID: string): Observable<string> {
        const url = new Path(this.configService.getContainerAPIURL())
            .append('containerapi')
            .append('CSARs')
            .append(this.fixAppID(appID))
            .append('ServiceTemplates')
            .toString();

        const reqOpts = new RequestOptions({headers: new Headers({'Accept': 'application/json'})});

        return this.http.get(url, reqOpts)
            .map(response => {
                const resRefs = response.json().References as Array<ResourceReference>;
                for (const ref of resRefs) {
                    if (!ReferenceHelper.isSelfReference(ref)) {
                        return ref.href;
                    }
                }
                this.logger.handleObservableError('[application.service][getServiceTemplatePath]', new Error(JSON.stringify(resRefs)));
            })
            .catch(err => this.logger.handleObservableError('[application.service][getServiceTemplatePath]', err));
    }

    // TODO
    getServiceTemplatePathNG(appID: string): Observable<string> {

        const url = new Path(`http://${this.document.location.hostname}:1337/csars`)
        .append(this.fixAppID(appID))
        .append('servicetemplates')
        .toString();

        const reqOpts = new RequestOptions({headers: new Headers({'Accept': 'application/json'})});

        return this.http.get(url, reqOpts)
                   .map(response => {
                       return response.json().service_templates[0]._links[0].self.href;
                   })
                   .catch(err => this.logger.handleObservableError('[application.service][getServiceTemplatePath]', err));
    }

    // TODO
    triggerPlan(url: string, parameters: any): void {
        this.http.post(url, parameters, {headers: new Headers({'Accept': 'application/json'})})
                   .toPromise()
                   .then(response => {
                       this.logger.log('[application.service][triggerPlan]', 'Server responded to post: ' + response);
                   })
                   .catch(err => this.logger.handleError('[application.service][triggerPlan]', err));
    }

    /**
     * Triggers the provisioning of a new service instance
     * @param appID ID (CSAR name) of the service which shall be provisioned
     * @param planMetaData PlanParameters object that containes required input parameters for the buildplan
     * @returns {Promise<BuildplanPollResource>}
     */
    startProvisioning(appID: string, planMetaData: PlanOperationMetaData): Promise<BuildplanPollResource> {
        this.logger.log('[application.service][startProvisioning]', 'Starting Provisioning');
        this.logger.log('[application.service][startProvisioning]', 'Build Plan Operation Meta Data are: ' + JSON.stringify(planMetaData));
        this.logger.log('[application.service][startProvisioning]', 'Posting to: ' + planMetaData.Reference.href);
        const headers = new Headers(this.configService.getDefaultAcceptJSONHeaders());
        headers.append('Content-Type', 'text/plain');

        return this.http.post(planMetaData.Reference.href, planMetaData.Plan, {headers: headers})
            .toPromise()
            .then(response => {
                this.logger.log('[application.service][startProvisioning]', 'Server responded to post: ' + response);
                return response.json();
            })
            .catch(err => this.logger.handleError('[application.service][startProvisioning]', err));
    }

    pollForServiceTemplateInstanceCreation(pollURL: string): Promise<string> {
        const waitTime = 10000;

        this.logger.log('[application.service][pollForServiceTemplateInstanceCreation]',
            'Polling for service template instance creation: ' + pollURL);
        return this.http.get(pollURL, {headers: this.configService.getDefaultAcceptJSONHeaders()})
            .toPromise()
            .then(result => {
                const references = result.json().References as Array<ResourceReference>;
                this.logger.log('[application.service][pollForServiceTemplateInstanceCreation]',
                    'Poll returned: ' + JSON.stringify(references));
                if (references.length === 2) {
                    this.logger.log('[application.service][pollForServiceTemplateInstanceCreation]',
                        'Found 2 entries in references list now searching for reference to new ServiceTemplateInstance');
                    for (const ref of references) {
                        if (!ReferenceHelper.isSelfReference(ref)) {
                            this.logger.log('[application.service][pollForServiceTemplateInstanceCreation]',
                                'Found new ServiceTemplateInstance: ' + JSON.stringify(ref));
                            return ref.href;
                        }
                    }
                    // ohoh, we did not find a reference that is not self reference
                    this.logger.handleError('[application.service][pollForServiceTemplateInstanceCreation]', new Error('There are only self references in returned list of ServiceTemplateInstances'));  // tslint:disable-line:max-line-length
                } else {
                    // ServiceTemplateInstance not created yet, query again
                    this.logger.log('[application.service][pollForServiceTemplateInstanceCreation]',
                        'ServiceTemplateInstance not created yet, polling again in ' + waitTime + ' ms');
                    return new Promise((resolve) => setTimeout(() => resolve(
                        this.pollForServiceTemplateInstanceCreation(pollURL)), waitTime)
                    );
                }
            })
            .catch(err => this.logger.handleError('[application.service][pollForServiceTemplateInstanceCreation]', err));
    }

    getPlanOutput(url: string): Promise<PlanParameters> {
        return this.http.get(url, {headers: this.configService.getDefaultAcceptJSONHeaders()})
            .toPromise()
            .then(response => response.json())
            .catch(err => this.logger.handleError('[application.service][getPlanoutput]', err));
    }

    /**
     * Poll for finishing of a buildplan
     * @param pollUrl URL retrieved from buildplan call (POST to CSAR resource)
     * @returns {Promise<PlanParameters>}
     */
    pollForPlanFinish(pollUrl: string): Promise<PlanInstance> {
        const reqOpts = new RequestOptions({headers: this.configService.getDefaultAcceptJSONHeaders()});
        this.logger.log('[application.service][pollForPlanFinish]', 'Polling for plan result');
        const waitTime = 10000;
        return this.http.get(pollUrl, reqOpts)
            .toPromise()
            .then(response => {
                const res = response.json() as PlanInstance;

                if (res.PlanInstance && res.PlanInstance.State === 'running') {
                    this.logger.log('[application.service][pollForPlanFinish]', 'Plan still running, polling again in ' + waitTime + ' ms');
                    return new Promise((resolve) => setTimeout(() => resolve(this.pollForPlanFinish(pollUrl)), waitTime));
                } else {
                    // now fetch the output
                    this.logger.log('[application.service][pollForPlanFinish]', 'Plan finished with result ' + JSON.stringify(res));
                    return res;
                }
            })
            .catch(err => this.logger.handleError('[application.service][pollForPlanFinish]', err));
    }

    /**
     * Returns a list of service template instances of the given appID.
     * We fetch the first service template found for the given appID.
     * @param appID
     * @returns {Promise<Array<ResourceReference>>}
     */
    getServiceTemplateInstancesByAppID(appID: string): Observable<Array<ResourceReference>> {
        appID = this.fixAppID(appID);

        const reqOpts = new RequestOptions({headers: new Headers({'Accept': 'application/json'})});

        return this.getServiceTemplatePath(appID).first()
            .flatMap((url) => {
                const serviceTemplateInstancesURL = new Path(url)
                    .append('Instances')
                    .toString();

                return this.http.get(serviceTemplateInstancesURL, reqOpts)
                    .map(result => {
                        const refs = result.json().References as Array<ResourceReference>;
                        for (const ref in refs) {
                            if (refs[ref].title.toLowerCase() === 'self') {
                                refs.splice(+ref, 1);
                            }
                        }
                        return refs;
                    })
                    .catch(reason => this.logger.handleError('[application.service][getServiceTemplateInstancesByAppID]', reason));
            })
            .catch((reason: any) => this.logger.handleObservableError('[application.service][getServiceTemplateInstancesByAppID]', reason));
    }

    getProvisioningStateOfServiceTemplateInstances(refs: Array<ResourceReference>): Promise<Array<any>> {
        const reqOpts = new RequestOptions({headers: new Headers({'Accept': 'application/json'})});
        const promises = <any>[];

        for (const ref of refs) {
            const statusURL = new Path(ref.href)
                .append('State')
                .toString();
            promises.push(this.http.get(statusURL, reqOpts).toPromise().then(result => result.json()));
        }

        return Promise.all(promises);
    }

    getPropertiesOfServiceTemplateInstances(refs: Array<ResourceReference>): Observable<Array<ApplicationInstanceProperties>> {
        const reqOpts = new RequestOptions({headers: new Headers({'Accept': 'application/json'})});
        const observables = <any>[];

        for (const ref of refs) {
            const url = new Path(ref.href)
                .append('Properties')
                .toString();
            observables.push(this.http.get(url, reqOpts).retry(3)
                .map(result => {
                    const properties = result.json();
                    const selfServiceUrl = ObjectHelper.getObjectsByPropertyDeep(properties, 'selfserviceApplicationUrl');
                    const instanceProperties = new ApplicationInstanceProperties(ref, result.json());
                    if (selfServiceUrl.length > 0) {
                        instanceProperties.selfServiceApplicationURL = selfServiceUrl[0]['selfserviceApplicationUrl'];
                    }
                    return instanceProperties;
                }));
        }

        return Observable.forkJoin<ApplicationInstanceProperties>(observables);
    }

    /**
     * Returns a list of all service instances
     * @returns {Promise<Array<ResourceReference>>}
     */
    getAllInstances(): Promise<Array<ResourceReference>> {
        const instanceAPIUrl = new Path(this.configService.getContainerAPIURL())
            .append('containerapi')
            .append('instancedata')
            .append('serviceInstances')
            .toString();
        const reqOpts = new RequestOptions({headers: new Headers({'Accept': 'application/json'})});
        return this.http.get(instanceAPIUrl, reqOpts)
            .toPromise()
            .then(result => result.json().References as Array<ResourceReference>)
            .catch(err => this.logger.handleError('[application.service][getAllInstances]', err));
    }

    /**
     * Checks if an App with given appID is already deployed in container.
     * Returns true if already deployed and false if not, so be sure to handle this in <then callback>
     * @param appID
     * @returns {Promise<boolean>}
     */
    isAppDeployedInContainer(appID: string): Promise<boolean> {
        appID = this.fixAppID(appID);

        const csarUrl = new Path(this.configService.getContainerAPIURL())
            .append('csars')
            .append(appID)
            .toString();
        const headers = new Headers({'Accept': 'application/json'});
        return this.http.get(csarUrl, {headers: headers})
            .toPromise()
            .then(response => true)
            .catch(reason => false);
    }

    /**
     * Retrieve app description
     * @param appID CSAR id/name (e.g. XYZ.csar)
     * @returns {Observable<Application>}
     */
    getAppDescription(appID: string): Observable<Application> {
        appID = this.fixAppID(appID);
        const metaDataUrl = new Path(this.configService.getContainerAPIURL())
            .append('csars')
            .append(appID)
            .toString();

        const headers = new Headers({'Accept': 'application/json'});

        return this.http.get(metaDataUrl, {headers: headers})
            .map((response: Response) => response.json())
            .map((response: Object) => {
                const app: Application = new Application();
                app.id = response['id'].indexOf('.csar') > -1 ?
                    response['id'].split('.')[0] : response['id'];
                app.description = response['description'];
                app.name = response['name'];
                app.displayName = response['display_name'];
                app.version = response['version'];
                app.authors = response['authors'];
                app.iconUrl = response['icon_url'];
                app.imageUrl = response['image_url'];
                // Todo: Add screenshots to new api
                app.screenshots = response['screenshot_urls'];
                return app;
            })
            .catch((err: any) => this.logger
                .handleObservableError('[application.service][getAppDescription]', err));
    }
}

class CsarReference {
    constructor(public id: string, public link: string) {
    }
}
