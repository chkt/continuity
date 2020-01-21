import * as assert from 'assert';
import { describe, it } from 'mocha';

import * as m from '../source/index';


describe('module', () => {
	it('should provide a reference to createSequencer', () => {
		const sequencer = m.createSequencer();

		return sequencer
			.immediate()
			.then(ret => {
				assert.deepStrictEqual(ret, {
					id: 0,
					type: m.result_type.immediate
				});
			});
	});
});
