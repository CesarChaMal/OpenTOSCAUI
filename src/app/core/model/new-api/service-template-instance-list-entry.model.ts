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
 */
import { ResourceSupport } from './resource-support.model';

export class ServiceTemplateInstanceListEntry extends ResourceSupport{
    id: number;
    created_at: string;
    csar_id: string;
    service_template_id: string;
    state: string;
}