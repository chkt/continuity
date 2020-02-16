import * as assert from 'assert';
import { describe, it } from 'mocha';

import { createSequencer, Sequencer } from "../source/sequencer";
import { result_type, ScheduleResult } from "../source/schedule";


describe('register', () => {
	it('should return sequential ids', () => {
		const sequencer = createSequencer();

		assert.strictEqual(sequencer.register(), 0);
		assert.strictEqual(sequencer.register(), 1);
		assert.strictEqual(sequencer.register(), 2);
	});

	it ('should accept a configurable start id', () => {
		assert.strictEqual(createSequencer({ firstId : 1 }).register(), 1);
		assert.strictEqual(createSequencer({ firstId : -1 }).register(), 0);
		assert.strictEqual(
			createSequencer({ firstId : Number.MAX_SAFE_INTEGER - 1}).register(),
			Number.MAX_SAFE_INTEGER - 1
		);
		assert.strictEqual(
			createSequencer({ firstId : Number.MAX_SAFE_INTEGER }).register(),
			0
		);
	});

	it('should wrap ids around safe integer boundaries', () => {
		const sequencer = createSequencer({
			firstId : Number.MAX_SAFE_INTEGER - 2
		});

		assert.strictEqual(sequencer.register(), Number.MAX_SAFE_INTEGER - 2);
		assert.strictEqual(sequencer.register(), Number.MAX_SAFE_INTEGER - 1);
		assert.strictEqual(sequencer.register(), 0);
	});
});

describe('schedule', () => {
	function register(target:Sequencer, num:number) : number[] {
		const res:number[] = [];

		for (let i = 0; i < num; i += 1) res.push(target.register());

		return res;
	}

	function schedule(target:Sequencer, ...ids:number[]) : Promise<ScheduleResult>[] {
		const res:Promise<ScheduleResult>[] = [];

		for (const id of ids) res.push(target.resolve(id));

		return res;
	}

	function immediate(target:Sequencer, num:number) : Promise<ScheduleResult>[] {
		const res:Promise<ScheduleResult>[] = [];

		for (let i = num; i > 0; i -= 1) res.push(target.immediate());

		return res;
	}

	function delay(ms:number) : (val:number[]) => Promise<number[]> {
		return val => {
			return new Promise(resolve => {
				setTimeout(resolve.bind(null, val), ms);
			})
		};
	}

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

	function assertNext(fn:() => [
		ReadonlyArray<Promise<ScheduleResult>>,
		ReadonlyArray<result_type>,
		ReadonlyArray<number>
	]) : (order:number[]) => Promise<number[]> {
		return order => {
			const [ items, types, ids ] = fn();

			items.forEach((p, index) => {
				p.then(res => {
					const id = index < ids.length ? ids[index] : index;
					const type = index < types.length ? types[index] : result_type.immediate;

					assert.deepStrictEqual(res, { id, type });

					order.push(res.id);
				});
			});

			return Promise.resolve(order);
		};
	}

	function assertOrder(expect:number[]) : (order:number[]) => Promise<number[]> {
		return async order => {
			assert.deepStrictEqual(order, expect);

			return order;
		};
	}

	it('should resolve in-order calls immediately', () => {
		const sequencer = createSequencer({ firstId : Number.MAX_SAFE_INTEGER - 1 });
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

	it('should resolve out-of-order calls asynchronously', () => {
		const sequencer = createSequencer({ firstId : Number.MAX_SAFE_INTEGER - 1 });
		const ida = sequencer.register();
		const idb = sequencer.register();
		const tokens:string[] = [];

		const pb = sequencer.resolve(idb);
		const pc = sequencer.immediate();
		const pa = sequencer.resolve(ida);

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

	it('should immediately resolve recursive calls during in-order processing', () => {
		const sequencer = createSequencer({ firstId : Number.MAX_SAFE_INTEGER - 1 });
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

	it('should asynchronously resolve recursive calls during out-of-order processing', () => {
		const sequencer = createSequencer({ firstId : Number.MAX_SAFE_INTEGER - 2 });
		const ida = sequencer.register();
		const tokens:string[] = [];

		const pb = sequencer.immediate().then(ret => {
			assertResult(ret, Number.MAX_SAFE_INTEGER - 1, result_type.queued);
			tokens.push('b');
		});

		const pa = sequencer.resolve(ida).then(ret => {
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
		const sequencer = createSequencer({ firstId : 0 });
		const pa = sequencer.resolve(Number.MAX_SAFE_INTEGER - 1);
		const pb = sequencer.resolve(1);
		const pc = sequencer.resolve(0);
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
		const sequencer = createSequencer({ firstId : Number.MAX_SAFE_INTEGER - 1});
		const ida = sequencer.register();
		const idb = sequencer.register();

		const pd = sequencer.immediate();
		const pc = sequencer.resolve(0);
		const pb = sequencer.resolve(idb);
		const pa = sequencer.resolve(ida);
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
		const pb = sequencer.resolve(idb);
		const pa = sequencer.resolve(ida);
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
			const pc = sequencer.resolve(idc).then(ret => {
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
		const sequencer = createSequencer({ maxRatio : 1 });
		const ida = sequencer.register();
		const pb = sequencer.immediate(), pc = sequencer.immediate();

		return assertAll(
			[ sequencer.resolve(ida), pb, pc ],
			[ late, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 2, 0 ]);
			});
	});

	it('should limit the ratio of blocked ids with arbitrary gaps', () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxRatio : 1 });
		const ida = sequencer.register();
		const pb = sequencer.immediate();
		const idc = sequencer.register();
		const pd = sequencer.immediate(), pe = sequencer.immediate();
		const pc = sequencer.resolve(idc);

		return assertAll(
			[ sequencer.resolve(ida), pb, pc, pd, pe ],
			[ late, queued, late, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 3, 4, 2, 0 ]);
			});
	});

	it('should limit the ratio of blocked ids sequentially', () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxRatio : 1 });
		const ida = sequencer.register();
		const pb = sequencer.immediate();
		const idc = sequencer.register(), idd = sequencer.register();
		const pe = sequencer.immediate();
		const pc = sequencer.resolve(idc), pd = sequencer.resolve(idd);

		return assertAll(
			[sequencer.resolve(ida), pb, pc, pd, pe ],
			[ late, queued, queued, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 2, 3, 4, 0 ]);
			});
	});

	it('should limit the delay for blocked ids', async () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxDelay : 100 });

		const i0 = sequencer.register();
		const p1 = sequencer.immediate();
		const i2 = sequencer.register();
		const p3 = sequencer.immediate();

		return Promise.resolve([])
			.then(assertNext(() => [[ p1, p3 ], [ queued, queued ], [ 1, 3]]))
			.then(delay(120))
			.then(assertNext(() => [ schedule(sequencer, i2, i0), [ late, late ], [ 2, 0 ]]))
			.then(assertOrder([ 1, 3, 2, 0 ]));
	});

	it('should limit the delay for blocked ids with arbitrary gaps', async () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxDelay : 100 });

		const i0 = sequencer.register();
		let i2:number;

		return Promise.resolve([])
			.then(assertNext(() => [[ sequencer.immediate() ], [ queued ], [ 1 ]]))
			.then(delay(60))
			.then(assertNext(() => {
				i2 = sequencer.register();

				return [[ sequencer.immediate() ], [ queued ], [ 3 ]];
			}))
			.then(delay(60))
			.then(assertNext(() => [[ sequencer.resolve(i0) ], [ late ], [ 0 ]]))
			.then(delay(60))
			.then(assertNext(() => [[ sequencer.resolve(i2) ], [ late ], [ 2 ]]))
			.then(assertOrder([ 1, 0, 3, 2 ]));
	});

	it('should limit the ratio & delay for blocked ids with delay unblocking', async () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxRatio : 1, maxDelay : 100 });

		const [ ida, idb ] = register(sequencer, 2);
		let idd:number;

		return Promise.resolve([])
			.then(assertNext(() => [[ sequencer.immediate() ], [ queued ], [ 2 ]]))
			.then(delay(60))
			.then(assertNext(() => {
				idd = sequencer.register();

				return [ immediate(sequencer, 2), [ queued, queued ], [ 4, 5 ]];
			}))
			.then(delay(60))
			.then(assertNext(() => [ schedule(sequencer, idd, idb, ida), [ late, late, late ], [ 3, 1, 0 ] ]))
			.then(assertOrder([ 2, 4, 5, 3, 1, 0 ]));
	});

	it('should limit the ratio & delay for blocked ids with ratio unblocking', async () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxRatio : 1, maxDelay : 100 });

		const [ ida, idb ] = register(sequencer, 2);
		let idd:number;

		return Promise.resolve([])
			.then(assertNext(() => [[ sequencer.immediate() ], [ queued ], [ 2 ]]))
			.then(delay(60))
			.then(assertNext(() => {
				idd = sequencer.register();

				return [[ sequencer.immediate(), sequencer.resolve(idb) ], [ queued, queued ], [ 4, 1 ]];
			}))
			.then(delay(60))
			.then(assertOrder([ 1, 2 ]))
			.then(delay(60))
			.then(assertNext(() => [ schedule(sequencer, idd, ida), [ late, late ], [ 3, 0 ]]))
			.then(assertOrder([ 1, 2, 4, 3, 0 ]));
	});

	it('should process consecutive blocks with arbitrary gaps', () => {
		const queued = result_type.queued, late = result_type.late;
		const sequencer = createSequencer({ maxRatio : 1 });

		const [ ida, idb ] = register(sequencer, 2);
		const pc = sequencer.immediate();
		const [ idd, ide ] = register(sequencer, 2);
		const pf = sequencer.immediate();
		const [ pb, pe, pd, pa ] = schedule(sequencer, idb, ide, idd, ida);

		return assertAll(
			[ pa, pb, pc, pd, pe, pf ],
			[ late, queued, queued, late, queued, queued ]
		)
			.then(order => {
				assert.deepStrictEqual(order, [ 1, 2, 4, 5, 3, 0 ]);
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
