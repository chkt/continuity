import { createDeferred, Deferred } from "./deferred";
import { getSequencerSettings, SequencerConfig } from "./settings";
import { advanceIndex, getOffset } from "./loop";
import { createQueueItem, flush, insert, QueueItems } from "./queue";
import { createScheduleResult, result_type, ScheduleResult } from "./schedule";


type settle<T> = (val:T) => Promise<T>;

export interface Sequencer {
	register() : number;
	schedule(id:number) : Promise<ScheduleResult>;
	immediate() : Promise<ScheduleResult>;
	align<T>() : settle<T>;
	assign<T>(p:Promise<T>) : Promise<T>;
}


export function createSequencer(config?:SequencerConfig) : Sequencer {
	const settings = getSequencerSettings(config);

	let next = settings.next;
	let last = settings.next;
	let queue:QueueItems = [];
	let foo = 0;

	return {
		register() : number {
			const res = next;

			next = advanceIndex(next);

			return res;
		},
		schedule(id:number) : Promise<ScheduleResult> {
			const offset = getOffset(last, id);

			if (offset < 0 || getOffset(next, id) >= 0) return Promise.resolve(createScheduleResult(id, result_type.late));
			else if (offset === 0 && queue.length === 0 && foo === 0) {
				last = advanceIndex(last);

				return Promise.resolve(createScheduleResult(id, result_type.immediate));
			}
			else {
				const deferred:Deferred<ScheduleResult, void> = createDeferred();
				const flushed = flush(insert(queue, createQueueItem(id, deferred.resolve)), last);

				queue = flushed.remain;
				last = advanceIndex(last, flushed.num);
				foo += flushed.num;

				flushed.done.then(num => { foo -= num; });

				return deferred.promise;
			}
		},
		immediate(this:Sequencer) : Promise<ScheduleResult> {
			return this.schedule(this.register());
		},
		align<T>(this:Sequencer) : settle<T> {
			const id = this.register();

			return val => this.schedule(id).then(() => val);
		},
		assign<T>(this:Sequencer, p:Promise<T>) : Promise<T> {
			return p.then(this.align());
		}
	};
}
