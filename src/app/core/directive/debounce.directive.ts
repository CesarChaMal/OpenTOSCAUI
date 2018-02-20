/**
 * Copyright (c) 2017 University of Stuttgart.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * and the Apache License 2.0 which both accompany this distribution,
 * and are available at http://www.eclipse.org/legal/epl-v10.html
 * and http://www.apache.org/licenses/LICENSE-2.0
 *
 * Contributors:
 *     Tobias Wältken
 */
import { debounce } from 'rxjs/operator/debounce';
import { Http } from '@angular/http';
import { async } from '@angular/core/testing/src/testing';

import { Directive, ElementRef, EventEmitter, Input, Output } from '@angular/core';
import { Observable } from 'rxjs/Observable';


@Directive({
    // tslint:disable-next-line:directive-selector
    selector: '[opentosca-ui-debounce]',
    
    // !!! DEPRECATED WARNING !!!
    // The use of the host parameter is deprecated! This might FAIL in the future
    // but I could not find another working alternative.
    
    // tslint:disable-next-line:use-host-property-decorator
    host: {
        '(input)': 'inputValue = $event.target.value'
    }
})
export class DebounceDirective {

    static readonly DEFAULT_DELAY = 300;

    // tslint:disable-next-line:no-input-rename
    @Input('opentosca-ui-debounce')
    delay?: number;

    @Output()
    debouncedValue: EventEmitter<string> = new EventEmitter<string>();

    inputValue: string;

    constructor(private elementRef: ElementRef, private http: Http) {
        Observable
            .fromEvent(elementRef.nativeElement, 'keyup')
            .map(() => this.inputValue)
            .debounceTime(this.delay ? this.delay : DebounceDirective.DEFAULT_DELAY)
            .distinctUntilChanged()
            .subscribe(input => {
                this.debouncedValue.emit(input);
            });
    }
}
