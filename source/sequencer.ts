import { createDeferred, Deferred } from "./deferred";
import { getSequencerSettings, SequencerConfig } from "./settings";
import { advanceIndex, getOffset } from "./loop";
import { createQueueItem, split, insert, process, QueueItems, indexOf, QueueItem } from "./queue";
import { createScheduleResult, result_type, ScheduleResult } from "./schedule";


type onDispatch = (result:ScheduleResult) => void;
type settle<T> = (val:T) => Promise<T>;

export interface Sequencer {
	register() : number;
	schedule(id:number, fn:onDispatch) : void;
	resolve(id:number) : Promise<ScheduleResult>;
	immediate() : Promise<ScheduleResult>;
	align<T>() : settle<T>;
	assign<T>(p:Promise<T>) : Promise<T>;
}


async function defer<T>(fn:() => T) : Promise<T> {
	await Promise.resolve();

	return fn();
}

export function createSequencer(config?:SequencerConfig) : Sequencer {
	const settings = getSequencerSettings(config);

	let next = settings.firstId;
	let last = settings.firstId;
	let queue:QueueItems = [];
	let scheduled = 0;

	function advanceQueue() : void {
		const pieces = split(queue, last, settings);

		queue = pieces.partial;
		last = advanceIndex(last, pieces.numIds);
		scheduled += pieces.sequential.length;

		defer(process.bind(null, pieces.sequential)).then(num => { scheduled -= num; });
	}

	function forwardQueue(item:QueueItem) : void {
		const index = indexOf(queue, item);

		if (index === -1) return;

		last = item.id;

		advanceQueue();
	}

	return {
		register() : number {
			const res = next;

			next = advanceIndex(next);

			return res;
		},
		schedule(id:number, fn:onDispatch) : void {
			const offset = getOffset(last, id);

			if (offset < 0 || getOffset(next, id) >= 0) {
				const res = createScheduleResult(id, result_type.late);

				if (scheduled === 0) fn(res);
				else defer(fn.bind(null, res));
			}
			else if (scheduled === 0 && offset === 0 && queue.length === 0) {
				last = advanceIndex(last);

				fn(createScheduleResult(id, result_type.immediate));
			}
			else {
				const item = createQueueItem(id, fn);

				queue = insert(queue, item);

				advanceQueue();

				if (Number.isFinite(settings.maxDelay)) {
					const index = indexOf(queue, item);

					if (index === 0 || index > 0 && getOffset(queue[index - 1].id, id) > 1) {
						setTimeout(forwardQueue.bind(null, item), settings.maxDelay);
					}
				}
			}
		},
		resolve(id:number) : Promise<ScheduleResult> {
			const deferred:Deferred<ScheduleResult, void> = createDeferred();

			this.schedule(id, deferred.resolve);

			return deferred.promise;
		},
		immediate(this:Sequencer) : Promise<ScheduleResult> {
			return this.resolve(this.register());
		},
		align<T>(this:Sequencer) : settle<T> {
			const id = this.register();

			return val => this.resolve(id).then(() => val);
		},
		assign<T>(this:Sequencer, p:Promise<T>) : Promise<T> {
			return p.then(this.align());
		}
	};
}
