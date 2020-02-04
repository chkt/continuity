import * as assert from 'assert';
import { describe, it } from 'mocha';

import { createSequencer } from "../source/sequencer";
import { result_type, ScheduleResult } from "../source/schedule";


describe('register', () => {
	it('should return sequential ids', () => {
		const sequencer = createSequencer();

		assert.strictEqual(sequencer.register(), 0);
		assert.strictEqual(sequencer.register(), 1);
		assert.strictEqual(sequencer.register(), 2);
	});

	it ('should accept a configurable start id', () => {
		assert.strictEqual(createSequencer({ next : 1 }).register(), 1);
		assert.strictEqual(createSequencer({ next : -1 }).register(), 0);
		assert.strictEqual(
			createSequencer({ next : Number.MAX_SAFE_INTEGER - 1}).register(),
			Number.MAX_SAFE_INTEGER - 1
		);
		assert.strictEqual(
			createSequencer({ next : Number.MAX_SAFE_INTEGER }).register(),
			0
		);
	});

	it('should wrap ids around safe integer boundaries', () => {
		const sequencer = createSequencer({
			next : Number.MAX_SAFE_INTEGER - 2
		});

		assert.strictEqual(sequencer.register(), Number.MAX_SAFE_INTEGER - 2);
		assert.strictEqual(sequencer.register(), Number.MAX_SAFE_INTEGER - 1);
		assert.strictEqual(sequencer.register(), 0);
	});
});

describe('schedule', () => {
	function assertResult(res:ScheduleResult, id:number, type:result_type) {
		assert.deepStrictEqual(res, { id, type });
	}

	function assertAll(
		items:ReadonlyArray<Promise<ScheduleResult>>,
		types:ReadonlyArray<result_type>
	) : Promise<number[]> {
		const order:number[] = [];

		return new Promise(resolve => {
			items.forEach((p, index) => {
				p.then(res => {
					assert.deepStrictEqual(res, { id : index, type : types[index] });
					order.push(res.id);

					if (order.length === items.length) resolve(order);
				});
			});
		});
	}

	it('should schedule in-order calls immediately', () => {
		const sequencer = createSequencer({ next : Number.MAX_SAFE_INTEGER - 1 });
		const pa = sequencer.immediate();
		const pb = sequencer.immediate();
		const tokens:string[] = [];

		pa.then(res => {
			assertResult(res, Number.MAX_SAFE_INTEGER - 1, result_type.immediate);
			tokens.push('a');
		});
		pb.then(res => {
			assertResult(res, 0, result_type.immediate);
			tokens.push('b');
		});

		return Promise
			.all([ pa, pb ])
			.then(() => {
				assert.deepStrictEqual(tokens, [ 'a', 'b' ]);
			});
	});

	it('should schedule out-of-order calls asynchronously', () => {
		const sequencer = createSequencer({ next : Number.MAX_SAFE_INTEGER - 1 });
		const ida = sequencer.register();
		const idb = sequencer.register();
		const tokens:string[] = [];

		const pb = sequencer.schedule(idb);
		const pc = sequencer.immediate();
		const pa = sequencer.schedule(ida);

		pa.then(res => {
			assertResult(res, Number.MAX_SAFE_INTEGER - 1, result_type.queued);
			tokens.push('a');
		});
		pb.then(res => {
			assertResult(res, 0, result_type.queued);
			tokens.push('b');
		});
		pc.then(res => {
			assertResult(res, 1, result_type.queued);
			tokens.push('c');
		});

		return Promise
			.all([ pa, pb, pc ])
			.then(() => {
				assert.deepStrictEqual(tokens, [ 'a', 'b', 'c' ]);
			});
	});

	it('should immediately schedule recursive calls during in-order processing', () => {
		const sequencer = createSequencer({ next : Number.MAX_SAFE_INTEGER - 1 });
		const tokens:string[] = [];

		return sequencer.immediate()
			.then(ret => {
				assertResult(ret, Number.MAX_SAFE_INTEGER - 1, result_type.immediate);
				tokens.push('a');

				return sequencer.immediate().then(r2 => {
					assertResult(r2, 0, result_type.immediate);
					tokens.push('b');
				});
			})
			.then(() => {
				assert.deepStrictEqual(tokens, [ 'a', 'b' ]);
			});
	});

	it('should asynchronously schedule recursive calls during out-of-order processing', () => {
		const sequencer = createSequencer({ next : Number.MAX_SAFE_INTEGER - 2 });
		const ida = sequencer.register();
		const tokens:string[] = [];

		const pb = sequencer.immediate().then(ret => {
			assertResult(ret, Number.MAX_SAFE_INTEGER - 1, result_type.queued);
			tokens.push('b');
		});

		const pa = sequencer.schedule(ida).then(ret => {
			assertResult(ret, Number.MAX_SAFE_INTEGER - 2, result_type.queued);
			tokens.push('a');

			return sequencer.immediate().then(ret2 => {
				assertResult(ret2, 0, result_type.queued);
				tokens.push('c');
			});
		});

		return Promise
			.all([ pa, pb ])
			.then(() => {
				assert.deepStrictEqual(tokens, ['a', 'b', 'c']);
			});
	});

	it('should handle arbitrary ids outside schedule', () => {
		const sequencer = createSequencer({ next : 0 });
		const pa = sequencer.schedule(Number.MAX_SAFE_INTEGER - 1);
		const pb = sequencer.schedule(1);
		const pc = sequencer.schedule(0);
		const tokens:string[] = [];

		pa.then(ret => {
			assertResult(ret, Number.MAX_SAFE_INTEGER - 1, result_type.late);
			tokens.push('a');
		});
		pb.then(ret => {
			assertResult(ret, 1, result_type.late);
			tokens.push('b');
		});
		pc.then(ret => {
			assertResult(ret, 0, result_type.late);
			tokens.push('c');
		});

		return Promise
			.all([ pa, pb ])
			.then(() => {
				assert.deepStrictEqual(tokens, [ 'a', 'b', 'c' ]);
			});
	});

	it('should handle arbitrary ids within schedule', () => {
		const sequencer = createSequencer({ next : Number.MAX_SAFE_INTEGER - 1});
		const ida = sequencer.register();
		const idb = sequencer.register();

		const pd = sequencer.immediate();
		const pc = sequencer.schedule(0);
		const pb = sequencer.schedule(idb);
		const pa = sequencer.schedule(ida);
		const tokens:string[] = [];

		pa.then(ret => {
			assertResult(ret, Number.MAX_SAFE_INTEGER - 1, result_type.queued);
			tokens.push('a');
		});
		pb.then(ret => {
			assertResult(ret, 0, result_type.queued);
			tokens.push('b');
		});
		pc.then(ret => {
			assertResult(ret, 0, result_type.queued);
			tokens.push('c');
		});
		pd.then(ret => {
			assertResult(ret, 1, result_type.queued);
			tokens.push('d');
		});

		return Promise
			.all([ pa, pb, pc, pd ])
			.then(() => {
				assert.deepStrictEqual(tokens, [ 'a', 'b', 'c', 'd' ]);
			});
	});

	it('should handle queue gaps during out-of-order processing', () => {
		const sequencer = createSequencer();
		const ida = sequencer.register();
		const idb = sequencer.register();
		const idc = sequencer.register();

		const pd = sequencer.immediate();
		const pb = sequencer.schedule(idb);
		const pa = sequencer.schedule(ida);
		const tokens:string[] = [];

		pa.then(ret => {
			assertResult(ret, 0, result_type.queued);
			tokens.push('a');
		});
		pb.then(ret => {
			assertResult(ret, 1, result_type.queued);
			tokens.push('b');
		});
		pd.then(ret => {
			assertResult(ret, 3, result_type.queued);
			tokens.push('d');
		});

		return Promise.all([ pa, pb ]).then(() => {
			const pc = sequencer.schedule(idc).then(ret => {
				assertResult(ret, 2, result_type.queued);
				tokens.push('c');
			});

			return Promise.all([ pc, pd ]).then(() => {
				assert.deepStrictEqual(tokens, [ 'a', 'b', 'c', 'd' ]);
			});
		});
	});

	it('should limit the ratio of blocked ids', () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxBlocked : 1 });
		const ida = sequencer.register();
		const pb = sequencer.immediate(), pc = sequencer.immediate();

		return assertAll(
			[ sequencer.schedule(ida), pb, pc ],
			[ late, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 2, 0 ]);
			});
	});

	it('should limit the ratio of blocked ids with arbitrary gaps', () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxBlocked : 1 });
		const ida = sequencer.register();
		const pb = sequencer.immediate();
		const idc = sequencer.register();
		const pd = sequencer.immediate(), pe = sequencer.immediate();
		const pc = sequencer.schedule(idc);

		return assertAll(
			[ sequencer.schedule(ida), pb, pc, pd, pe ],
			[ late, queued, late, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 3, 4, 2, 0 ]);
			});
	});

	it('should limit the ratio of blocked ids sequentially', () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxBlocked : 1 });
		const ida = sequencer.register();
		const pb = sequencer.immediate();
		const idc = sequencer.register(), idd = sequencer.register();
		const pe = sequencer.immediate();
		const pc = sequencer.schedule(idc), pd = sequencer.schedule(idd);

		return assertAll(
			[sequencer.schedule(ida), pb, pc, pd, pe ],
			[ late, queued, queued, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 2, 3, 4, 0 ]);
			});
	});
});

describe('align', () => {
	it('should provide syntactic sugar for inlining register/resolve', () => {
		const sequencer = createSequencer();
		const callOrder:string[] = [];
		const runOrder:string[] = [];

		const pa = new Promise(resolve => setTimeout(resolve, 0))
			.then(() => callOrder.push('a') && 'a')
			.then(sequencer.align())
			.then(val => {
				runOrder.push(val as string);
			});

		const pb = Promise.resolve()
			.then(() => callOrder.push('b') && 'b')
			.then(sequencer.align())
			.then(val => {
				runOrder.push(val as string);
			});

		return Promise.all([ pa, pb ]).then(() => {
			assert.deepStrictEqual(callOrder, [ 'b', 'a' ]);
			assert.deepStrictEqual(runOrder, [ 'a', 'b' ]);
		});
	});
});

describe('assign', () => {
	it('should provide syntactic sugar for inlining align', () => {
		const sequencer = createSequencer();
		const callOrder:string[] = [];
		const runOrder:string[] = [];

		const pa = sequencer.assign(
			new Promise(resolve => setTimeout(resolve, 0))
				.then(() => callOrder.push('a') && 'a')
		).then(val => runOrder.push(val as string));

		const pb = sequencer.assign(
			Promise.resolve().then(() => callOrder.push('b') && 'b')
		).then(val => runOrder.push(val as string));

		return Promise.all([ pa, pb ]).then(() => {
			assert.deepStrictEqual(callOrder, [ 'b', 'a' ]);
			assert.deepStrictEqual(runOrder, [ 'a', 'b' ]);
		});
	});
});
